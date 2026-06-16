import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List the signed-in user's GitHub repos (including private) using their stored
 * OAuth token. The token is used server-side only and never returned to the
 * client — we only expose { full_name, private, default_branch }.
 */
export async function GET() {
  const auth = createSupabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createServerClient();
  const { data: account } = await admin
    .from("users")
    .select("github_token")
    .eq("id", user.id)
    .maybeSingle();

  const token = account?.github_token;
  if (!token) {
    return NextResponse.json({ error: "GitHub not connected." }, { status: 401 });
  }

  try {
    const res = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&visibility=all",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "LaunchGuard",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Couldn't load your repos from GitHub." },
        { status: 502 },
      );
    }
    const repos = (await res.json()) as Array<{
      full_name: string;
      private: boolean;
      default_branch: string;
    }>;

    return NextResponse.json(
      repos.map((r) => ({
        full_name: r.full_name,
        private: r.private,
        default_branch: r.default_branch,
      })),
    );
  } catch (err) {
    console.error("[github/repos] failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach GitHub." },
      { status: 502 },
    );
  }
}
