"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { capture } from "@/lib/analytics";

type Repo = {
  full_name: string;
  private: boolean;
  default_branch: string;
};

export default function RepoPicker() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null); // null = unknown/hidden
  const [selected, setSelected] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe connection on mount. 401 (not signed in / not connected) → stay hidden.
  useEffect(() => {
    let active = true;
    fetch("/api/github/repos", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Repo[];
      })
      .then((data) => {
        if (active && data && data.length > 0) {
          setRepos(data);
          setSelected(data[0].full_name);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!repos) return null; // anonymous / not connected → public-URL-only flow

  async function scanSelected() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    const repoUrl = `https://github.com/${selected}`;
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Couldn't start that scan. Please try again.");
        setSubmitting(false);
        return;
      }
      capture("scan_started", { repo_url: repoUrl, scan_id: data.id, source: "repo_picker" });
      router.push(`/scan/${data.id}`);
    } catch {
      setError("We couldn't reach our servers. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5 w-full max-w-xl rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700">
        <GitHubIcon className="h-4 w-4" />
        Or scan one of your repos
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          Pro · private repos
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
        >
          {repos.map((r) => (
            <option key={r.full_name} value={r.full_name}>
              {r.full_name}
              {r.private ? "  🔒 private" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={scanSelected}
          disabled={submitting || !selected}
          className="shrink-0 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Starting…" : "Scan this repo"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">
          We read your code over an encrypted connection and never run it.
        </p>
      )}
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.21-3.37-1.21-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}
