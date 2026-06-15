import { PostHog } from "posthog-node";
import { createServerClient } from "@/lib/supabase";

/**
 * Server-side funnel logging. Writes EACH event to BOTH the durable `events`
 * table (the source of truth for /admin/funnel) and PostHog. No-ops on the
 * PostHog side when no key is configured.
 */

let posthog: PostHog | null = null;

function client(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!posthog) {
    posthog = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthog;
}

export async function logFunnelEvent(opts: {
  name: string;
  scanId?: string | null;
  userId?: string | null;
  distinctId?: string;
  props?: Record<string, unknown>;
}): Promise<void> {
  const admin = createServerClient();

  const { error } = await admin.from("events").insert({
    name: opts.name,
    scan_id: opts.scanId ?? null,
    user_id: opts.userId ?? null,
    props: (opts.props ?? {}) as never,
  });
  if (error) {
    console.error(`[funnel] failed to record ${opts.name}:`, error.message);
  }

  const ph = client();
  if (ph) {
    ph.capture({
      distinctId: opts.distinctId ?? opts.userId ?? opts.scanId ?? "server",
      event: opts.name,
      properties: { ...opts.props, scan_id: opts.scanId },
    });
    try {
      await ph.flush();
    } catch {
      /* best-effort */
    }
  }
}
