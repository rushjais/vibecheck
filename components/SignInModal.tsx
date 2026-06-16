"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * Minimal magic-link sign-in modal. Shared by the header AuthControl and the
 * home-page private-repo entry. Uses window.location.origin so the redirect
 * works in prod (that domain is in the Supabase redirect allowlist).
 */
export default function SignInModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setPhase("sending");
    const supabase = createSupabaseBrowser();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (otpError) {
      setPhase("idle");
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
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Sign in</h2>
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

        {phase === "sent" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800">
            Check your email for a sign-in link.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-2.5">
            <p className="text-sm text-neutral-600">
              We&apos;ll email you a secure link — no password needed.
            </p>
            <label htmlFor="signin-email" className="sr-only">
              Email address
            </label>
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              autoFocus
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
              {phase === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
