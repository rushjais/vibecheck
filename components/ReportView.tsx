"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { capture } from "@/lib/analytics";
import RiskRing, { riskTier } from "@/components/RiskRing";
import FindingCard, {
  SeverityPill,
  type ClientFinding,
} from "@/components/FindingCard";
import CopyButton from "@/components/CopyButton";
import PaywallModal from "@/components/PaywallModal";
import FixPanel, { type FixPr } from "@/components/FixPanel";

export default function ReportView({
  scanId,
  repoUrl,
  riskScore,
  summary,
  findings,
  unlocked = false,
  isPro = false,
  githubConnected = false,
  githubLogin = null,
  prs = [],
}: {
  scanId: string;
  repoUrl: string;
  riskScore: number;
  summary: string;
  findings: ClientFinding[];
  unlocked?: boolean;
  isPro?: boolean;
  githubConnected?: boolean;
  githubLogin?: string | null;
  prs?: FixPr[];
}) {
  const [shareUrl, setShareUrl] = useState(`/scan/${scanId}`);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const logged = useRef(false);
  const unlockLogged = useRef(false);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  // Open the paywall + fire 'unlock_clicked' exactly once (PostHog + events).
  function handleUnlock() {
    if (!unlockLogged.current) {
      unlockLogged.current = true;
      capture("unlock_clicked", { scan_id: scanId, risk_score: riskScore });
      void recordEvent("unlock_clicked", scanId, { risk_score: riskScore });
    }
    setPaywallOpen(true);
  }

  // Fire 'scan_viewed' once: PostHog (client) + events table (via server route,
  // since RLS blocks anon inserts).
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    capture("scan_viewed", { scan_id: scanId, risk_score: riskScore });
    void recordEvent("scan_viewed", scanId, {
      risk_score: riskScore,
      repo_url: repoUrl,
    });
  }, [scanId, riskScore, repoUrl]);

  const tier = riskTier(riskScore);
  const repoLabel = repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  const mostUrgent = findings.find((f) => !f.is_locked && f.title);
  const lockedCount = findings.filter((f) => f.is_locked).length;

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-xs text-white">
            ✓
          </span>
          LaunchGuard
        </Link>
        <CopyButton
          text={shareUrl}
          idleLabel="Share this report"
          copiedLabel="Link copied!"
          iconIdle={<ShareIcon className="h-4 w-4" />}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
        />
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24">
        {unlocked && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
              ✓
            </span>
            You&apos;re on Pro — your full report is unlocked.
          </div>
        )}

        {/* Repo label */}
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition hover:text-neutral-800"
        >
          <GitHubIcon className="h-4 w-4" />
          {repoLabel}
        </a>

        {/* Score hero */}
        <section className="mt-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-9">
            <RiskRing score={riskScore} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className={`text-xl font-bold ${tier.text}`}>{tier.label}</div>
              <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">
                {summary}
              </p>

              {findings.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {(["critical", "high", "medium", "low"] as const)
                    .filter((s) => counts[s])
                    .map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5">
                        <SeverityPill severity={s} />
                        <span className="text-xs text-neutral-500">
                          ×{counts[s]}
                        </span>
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Most urgent fix callout */}
          {mostUrgent && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
              <FlagIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Fix this first
                </div>
                <div className="mt-0.5 text-sm font-medium text-neutral-900">
                  {mostUrgent.title}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Pro: open a fix PR. Never rendered for free/anonymous viewers. */}
        {isPro && findings.length > 0 && (
          <FixPanel
            scanId={scanId}
            githubConnected={githubConnected}
            githubLogin={githubLogin}
            initialPrs={prs}
          />
        )}

        {/* Findings */}
        {findings.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <div className="text-3xl">🎉</div>
            <h2 className="mt-2 text-lg font-semibold text-emerald-800">
              No major issues found
            </h2>
            <p className="mt-1 text-sm text-emerald-700">
              We didn&apos;t spot anything serious. Keep building — and re-scan
              before each big launch.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              What we found
            </h2>
            <div className="space-y-4">
              {findings.map((f, i) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  index={i}
                  onUnlock={handleUnlock}
                />
              ))}
            </div>

            {lockedCount > 0 && (
              <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <h2 className="text-lg font-semibold text-neutral-900">
                  {lockedCount} more{" "}
                  {lockedCount === 1 ? "issue is" : "issues are"} waiting
                </h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
                  Unlock the full report to see every finding, why it matters,
                  and a copy-paste fix for each one.
                </p>
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Unlock full report
                </button>
              </div>
            )}
          </>
        )}

        <footer className="mt-12 text-center text-xs text-neutral-400">
          Scanned with LaunchGuard · public code only, never any write access
        </footer>
      </main>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        scanId={scanId}
      />
    </div>
  );
}

/** Record a client funnel event in the events table via the server route. */
async function recordEvent(
  name: string,
  scanId: string,
  props: Record<string, unknown>,
) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scan_id: scanId, props }),
    });
  } catch {
    /* non-fatal */
  }
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.21-3.37-1.21-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" />
      <path d="M4 22v-7" />
    </svg>
  );
}
