import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-IP rate limiting for scan creation, backed by Upstash Redis (in-memory
 * won't survive Vercel's serverless model). No-ops when the Upstash env vars
 * aren't set, so local dev and unconfigured deploys still work — mirroring how
 * analytics no-ops without a key.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRateLimitConfigured = Boolean(url && token);

const limiter: Ratelimit | null = isRateLimitConfigured
  ? new Ratelimit({
      redis: new Redis({ url: url as string, token: token as string }),
      limiter: Ratelimit.slidingWindow(5, "1 h"), // 5 scans per IP per hour
      prefix: "launchguard:scan",
    })
  : null;

/** Pull the client IP from x-forwarded-for (first hop), or "unknown". */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

/**
 * Returns whether the request is allowed. When Upstash isn't configured this
 * always allows (no-op).
 */
export async function checkScanRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!limiter) return { success: true };
  const { success } = await limiter.limit(ip);
  return { success };
}
