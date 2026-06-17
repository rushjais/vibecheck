import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spend one scan credit to unlock a report's full findings. Requires sign-in.
 * The credit decrement is a compare-and-set so it can't double-spend, and an
 * already-unlocked scan is a no-op (no charge) — so refreshes are safe.
 *
 * This is the ONLY non-webhook path that sets scans.unlocked, and it can only
 * do so by consuming a credit the user actually paid for.
 */
export async function POST(request: Request) {
  const limited = await enforceApiRateLimit(request);
  if (limited) return limited;

  let body: { scan_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const scanId = typeof body.scan_id === "string" ? body.scan_id : "";
  if (!scanId) {
    return NextResponse.json({ error: "Missing scan_id." }, { status: 400 });
  }

  const {
    data: { user },
  } = await (await createSupabaseServer()).auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in.", code: "auth_required" },
      { status: 401 },
    );
  }

  const admin = createServerClient();

  const { data: scan } = await admin
    .from("scans")
    .select("unlocked, user_id")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  // Private scans can only be unlocked by their owner.
  if (scan.user_id !== null && scan.user_id !== user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Already unlocked → no charge.
  if (scan.unlocked) {
    return NextResponse.json({ unlocked: true });
  }

  // Compare-and-set decrement so concurrent unlocks can't double-spend.
  const { data: account } = await admin
    .from("users")
    .select("scan_credits")
    .eq("id", user.id)
    .maybeSingle();
  const credits = account?.scan_credits ?? 0;
  if (credits <= 0) {
    return NextResponse.json(
      { error: "You're out of scans.", code: "no_credits" },
      { status: 402 },
    );
  }

  const { data: spent } = await admin
    .from("users")
    .update({ scan_credits: credits - 1 })
    .eq("id", user.id)
    .eq("scan_credits", credits)
    .select("scan_credits");
  if (!spent || spent.length === 0) {
    return NextResponse.json(
      { error: "Please try again.", code: "retry" },
      { status: 409 },
    );
  }

  await admin.from("scans").update({ unlocked: true }).eq("id", scanId);

  return NextResponse.json({
    unlocked: true,
    credits_left: spent[0].scan_credits,
  });
}
