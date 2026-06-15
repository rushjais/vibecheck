import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GitHub OAuth callback: exchange the code for a token and store it on the user. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const scanId = url.searchParams.get("state") ?? "";

  const back = (suffix: string) =>
    NextResponse.redirect(new URL(`/scan/${scanId}${suffix}`, origin));

  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !code) {
    return back("?github=error");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return back("?github=unconfigured");
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/api/github/callback`,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenData.access_token) {
      return back("?github=error");
    }

    // Look up the GitHub login for display.
    const ghUserRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "LaunchGuard",
      },
    });
    const ghUser = (await ghUserRes.json()) as { login?: string };

    const admin = createServerClient();
    await admin
      .from("users")
      .update({
        github_token: tokenData.access_token,
        github_login: ghUser.login ?? null,
      })
      .eq("id", user.id);

    return back("?github=connected");
  } catch (err) {
    console.error("[github/callback] failed:", err);
    return back("?github=error");
  }
}
