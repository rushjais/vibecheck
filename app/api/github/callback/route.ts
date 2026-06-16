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
  const state = url.searchParams.get("state") ?? "";

  // state is "home" (or absent) for a home-page connect, or a scan id.
  const fromHome = !state || state === "home";
  const back = (suffix: string) =>
    NextResponse.redirect(
      new URL(fromHome ? `/${suffix}` : `/scan/${state}${suffix}`, origin),
    );

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

    // Upsert: magic-link sign-in only creates an auth.users row, so a
    // public.users row may not exist yet — UPDATE would touch zero rows and
    // silently drop the token. onConflict on the PK creates-or-updates.
    const admin = createServerClient();
    await admin.from("users").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        github_token: tokenData.access_token,
        github_login: ghUser.login ?? null,
      },
      { onConflict: "id" },
    );

    return back("?github=connected");
  } catch (err) {
    console.error("[github/callback] failed:", err);
    return back("?github=error");
  }
}
