import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Typed Supabase clients for LaunchGuard.
 *
 * - `supabase`        — browser/anon client, safe to use anywhere. Uses the
 *                       public anon key and respects Row Level Security.
 * - `createServerClient()` — server-only client using the service role key.
 *                       NEVER import this into a client component.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when both public Supabase env vars are present. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Don't throw at import time — that would crash SSR/build before anyone has
  // configured .env.local. Queries simply fail at call time instead.
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.local.example to .env.local and fill them in.",
  );
}

// createClient throws on an empty URL, which would break SSR/build before
// anyone configures env. Fall back to harmless placeholders; real calls just
// fail at runtime until .env.local is filled in.
const safeUrl = supabaseUrl || "https://placeholder.supabase.co";
const safeAnonKey = supabaseAnonKey || "public-anon-key-not-configured";

/** Typed anon client (browser + server-rendered reads). */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  safeUrl,
  safeAnonKey,
);

/**
 * Server-only client backed by the service role key. Bypasses RLS, so it must
 * only ever run on the server (route handlers, server actions, the scan
 * engine). Falls back to the anon key if no service role key is configured.
 */
export function createServerClient(): SupabaseClient<Database> {
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || safeAnonKey;

  return createClient<Database>(safeUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Next.js caches `fetch` by default, and supabase-js issues its requests
      // through fetch — without this, server reads return a stale cached row
      // and the scan appears stuck on "awaiting_report" forever. Opt every
      // PostgREST request out of the cache.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export type { Database } from "@/types/database";
