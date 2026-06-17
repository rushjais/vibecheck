import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { logFunnelEvent } from "@/lib/analytics-server";
import { enforceApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a one-time ($9) Stripe Checkout to buy a pack of full-report scans.
 * Credits are tied to the account, so sign-in is required. The webhook grants
 * the credits on payment; this route only opens Checkout.
 */
export async function POST(request: Request) {
  const limited = await enforceApiRateLimit(request);
  if (limited) return limited;

  const origin = new URL(request.url).origin;

  let body: { scan_id?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const scanId = typeof body.scan_id === "string" ? body.scan_id : "";

  // Credits are per-account → must be signed in.
  const {
    data: { user },
  } = await (await createSupabaseServer()).auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in to buy scans.", code: "auth_required" },
      { status: 401 },
    );
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error("[checkout] STRIPE_PRICE_ID not set");
    return NextResponse.json(
      { error: "Checkout isn't configured yet." },
      { status: 500 },
    );
  }

  // Make sure the user has a public.users row to credit later.
  const admin = createServerClient();
  await admin
    .from("users")
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: "id" });

  const returnPath = scanId ? `/scan/${scanId}?purchased=1` : `/?purchased=1`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}${returnPath}`,
      cancel_url: `${origin}${scanId ? `/scan/${scanId}` : "/"}?checkout=cancel`,
      metadata: { userId: user.id, scanId },
    });

    await logFunnelEvent({
      name: "checkout_started",
      scanId: scanId || null,
      userId: user.id,
      distinctId: user.id,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] failed:", err);
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 500 },
    );
  }
}
