"use client";

import posthog from "posthog-js";

/**
 * Thin PostHog wrapper. Lazily initializes on first use in the browser and
 * no-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY isn't set, so local dev without
 * analytics configured still works.
 */

let initialized = false;

function client(): typeof posthog | null {
  if (typeof window === "undefined") return null;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  if (!initialized) {
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: false,
      autocapture: false,
    });
    initialized = true;
  }

  return posthog;
}

export function capture(
  event: string,
  props?: Record<string, unknown>,
): void {
  client()?.capture(event, props);
}
