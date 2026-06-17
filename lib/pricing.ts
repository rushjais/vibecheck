/** Client-safe pricing constants (no server SDK imports). */

// One-time purchase price label (the amount itself lives in the Stripe Price).
export const UNLOCK_PRICE_LABEL = "$9";

// $9 buys this many full-report unlocks ("scans"), credited to the account.
export const SCANS_PER_PURCHASE = 10;

// Free full scans a person gets (top-3 findings on public repos) before paying.
export const FREE_SCAN_LIMIT = 3;

// "10 full scans for $9"
export const PACK_LABEL = `${SCANS_PER_PURCHASE} full scans for ${UNLOCK_PRICE_LABEL}`;
