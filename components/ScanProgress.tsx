"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ScanRow, ScanStatus } from "@/types/database";

/** Friendly, jargon-free copy for each stage of a scan. */
const STAGE_COPY: Record<ScanStatus, { label: string; sub: string }> = {
  queued: {
    label: "Getting your app…",
    sub: "Making a private copy of your public code to look through.",
  },
  running: {
    label: "Scanning your app…",
    sub: "Checking for security holes, exposed secrets, and what might break at scale.",
  },
  awaiting_report: {
    label: "Writing your report…",
    sub: "Turning what we found into plain English you can actually act on.",
  },
  done: {
    label: "Your report is ready",
    sub: "Here's what we found, in plain English.",
  },
  failed: {
    label: "We hit a snag",
    sub: "We couldn't finish scanning this one. It's not your fault — please try again.",
  },
};

const ACTIVE_STEPS = [
  "Cloning your code",
  "Scanning for problems",
  "Writing your report in plain English",
];

export default function ScanProgress({
  initialScan,
}: {
  initialScan: ScanRow;
}) {
  const [scan, setScan] = useState<ScanRow>(initialScan);
  const reportTriggered = useRef(false);

  // When the scanners finish, kick off report generation exactly once. The
  // route is idempotent, so a duplicate call is harmless.
  useEffect(() => {
    if (scan.status === "awaiting_report" && !reportTriggered.current) {
      reportTriggered.current = true;
      fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: scan.id }),
      }).catch(() => {
        // A failure here will surface as the scan flipping to 'failed' via
        // polling; nothing more to do client-side.
      });
    }
  }, [scan.status, scan.id]);

  // Poll the scan row every 3s until it reaches a terminal state. Realtime was
  // unreliable here, so we just re-fetch.
  useEffect(() => {
    async function poll() {
      const res = await fetch(`/api/scans/${initialScan.id}/status`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = (await res.json()) as {
        status: ScanStatus;
        risk_score: number | null;
        summary: string | null;
      };

      setScan((prev) => ({
        ...prev,
        status: data.status,
        risk_score: data.risk_score,
        summary: data.summary,
      }));

      if (data.status === "done") {
        // Hard reload so the server component re-runs and renders the full
        // ReportView (router.refresh() didn't reliably swap it in).
        clearInterval(interval);
        window.location.reload();
        return;
      } else if (data.status === "failed") {
        clearInterval(interval);
      }
    }

    const interval = setInterval(poll, 3000);

    return () => clearInterval(interval);
  }, [initialScan.id]);

  const stage = STAGE_COPY[scan.status];
  const inProgress =
    scan.status === "queued" ||
    scan.status === "running" ||
    scan.status === "awaiting_report";
  const isDone = scan.status === "done";
  const isFailed = scan.status === "failed";

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-xs text-white">
            ✓
          </span>
          LaunchGuard
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <p className="truncate text-sm text-neutral-500">{scan.repo_url}</p>

        <div className="mt-3 flex items-center gap-3">
          {inProgress && (
            <span
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
              aria-hidden="true"
            />
          )}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {stage.label}
          </h1>
        </div>
        <p className="mt-2 text-neutral-600">{stage.sub}</p>

        {inProgress && (
          <ul className="mt-8 space-y-3">
            {ACTIVE_STEPS.map((step, i) => {
              // queued → step 1, running → steps 1–2, awaiting_report → all 3.
              const reached =
                scan.status === "awaiting_report"
                  ? true
                  : scan.status === "running"
                    ? i <= 1
                    : i === 0;
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      reached
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
                        : "flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-neutral-400"
                    }
                    aria-hidden="true"
                  >
                    {reached ? "•" : "○"}
                  </span>
                  <span
                    className={reached ? "text-neutral-800" : "text-neutral-400"}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Report placeholder — the real report renders here in a later step. */}
        {isDone && (
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-medium text-neutral-500">
                Risk score
              </span>
              <span className="text-3xl font-semibold tabular-nums">
                {scan.risk_score ?? "—"}
                <span className="text-base font-normal text-neutral-400">
                  /100
                </span>
              </span>
            </div>
            {scan.summary && (
              <p className="mt-4 text-neutral-700">{scan.summary}</p>
            )}
            <p className="mt-4 text-xs text-neutral-400">
              Status: <code>{scan.status}</code> · The full plain-English
              report will appear here next.
            </p>
          </div>
        )}

        {isFailed && (
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Try another repo
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
