import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { FREE_SCAN_LIMIT } from "@/lib/pricing";

/**
 * Per-IP rate limiting backed by Upstash Redis (in-memory won't survive
 * Vercel's serverless model). No-ops when the Upstash env vars aren't set, so
 * local dev and unconfigured deploys still work — mirroring how analytics
 * no-ops without a key.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRateLimitConfigured = Boolean(url && token);

const redis = isRateLimitConfigured
  ? new Redis({ url: url as string, token: token as string })
  : null;

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

function makeLimiter(prefix: string, tokens: number, window: Window): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix,
  });
}

// Scan creation: the expensive path (clone + LLM). Its own tight bucket.
const scanLimiter = makeLimiter("launchguard:scan", 5, "1 h");
// Other sensitive endpoints (checkout, GitHub OAuth + API + auto-fix). Separate,
// more generous bucket so normal flows aren't blocked but abuse is.
const apiLimiter = makeLimiter("launchguard:api", 30, "1 h");
// Free full scans per person (by IP) before they must buy a pack. Long window
// so it acts as a near-total cap that still self-heals.
const freeScanLimiter = makeLimiter("vibecheck:free", FREE_SCAN_LIMIT, "30 d");

/** Pull the client IP from x-forwarded-for (first hop), or "unknown". */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

async function check(
  limiter: Ratelimit | null,
  ip: string,
): Promise<{ success: boolean }> {
  if (!limiter) return { success: true };
  const { success } = await limiter.limit(ip);
  return { success };
}

/** Rate limit for scan creation (5 / IP / hour). No-ops if unconfigured. */
export function checkScanRateLimit(ip: string): Promise<{ success: boolean }> {
  return check(scanLimiter, ip);
}

/** Rate limit for checkout + GitHub endpoints (30 / IP / hour). No-ops if unconfigured. */
export function checkApiRateLimit(ip: string): Promise<{ success: boolean }> {
  return check(apiLimiter, ip);
}

/**
 * Consume one of the IP's free full scans. `success: false` means they've used
 * their free allotment and must buy a pack. No-ops (always allows) if Upstash
 * isn't configured.
 */
export function consumeFreeScan(ip: string): Promise<{ success: boolean }> {
  return check(freeScanLimiter, ip);
}

/**
 * Guard helper for route handlers: returns a fresh 429 response when the IP is
 * over the API limit, or null to continue. A new response is created per call
 * (a NextResponse body can only be consumed once).
 */
export async function enforceApiRateLimit(
  request: Request,
): Promise<NextResponse | null> {
  const { success } = await checkApiRateLimit(clientIpFrom(request));
  if (success) return null;
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429 },
  );
}
