import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase/server";
import { validateRepoUrl } from "@/lib/validate-repo";
import { checkScanRateLimit, clientIpFrom } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RepoState = "public" | "private" | "missing" | "unknown";

/**
 * Ask GitHub whether a repo exists and whether it's private. Without a token,
 * private repos return 404 ("missing") — exactly the "can't see it" signal we
 * want for anonymous users. With the viewer's token, a private repo they can
 * access returns 200 with private:true. Network hiccups return "unknown".
 */
async function checkRepoState(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoState> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "LaunchGuard",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      cache: "no-store",
    });
    if (res.status === 200) {
      const data = (await res.json()) as { private?: boolean };
      return data.private ? "private" : "public";
    }
    if (res.status === 404) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function POST(request: Request) {
  // Per-IP rate limit — protect our Anthropic/compute bill from abuse. Runs
  // before any scan row is created or the engine is called.
  const ip = clientIpFrom(request);
  const { success } = await checkScanRateLimit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "You've hit the free scan limit. Try again in an hour." },
      { status: 429 },
    );
  }

  let body: { repo_url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Please try again." },
      { status: 400 },
    );
  }

  const repoUrlRaw = typeof body.repo_url === "string" ? body.repo_url : "";
  const validation = validateRepoUrl(repoUrlRaw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { owner, repo, url } = validation;

  const supabase = createServerClient();

  // Is there a signed-in, GitHub-connected user? Only they can scan a private
  // repo. Anonymous users keep the public-URL-only flow.
  let viewerId: string | null = null;
  let viewerToken: string | null = null;
  const {
    data: { user },
  } = await createSupabaseServer().auth.getUser();
  if (user) {
    viewerId = user.id;
    const { data: account } = await supabase
      .from("users")
      .select("github_token")
      .eq("id", user.id)
      .maybeSingle();
    viewerToken = account?.github_token ?? null;
  }

  // Check the repo. With the viewer's token, private repos they can access
  // resolve to "private"; without a token they resolve to "missing".
  const state = await checkRepoState(owner, repo, viewerToken ?? undefined);

  let isPrivate = false;
  if (state === "private") {
    // Reachable only when a token was supplied (so the user has access).
    if (!viewerToken) {
      return NextResponse.json(
        {
          error:
            "That repo looks private. Connect your GitHub account to scan private repos, or pick a public one.",
        },
        { status: 403 },
      );
    }
    isPrivate = true;
  } else if (state === "missing") {
    return NextResponse.json(
      {
        error: viewerToken
          ? "We couldn't find that repo, or your GitHub account can't access it."
          : "We couldn't find that repo. Double-check the link — it should be a public repo at github.com/owner/repo.",
      },
      { status: 404 },
    );
  }
  // "public" / "unknown" → proceed; the engine surfaces any real problem.

  const { data: scan, error: insertError } = await supabase
    .from("scans")
    // Private scans are owned by the user; public scans stay anonymous.
    .insert({
      repo_url: url,
      status: "queued",
      user_id: isPrivate ? viewerId : null,
    })
    .select("id")
    .single();

  if (insertError || !scan) {
    console.error("[scans] insert failed:", insertError);
    return NextResponse.json(
      { error: "Something went wrong starting your scan. Please try again." },
      { status: 500 },
    );
  }

  // Record the event server-side (PostHog is also fired from the client). Never
  // include the token in props.
  const { error: eventError } = await supabase.from("events").insert({
    scan_id: scan.id,
    user_id: isPrivate ? viewerId : null,
    name: "scan_started",
    props: { repo_url: url, owner, repo, private: isPrivate },
  });
  if (eventError) {
    console.error("[events] insert failed:", eventError);
  }

  // Kick off the scan engine. For private repos, include the viewer's token in
  // the SERVER-SIDE trigger only — it's never returned to the browser or logged.
  const engineBase = process.env.SCAN_ENGINE_URL?.replace(/\/$/, "");
  if (engineBase) {
    const payload: { scan_id: string; repo_url: string; github_token?: string } =
      { scan_id: scan.id, repo_url: url };
    if (isPrivate && viewerToken) payload.github_token = viewerToken;
    try {
      await fetch(`${engineBase}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } catch (err) {
      // Log the error type only — never the payload (it may carry the token).
      console.error(
        "[scan-engine] call failed:",
        err instanceof Error ? err.message : "unknown error",
      );
    }
  } else {
    console.warn("[scan-engine] SCAN_ENGINE_URL not set; skipping engine call.");
  }

  return NextResponse.json({ id: scan.id }, { status: 201 });
}
