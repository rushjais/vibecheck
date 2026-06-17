import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase/server";
import ScanProgress from "@/components/ScanProgress";
import ReportView from "@/components/ReportView";
import type { ClientFinding } from "@/components/FindingCard";
import type { FixPr } from "@/components/FixPanel";
import type { FindingRow, Severity } from "@/types/database";
import { BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Order: unlocked first, then by severity. Locked findings sink to the bottom. */
function orderFindings(rows: FindingRow[]): FindingRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_locked !== b.is_locked) return a.is_locked ? 1 : -1;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });
}

/**
 * Strip sensitive fields from a finding when it's locked, so the locked content
 * never reaches the client. `locked` is decided by the caller (reveal-all when
 * the scan is unlocked; private scans lock everything until paid; public scans
 * keep the top 3 free).
 */
function toClientFinding(row: FindingRow, locked: boolean): ClientFinding {
  if (locked) {
    return {
      id: row.id,
      severity: row.severity,
      category: row.category,
      is_locked: true,
      title: null,
      plain_explanation: null,
      why_it_matters: null,
      fix_snippet: null,
      fix_prompt: null,
      file_path: null,
      line: null,
    };
  }
  return {
    id: row.id,
    severity: row.severity,
    category: row.category,
    is_locked: false,
    title: row.title,
    plain_explanation: row.plain_explanation,
    why_it_matters: row.why_it_matters,
    fix_snippet: row.fix_snippet,
    fix_prompt: row.fix_prompt,
    file_path: row.file_path,
    line: row.line,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient();
  const { data: scan } = await supabase
    .from("scans")
    .select("repo_url, status, risk_score, user_id")
    .eq("id", id)
    .maybeSingle();

  // Don't leak a private repo's name/score in metadata.
  if (!scan || scan.status !== "done" || scan.user_id !== null) {
    return { title: `${BRAND_NAME} scan` };
  }

  const repo = scan.repo_url.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  return {
    title: `${repo} — ${scan.risk_score ?? "?"}/100 · ${BRAND_NAME}`,
    description: `Plain-English security & launch-readiness report for ${repo}.`,
  };
}

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = createServerClient();
  const { data: scan } = await supabase
    .from("scans")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!scan) {
    notFound();
  }

  // Private-repo reports (scan tied to a user) are owner-only. Public scans
  // (user_id null) stay link-viewable.
  const isPrivate = scan.user_id !== null;

  const {
    data: { user },
  } = await (await createSupabaseServer()).auth.getUser();

  if (isPrivate && (!user || user.id !== scan.user_id)) {
    notFound();
  }

  if (scan.status === "done") {
    const { data: rows } = await supabase
      .from("findings")
      .select("*")
      .eq("scan_id", scan.id);

    // Reveal rules: paid (unlocked) → everything; public + not paid → top 3
    // free, rest locked; private + not paid → everything locked (no free tier).
    const scanUnlocked = scan.unlocked === true;
    const findings = orderFindings(rows ?? []).map((r) => {
      const locked = scanUnlocked
        ? false
        : isPrivate
          ? true
          : r.is_locked;
      return toClientFinding(r, locked);
    });

    // Signed-in extras: GitHub auto-fix panel + the user's scan-credit balance.
    let githubConnected = false;
    let githubLogin: string | null = null;
    let credits = 0;
    let prs: FixPr[] = [];

    if (user) {
      const { data: account } = await supabase
        .from("users")
        .select("github_login, github_token, scan_credits")
        .eq("id", user.id)
        .maybeSingle();
      githubConnected = Boolean(account?.github_token);
      githubLogin = account?.github_login ?? null;
      credits = account?.scan_credits ?? 0;

      const { data: prRows } = await supabase
        .from("fix_prs")
        .select("pr_url, pr_number, title, finding_count")
        .eq("scan_id", scan.id)
        .order("created_at", { ascending: false });
      prs = prRows ?? [];
    }

    return (
      <ReportView
        scanId={scan.id}
        repoUrl={scan.repo_url}
        riskScore={scan.risk_score ?? 0}
        summary={
          scan.summary ?? "We finished reviewing your app. Here's what we found."
        }
        findings={findings}
        unlocked={scanUnlocked}
        justPaid={sp.purchased === "1"}
        credits={credits}
        isSignedIn={Boolean(user)}
        isPrivate={isPrivate}
        githubConnected={githubConnected}
        githubLogin={githubLogin}
        prs={prs}
      />
    );
  }

  return <ScanProgress initialScan={scan} />;
}
