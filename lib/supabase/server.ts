import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Cookie-backed server client for Supabase Auth. Reads the logged-in user from
 * request cookies (route handlers can also write refreshed session cookies).
 *
 * Not to be confused with `createServerClient` in lib/supabase.ts, which is the
 * service-role admin client used for privileged writes.
 */

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "public-anon-key-not-configured";

export async function createSupabaseServer() {
  // Next 15: cookies() is async.
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components can't set cookies — that's fine, the middleware /
        // route handler that owns the response will. Swallow the error.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* read-only context */
        }
      },
    },
  });
}
