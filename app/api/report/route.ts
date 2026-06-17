import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { validateRepoUrl } from "@/lib/validate-repo";
import { buildFileExcerpts } from "@/lib/github";
import { generateReport, ReportGenerationError } from "@/lib/report";
import { checkScanRateLimit, clientIpFrom } from "@/lib/rate-limit";
import type { Database } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // report generation can take a while

type FindingInsert = Database["public"]["Tables"]["findings"]["Insert"];

// Top N findings (highest priority) are free; the rest are gated behind the
// one-time unlock.
const FREE_FINDINGS = 3;

export async function POST(request: Request) {
  // Per-IP rate limit (same Upstash limiter as /api/scans) — protect the
  // Anthropic call from abuse. Runs before any report generation.
  const ip = clientIpFrom(request);
  const { success } = await checkScanRateLimit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "You've hit the limit. Try again in an hour." },
      { status: 429 },
    );
  }

  let body: { scan_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const scanId = typeof body.scan_id === "string" ? body.scan_id : "";
  if (!scanId) {
    return NextResponse.json({ error: "Missing scan_id." }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: scan, error: loadError } = await supabase
    .from("scans")
    .select("id, repo_url, status, raw_findings")
    .eq("id", scanId)
    .maybeSingle();

  if (loadError || !scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  // Idempotency: report already generated — nothing to do.
  if (scan.status === "done") {
    return NextResponse.json({ ok: true, status: "done" });
  }
  // Only generate once the scanners have finished.
  if (scan.status !== "awaiting_report") {
    return NextResponse.json(
      { error: `Scan is not ready for a report (status: ${scan.status}).` },
      { status: 409 },
    );
  }
  if (!scan.raw_findings) {
    await markFailed(supabase, scanId, "No scan results to build a report from.");
    return NextResponse.json(
      { error: "No raw findings on this scan." },
      { status: 422 },
    );
  }

  // Pull short excerpts of the referenced files to ground the fixes.
  let excerpts = "";
  const repo = validateRepoUrl(scan.repo_url);
  if (repo.ok) {
    const findingList = extractRawFindings(scan.raw_findings);
    excerpts = await buildFileExcerpts(repo.owner, repo.repo, findingList);
  }

  // Generate the plain-English report.
  let report;
  try {
    report = await generateReport(scan.repo_url, scan.raw_findings, excerpts);
  } catch (err) {
    const reason =
      err instanceof ReportGenerationError
        ? err.message
        : "Report generation failed unexpectedly.";
    console.error("[report] generation failed:", reason);
    await markFailed(supabase, scanId, reason);
    return NextResponse.json({ error: "Could not generate report." }, { status: 500 });
  }

  // Replace any existing findings (so re-runs are idempotent), then insert.
  await supabase.from("findings").delete().eq("scan_id", scanId);

  const rows: FindingInsert[] = report.findings.map((f, index) => ({
    scan_id: scanId,
    severity: f.severity,
    category: f.category,
    title: f.title,
    plain_explanation: f.plain_explanation,
    why_it_matters: f.why_it_matters,
    fix_snippet: f.fix_snippet,
    fix_prompt: f.fix_prompt,
    file_path: f.file_path,
    line: f.line,
    is_locked: index >= FREE_FINDINGS, // top 3 free, rest gated
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("findings").insert(rows);
    if (insertError) {
      console.error("[report] findings insert failed:", insertError);
      await markFailed(supabase, scanId, "Failed to save report findings.");
      return NextResponse.json({ error: "Could not save report." }, { status: 500 });
    }
  }

  // Finalize the scan row.
  const { error: updateError } = await supabase
    .from("scans")
    .update({
      status: "done",
      risk_score: report.risk_score,
      summary: report.summary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", scanId);

  if (updateError) {
    console.error("[report] scan update failed:", updateError);
    return NextResponse.json({ error: "Could not finalize scan." }, { status: 500 });
  }

  await supabase.from("events").insert({
    scan_id: scanId,
    name: "report_generated",
    props: { risk_score: report.risk_score, finding_count: rows.length },
  });

  return NextResponse.json({
    ok: true,
    status: "done",
    risk_score: report.risk_score,
    finding_count: rows.length,
  });
}

function extractRawFindings(
  rawFindings: unknown,
): Array<{ file_path?: string | null; line?: number | null }> {
  if (
    rawFindings &&
    typeof rawFindings === "object" &&
    Array.isArray((rawFindings as { findings?: unknown }).findings)
  ) {
    return (rawFindings as { findings: Array<{ file_path?: string | null; line?: number | null }> })
      .findings;
  }
  return [];
}

async function markFailed(
  supabase: ReturnType<typeof createServerClient>,
  scanId: string,
  reason: string,
) {
  await supabase
    .from("scans")
    .update({ status: "failed", summary: reason.slice(0, 500) })
    .eq("id", scanId);
}
