import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start GitHub OAuth — ONLY for paid (Pro) users. Requests the `repo` scope:
 * read access to private repo contents (so Pro users can scan private repos)
 * plus write access to open auto-fix PRs. Free/anonymous users are bounced
 * before any scope prompt is shown.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const scanId = url.searchParams.get("scan") ?? "";

  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/scan/${scanId}?auth=required`, origin));
  }

  // Friends-only test: any signed-in user may connect GitHub (no Pro gate).
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL(`/scan/${scanId}?github=unconfigured`, origin));
  }

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", "repo");
  authorize.searchParams.set("redirect_uri", `${origin}/api/github/callback`);
  authorize.searchParams.set("state", scanId);

  return NextResponse.redirect(authorize.toString());
}
