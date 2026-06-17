import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { logFunnelEvent } from "@/lib/analytics-server";
import { SCANS_PER_PURCHASE } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. On checkout.session.completed, grants SCANS_PER_PURCHASE
 * credits to metadata.userId. Signature is verified with STRIPE_WEBHOOK_SECRET
 * against the RAW body, and each event id is processed at most once (so
 * retries don't double-credit). Credits are ONLY granted here.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // constructEvent needs the raw, unparsed body.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error(
      "[stripe/webhook] signature verification failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (userId) {
      const admin = createServerClient();

      // Idempotency: claim this event id; if it was already processed, stop.
      const { data: claimed } = await admin
        .from("webhook_events")
        .upsert({ id: event.id }, { onConflict: "id", ignoreDuplicates: true })
        .select("id");
      if (!claimed || claimed.length === 0) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      const { data: account } = await admin
        .from("users")
        .select("scan_credits")
        .eq("id", userId)
        .maybeSingle();
      const current = account?.scan_credits ?? 0;

      const { error } = await admin
        .from("users")
        .update({ scan_credits: current + SCANS_PER_PURCHASE })
        .eq("id", userId);

      if (error) {
        console.error("[stripe/webhook] failed to grant credits:", error.message);
      } else {
        // Auto-spend one credit to unlock the report they bought from, so they
        // can read it immediately (net: SCANS_PER_PURCHASE - 1 left).
        const scanId = session.metadata?.scanId;
        if (scanId) {
          const { data: scan } = await admin
            .from("scans")
            .select("unlocked")
            .eq("id", scanId)
            .maybeSingle();
          if (scan && !scan.unlocked) {
            await admin
              .from("scans")
              .update({ unlocked: true })
              .eq("id", scanId);
            await admin
              .from("users")
              .update({ scan_credits: current + SCANS_PER_PURCHASE - 1 })
              .eq("id", userId);
          }
        }
        await logFunnelEvent({
          name: "checkout_completed",
          scanId: session.metadata?.scanId || null,
          userId,
          distinctId: userId,
          props: { session_id: session.id, credits: SCANS_PER_PURCHASE },
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
