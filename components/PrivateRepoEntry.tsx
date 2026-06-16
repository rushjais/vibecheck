"use client";

import { useEffect, useState } from "react";
import SignInModal from "@/components/SignInModal";

/**
 * Home-page entry point for private-repo scanning, driven by /api/me:
 *   signed out          → "Have a private repo? Sign in to scan it."
 *   signed in, no GitHub → "Connect GitHub to scan your private repos"
 *   signed in + GitHub   → nothing (RepoPicker shows the dropdown)
 *
 * Renders nothing until /api/me resolves, so the anonymous public-URL flow is
 * never blocked or shifted.
 */
export default function PrivateRepoEntry() {
  const [me, setMe] = useState<{
    signedIn: boolean;
    githubConnected: boolean;
  } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setMe(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!me) return null;
  if (me.signedIn && me.githubConnected) return null; // RepoPicker handles it

  if (me.signedIn && !me.githubConnected) {
    return (
      <a
        href="/api/github/connect?scan=home"
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
      >
        <GitHubIcon className="h-4 w-4" />
        Connect GitHub to scan your private repos
      </a>
    );
  }

  // Signed out
  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="mt-4 text-sm font-medium text-emerald-700 underline-offset-2 transition hover:underline"
      >
        Have a private repo? Sign in to scan it.
      </button>
      <SignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.21-3.37-1.21-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}
