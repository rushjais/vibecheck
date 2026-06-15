import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { validateRepoUrl } from "@/lib/validate-repo";
import { checkScanRateLimit, clientIpFrom } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RepoState = "public" | "private" | "missing" | "unknown";

/**
 * Ask GitHub whether a repo exists and is public. Unauthenticated requests
 * return 404 for both private and non-existent repos, which is exactly the
 * "can't see it" signal we want. Network hiccups return "unknown" so we don't
 * block a legitimate scan on a flaky check.
 */
async function checkRepoState(owner: string, repo: string): Promise<RepoState> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "LaunchGuard",
        },
        cache: "no-store",
      },
    );
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

  // Reject private / missing repos with a friendly, specific message.
  const state = await checkRepoState(owner, repo);
  if (state === "private") {
    return NextResponse.json(
      {
        error:
          "That repo looks private. The free scan only reads public code — make it public (or pick a public one) and try again.",
      },
      { status: 400 },
    );
  }
  if (state === "missing") {
    return NextResponse.json(
      {
        error:
          "We couldn't find that repo. Double-check the link — it should be a public repo at github.com/owner/repo.",
      },
      { status: 404 },
    );
  }
  // "unknown" → let it through; the scan engine will surface any real problem.

  const supabase = createServerClient();

  const { data: scan, error: insertError } = await supabase
    .from("scans")
    .insert({ repo_url: url, status: "queued" })
    .select("id")
    .single();

  if (insertError || !scan) {
    console.error("[scans] insert failed:", insertError);
    return NextResponse.json(
      { error: "Something went wrong starting your scan. Please try again." },
      { status: 500 },
    );
  }

  // Record the event server-side (PostHog is also fired from the client).
  const { error: eventError } = await supabase.from("events").insert({
    scan_id: scan.id,
    name: "scan_started",
    props: { repo_url: url, owner, repo },
  });
  if (eventError) {
    console.error("[events] insert failed:", eventError);
  }

  // Kick off the scan engine. Non-fatal if it's unreachable or unconfigured —
  // the row stays 'queued' and the progress page will still render.
  const engineBase = process.env.SCAN_ENGINE_URL?.replace(/\/$/, "");
  if (engineBase) {
    try {
      await fetch(`${engineBase}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: scan.id, repo_url: url }),
        cache: "no-store",
      });
    } catch (err) {
      console.error("[scan-engine] call failed:", err);
    }
  } else {
    console.warn("[scan-engine] SCAN_ENGINE_URL not set; skipping engine call.");
  }

  return NextResponse.json({ id: scan.id }, { status: 201 });
}
