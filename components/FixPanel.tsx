"use client";

import { useState } from "react";

export type FixPr = {
  pr_url: string;
  pr_number: number | null;
  title: string | null;
  finding_count: number;
};

export default function FixPanel({
  scanId,
  githubConnected,
  githubLogin,
  initialPrs,
}: {
  scanId: string;
  githubConnected: boolean;
  githubLogin: string | null;
  initialPrs: FixPr[];
}) {
  const [prs, setPrs] = useState<FixPr[]>(initialPrs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openFixPr() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/github/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: scanId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        pr_url?: string;
        pr_number?: number;
        finding_count?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.pr_url) {
        if (data.code === "github_required") {
          window.location.href = `/api/github/connect?scan=${scanId}`;
          return;
        }
        setError(data.error ?? "Couldn't open the pull request.");
        setBusy(false);
        return;
      }
      setPrs((prev) => [
        {
          pr_url: data.pr_url!,
          pr_number: data.pr_number ?? null,
          title: null,
          finding_count: data.finding_count ?? 0,
        },
        ...prev,
      ]);
      setBusy(false);
    } catch {
      setError("We couldn't reach our servers. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <WandIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-neutral-900">
            Fix it for me — open a pull request
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            We&apos;ll write the corrected code, push it to a new branch, and
            open a PR you can review and merge. We only read and write code as
            text — we never run your repo.
          </p>

          {prs.length > 0 && (
            <div className="mt-4 space-y-2">
              {prs.map((pr) => (
                <a
                  key={pr.pr_url}
                  href={pr.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm transition hover:border-emerald-300"
                >
                  <span className="flex items-center gap-2 font-medium text-neutral-800">
                    <GitHubIcon className="h-4 w-4" />
                    {pr.pr_number ? `PR #${pr.pr_number}` : "Pull request"} ·{" "}
                    {pr.finding_count} fix
                    {pr.finding_count === 1 ? "" : "es"}
                  </span>
                  <span className="text-emerald-700">View on GitHub →</span>
                </a>
              ))}
            </div>
          )}

          <div className="mt-4">
            {githubConnected ? (
              <button
                type="button"
                onClick={openFixPr}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-70"
              >
                {busy ? (
                  <>
                    <Spinner /> Writing the fix &amp; opening a PR…
                  </>
                ) : (
                  <>
                    <WandIcon className="h-4 w-4" />
                    Fix the top issues &amp; open a PR
                  </>
                )}
              </button>
            ) : (
              <a
                href={`/api/github/connect?scan=${scanId}`}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
              >
                <GitHubIcon className="h-4 w-4" />
                Connect GitHub to open a fix PR
              </a>
            )}
            <p className="mt-2 text-xs text-neutral-400">
              {githubConnected
                ? `Connected as ${githubLogin ?? "GitHub"}. We request only the minimum access to open a pull request.`
                : "We request the minimum access needed to open a pull request — and only on repos you can already write to."}
            </p>
          </div>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

function WandIcon({ className }: { className?: string }) {
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
      <path d="m3 21 9-9" />
      <path d="M15 4V2M15 10V8M10.5 5.5H8.5M21.5 5.5h-2M18 8l-1.5-1.5M13.5 3.5 12 2" />
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
