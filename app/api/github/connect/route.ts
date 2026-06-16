import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start GitHub OAuth for any signed-in user (friends-only test — no Pro gate).
 * Requests the `repo` scope: read access to private repo contents (to scan
 * private repos) plus write access to open auto-fix PRs.
 *
 * Works with or without a scan context: from a report page `scan=<id>` round-
 * trips back to that report; from the home page `scan=home` (or absent) round-
 * trips back to `/`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const scanParam = url.searchParams.get("scan") ?? "";
  const fromHome = !scanParam || scanParam === "home";
  // Where to send the user back on errors / after the flow.
  const homePath = "/";
  const scanPath = `/scan/${scanParam}`;

  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const dest = fromHome ? `${homePath}?auth=required` : `${scanPath}?auth=required`;
    return NextResponse.redirect(new URL(dest, origin));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    const dest = fromHome
      ? `${homePath}?github=unconfigured`
      : `${scanPath}?github=unconfigured`;
    return NextResponse.redirect(new URL(dest, origin));
  }

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", "repo");
  authorize.searchParams.set("redirect_uri", `${origin}/api/github/callback`);
  // state carries the return context: "home" or a scan id.
  authorize.searchParams.set("state", fromHome ? "home" : scanParam);

  return NextResponse.redirect(authorize.toString());
}
