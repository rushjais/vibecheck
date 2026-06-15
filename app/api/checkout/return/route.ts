import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { logFunnelEvent } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Post-checkout return. Verifies the Stripe session was paid, flips the user's
 * plan to 'pro', unlocks all their findings, and fires `checkout_completed`
 * exactly once (guarded on the prior plan so a refresh doesn't double-count).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const sessionId = url.searchParams.get("session_id");
  const scanId = url.searchParams.get("scan");

  const back = (suffix: string) =>
    NextResponse.redirect(new URL(`/scan/${scanId ?? ""}${suffix}`, origin));

  if (!sessionId || !scanId) {
    return back("");
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid =
      session.payment_status === "paid" || session.status === "complete";
    const userId = session.metadata?.user_id;

    if (!paid || !userId) {
      return back("?checkout=incomplete");
    }

    const admin = createServerClient();

    // Was the user already pro? Drives once-only event firing.
    const { data: before } = await admin
      .from("users")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    // Flip to pro.
    await admin.from("users").update({ plan: "pro" }).eq("id", userId);

    // Make sure this scan is linked, then unlock every finding on the user's scans.
    await admin
      .from("scans")
      .update({ user_id: userId })
      .eq("id", scanId)
      .is("user_id", null);

    const { data: scans } = await admin
      .from("scans")
      .select("id")
      .eq("user_id", userId);
    const scanIds = (scans ?? []).map((s) => s.id);
    if (scanIds.length > 0) {
      await admin
        .from("findings")
        .update({ is_locked: false })
        .in("scan_id", scanIds);
    }

    if (before?.plan !== "pro") {
      await logFunnelEvent({
        name: "checkout_completed",
        scanId,
        userId,
        distinctId: userId,
        props: { session_id: sessionId },
      });
    }

    return back("?unlocked=1");
  } catch (err) {
    console.error("[checkout/return] failed:", err);
    return back("?checkout=error");
  }
}
