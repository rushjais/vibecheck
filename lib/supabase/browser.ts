"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Cookie-backed browser client for Supabase Auth (magic link).
 *
 * Distinct from the localStorage-based `supabase` client in lib/supabase.ts —
 * this one syncs the session into cookies so the server (route handlers,
 * server components) can read the logged-in user. Use it for anything auth.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "public-anon-key-not-configured";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowser() {
  if (!client) {
    client = createBrowserClient<Database>(url, anonKey);
  }
  return client;
}
