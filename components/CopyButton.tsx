"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  idleLabel,
  copiedLabel = "Copied!",
  className = "",
  iconIdle,
  onCopied,
}: {
  text: string;
  idleLabel: React.ReactNode;
  copiedLabel?: React.ReactNode;
  className?: string;
  iconIdle?: React.ReactNode;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / insecure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    onCopied?.();
    window.setTimeout(() => setCopied(false), 1900);
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4" />
          {copiedLabel}
        </>
      ) : (
        <>
          {iconIdle}
          {idleLabel}
        </>
      )}
    </button>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
