import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { validateRepoUrl } from "@/lib/validate-repo";
import { generateFixedFile, type FixInput } from "@/lib/fix-generator";
import {
  GitHubError,
  getDefaultBranch,
  createBranch,
  getFile,
  commitFile,
  openPullRequest,
} from "@/lib/github-pr";
import { logFunnelEvent } from "@/lib/analytics-server";
import { enforceApiRateLimit } from "@/lib/rate-limit";
import type { Severity } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const MAX_FINDINGS = 6;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 40_000;

type FindingRow = {
  id: string;
  severity: Severity;
  title: string;
  why_it_matters: string;
  fix_snippet: string | null;
  fix_prompt: string;
  file_path: string | null;
  line: number | null;
};

export async function POST(request: Request) {
  const limited = await enforceApiRateLimit(request);
  if (limited) return limited;

  let body: { scan_id?: unknown; finding_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const scanId = typeof body.scan_id === "string" ? body.scan_id : "";
  const selectedIds = Array.isArray(body.finding_ids)
    ? body.finding_ids.filter((x): x is string => typeof x === "string")
    : null;
  if (!scanId) {
    return NextResponse.json({ error: "Missing scan_id." }, { status: 400 });
  }

  // Must be a signed-in Pro user with a connected GitHub account.
  const auth = (await createSupabaseServer());
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const admin = createServerClient();
  const { data: account } = await admin
    .from("users")
    .select("plan, github_token")
    .eq("id", user.id)
    .maybeSingle();

  if (account?.plan !== "pro") {
    return NextResponse.json({ error: "Pro plan required." }, { status: 403 });
  }
  const token = account.github_token;
  if (!token) {
    return NextResponse.json(
      { error: "Connect your GitHub account first.", code: "github_required" },
      { status: 400 },
    );
  }

  // Load the scan + findings.
  const { data: scan } = await admin
    .from("scans")
    .select("id, repo_url")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const repo = validateRepoUrl(scan.repo_url);
  if (!repo.ok) {
    return NextResponse.json({ error: "Unsupported repo URL." }, { status: 400 });
  }

  const { data: allFindings } = await admin
    .from("findings")
    .select("id, severity, title, why_it_matters, fix_snippet, fix_prompt, file_path, line")
    .eq("scan_id", scanId);

  let findings = (allFindings ?? []).filter(
    (f): f is FindingRow => Boolean(f.file_path),
  );
  if (selectedIds && selectedIds.length > 0) {
    findings = findings.filter((f) => selectedIds.includes(f.id));
  }
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  findings = findings.slice(0, MAX_FINDINGS);

  if (findings.length === 0) {
    return NextResponse.json(
      { error: "No fixable findings with a file location." },
      { status: 400 },
    );
  }

  // Group findings by file.
  const byFile = new Map<string, FindingRow[]>();
  for (const f of findings) {
    const path = f.file_path as string;
    byFile.set(path, [...(byFile.get(path) ?? []), f]);
  }
  const files = Array.from(byFile.keys()).slice(0, MAX_FILES);

  try {
    const { branch: baseBranch, sha } = await getDefaultBranch(
      token,
      repo.owner,
      repo.repo,
    );

    const newBranch = `vibecheck/fix-${Date.now().toString(36)}`;
    await createBranch(token, repo.owner, repo.repo, newBranch, sha);

    const changed: { path: string; findings: FindingRow[] }[] = [];

    for (const path of files) {
      const fileFindings = byFile.get(path) ?? [];
      const file = await getFile(token, repo.owner, repo.repo, path, baseBranch);
      if (!file || file.content.length > MAX_FILE_BYTES) continue;

      const inputs: FixInput[] = fileFindings.map((f) => ({
        title: f.title,
        why_it_matters: f.why_it_matters,
        fix_snippet: f.fix_snippet,
        fix_prompt: f.fix_prompt,
        line: f.line,
      }));

      const fixed = await generateFixedFile(path, file.content, inputs);
      if (!fixed) continue;

      await commitFile(
        token,
        repo.owner,
        repo.repo,
        path,
        fixed,
        file.sha,
        newBranch,
        `[Vibecheck] Fix ${fileFindings.length} issue(s) in ${path}`,
      );
      changed.push({ path, findings: fileFindings });
    }

    if (changed.length === 0) {
      return NextResponse.json(
        {
          error:
            "We couldn't safely generate edits for these files (they may have moved or be too large).",
        },
        { status: 422 },
      );
    }

    const fixedCount = changed.reduce((n, c) => n + c.findings.length, 0);
    const title = `[Vibecheck] Fixed ${fixedCount} security ${fixedCount === 1 ? "issue" : "issues"}`;
    const prBody = buildPrBody(changed);

    const pr = await openPullRequest(
      token,
      repo.owner,
      repo.repo,
      newBranch,
      baseBranch,
      title,
      prBody,
    );

    await admin.from("fix_prs").insert({
      scan_id: scanId,
      user_id: user.id,
      pr_url: pr.url,
      pr_number: pr.number,
      branch: newBranch,
      title,
      finding_count: fixedCount,
    });

    await logFunnelEvent({
      name: "fix_pr_opened",
      scanId,
      userId: user.id,
      distinctId: user.id,
      props: { pr_number: pr.number, finding_count: fixedCount },
    });

    return NextResponse.json({
      pr_url: pr.url,
      pr_number: pr.number,
      finding_count: fixedCount,
    });
  } catch (err) {
    if (err instanceof GitHubError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    console.error("[github/fix] failed:", err);
    return NextResponse.json(
      { error: "Something went wrong opening the pull request." },
      { status: 500 },
    );
  }
}

function buildPrBody(changed: { path: string; findings: FindingRow[] }[]): string {
  const total = changed.reduce((n, c) => n + c.findings.length, 0);
  const lines: string[] = [
    `## 🛡️ Vibecheck auto-fix`,
    "",
    `This pull request fixes **${total} security ${total === 1 ? "issue" : "issues"}** found in your latest Vibecheck scan.`,
    "",
    "### What changed",
    "",
  ];
  for (const c of changed) {
    lines.push(`**\`${c.path}\`**`);
    for (const f of c.findings) {
      lines.push(`- **${f.title}** — ${f.why_it_matters}`);
    }
    lines.push("");
  }
  lines.push(
    "---",
    "",
    "These edits were generated by reading your code as text — **Vibecheck never ran your code**. Please review the diff and let your usual CI and review process do the rest before merging.",
  );
  return lines.join("\n");
}
