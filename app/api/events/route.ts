import { NextResponse } from "next/server";
import { logFunnelEvent } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only these client-originated funnel events may be recorded this way.
const ALLOWED = new Set(["scan_viewed", "unlock_clicked"]);

/**
 * Records a client-side funnel event into the `events` table (service role, so
 * it isn't blocked by RLS). The browser also fires PostHog directly for these,
 * so this endpoint only handles the durable table write (+ server PostHog).
 */
export async function POST(request: Request) {
  let body: { name?: unknown; scan_id?: unknown; props?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }

  const scanId = typeof body.scan_id === "string" ? body.scan_id : null;
  const props =
    body.props && typeof body.props === "object"
      ? (body.props as Record<string, unknown>)
      : {};

  await logFunnelEvent({ name, scanId, distinctId: scanId ?? undefined, props });

  return NextResponse.json({ ok: true });
}
