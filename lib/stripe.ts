import Stripe from "stripe";

/**
 * Lazily construct the Stripe client so a missing key doesn't crash at import
 * time — only the routes that actually charge will fail (with a clear error).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(key);
}
