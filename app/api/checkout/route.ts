import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { PRO_PRICE_CENTS } from "@/lib/pricing";
import { logFunnelEvent } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Checkout kickoff. Reached after the magic-link callback establishes a
 * session. Links the anonymous scan to the now-authenticated user, creates a
 * Stripe Checkout session, fires `checkout_started`, and redirects to Stripe.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const scanId = url.searchParams.get("scan");

  if (!scanId) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // Must be signed in (the magic-link flow guarantees this).
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(`/scan/${scanId}?auth=required`, origin),
    );
  }

  const admin = createServerClient();

  // Ensure a public.users row exists and link the anonymous scan to this user.
  await admin
    .from("users")
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: "id" });
  await admin
    .from("scans")
    .update({ user_id: user.id })
    .eq("id", scanId)
    .is("user_id", null);

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRO_PRICE_CENTS,
            recurring: { interval: "month" },
            product_data: {
              name: "LaunchGuard Pro",
              description:
                "Full report, one-click auto-fix PRs, and continuous monitoring.",
            },
          },
        },
      ],
      success_url: `${origin}/api/checkout/return?session_id={CHECKOUT_SESSION_ID}&scan=${scanId}`,
      cancel_url: `${origin}/scan/${scanId}?checkout=cancel`,
      metadata: { user_id: user.id, scan_id: scanId },
    });

    await logFunnelEvent({
      name: "checkout_started",
      scanId,
      userId: user.id,
      distinctId: user.id,
      props: { price_cents: PRO_PRICE_CENTS },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    console.error("[checkout] failed:", err);
    return NextResponse.redirect(
      new URL(`/scan/${scanId}?checkout=error`, origin),
    );
  }
}
