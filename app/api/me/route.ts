import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tiny auth/connection status for the client. Reads the GitHub token with the
 * service-role client but NEVER returns it — only booleans.
 */
export async function GET() {
  const {
    data: { user },
  } = await createSupabaseServer().auth.getUser();

  if (!user) {
    return NextResponse.json({ signedIn: false, githubConnected: false });
  }

  const admin = createServerClient();
  const { data } = await admin
    .from("users")
    .select("github_token")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    signedIn: true,
    githubConnected: Boolean(data?.github_token),
  });
}
