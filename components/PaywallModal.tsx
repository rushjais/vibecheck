"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { PRO_PRICE_LABEL } from "@/lib/pricing";

const PRO_BENEFITS = [
  {
    title: "The full list of issues",
    body: "Every finding we caught — not just the top 3 — with plain-English fixes.",
  },
  {
    title: "One-click auto-fix pull requests",
    body: "We open a PR that fixes each issue, so you just review and merge.",
  },
  {
    title: "Continuous monitoring",
    body: "We re-scan on every push and tell you the moment something breaks.",
  },
];

type Phase = "intro" | "sending" | "sent" | "error";

export default function PaywallModal({
  open,
  onClose,
  scanId,
}: {
  open: boolean;
  onClose: () => void;
  scanId: string;
}) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  // If they're already signed in (came back after a magic link), skip straight
  // to checkout instead of emailing another link.
  useEffect(() => {
    if (!open) return;
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
  }, [open]);

  if (!open) return null;

  const checkoutUrl = `/api/checkout?scan=${encodeURIComponent(scanId)}`;

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setPhase("sending");
    const supabase = createSupabaseBrowser();
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      checkoutUrl,
    )}`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    if (otpError) {
      setPhase("error");
      setError(otpError.message);
      return;
    }
    setPhase("sent");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Unlock your full report
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              LaunchGuard Pro ·{" "}
              <span className="font-medium text-neutral-700">
                {PRO_PRICE_LABEL}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <ul className="space-y-3">
            {PRO_BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {b.title}
                  </div>
                  <div className="text-sm text-neutral-600">{b.body}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            {authed ? (
              <a
                href={checkoutUrl}
                className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Continue to checkout — {PRO_PRICE_LABEL}
              </a>
            ) : phase === "sent" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800">
                Check your email — we sent a secure link to{" "}
                <span className="font-medium">{email}</span>. Click it to continue
                to checkout.
              </div>
            ) : (
              <form onSubmit={sendMagicLink} className="space-y-2.5">
                <label htmlFor="paywall-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="paywall-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                />
                <button
                  type="submit"
                  disabled={phase === "sending"}
                  className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-70"
                >
                  {phase === "sending"
                    ? "Sending…"
                    : `Continue — ${PRO_PRICE_LABEL}`}
                </button>
                <p className="text-center text-xs text-neutral-400">
                  We&apos;ll email you a secure sign-in link, then take you to
                  checkout. No password needed.
                </p>
              </form>
            )}
            {error && (
              <p className="mt-2 text-center text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
