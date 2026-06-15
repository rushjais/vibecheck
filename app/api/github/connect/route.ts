import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start GitHub OAuth — ONLY for paid (Pro) users. Requests the minimum scope
 * (`public_repo`) needed to push a branch and open a PR on a public repo the
 * user has write access to. Free/anonymous users are bounced before any
 * write-scope prompt is shown.
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

  // Gate on Pro — never request write scope from someone who hasn't paid.
  const admin = createServerClient();
  const { data: row } = await admin
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  if (row?.plan !== "pro") {
    return NextResponse.redirect(new URL(`/scan/${scanId}?upgrade=1`, origin));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL(`/scan/${scanId}?github=unconfigured`, origin));
  }

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", "public_repo");
  authorize.searchParams.set("redirect_uri", `${origin}/api/github/callback`);
  authorize.searchParams.set("state", scanId);

  return NextResponse.redirect(authorize.toString());
}
