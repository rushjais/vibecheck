"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateRepoUrl } from "@/lib/validate-repo";
import { capture } from "@/lib/analytics";

export default function ScanForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Fast client-side shape check before we hit the network.
    const local = validateRepoUrl(repoUrl);
    if (!local.ok) {
      setError(local.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: local.url }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };

      if (!res.ok || !data.id) {
        setError(
          data.error ?? "Something went wrong. Please try again in a moment.",
        );
        setSubmitting(false);
        return;
      }

      capture("scan_started", { repo_url: local.url, scan_id: data.id });
      router.push(`/scan/${data.id}`);
    } catch {
      setError(
        "We couldn't reach our servers. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="repo-url" className="sr-only">
            Public GitHub repo URL
          </label>
          <input
            id="repo-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://github.com/your-name/your-app"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "repo-url-error" : undefined}
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3.5 text-base text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Starting…" : "Scan my app — free"}
        </button>
      </div>

      {error ? (
        <p
          id="repo-url-error"
          role="alert"
          className="mt-2.5 text-sm font-medium text-red-600"
        >
          {error}
        </p>
      ) : (
        <p className="mt-2.5 text-sm text-neutral-500">
          We only read your <span className="font-medium text-neutral-700">public</span> code.
          The free scan never asks for write access to your repo.
        </p>
      )}
    </form>
  );
}
