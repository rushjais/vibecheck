"use client";

import { useState } from "react";
import type { Severity, FindingCategory } from "@/types/database";
import CodeBlock from "@/components/CodeBlock";
import CopyButton from "@/components/CopyButton";

export type ClientFinding = {
  id: string;
  severity: Severity;
  category: FindingCategory;
  is_locked: boolean;
  title: string | null;
  plain_explanation: string | null;
  why_it_matters: string | null;
  fix_snippet: string | null;
  fix_prompt: string | null;
  file_path: string | null;
  line: number | null;
};

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  high: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
  medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  low: "bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-200",
};

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  secrets: "Exposed secret",
  auth: "Access control",
  injection: "Injection",
  deps: "Dependency",
  scaling: "Scaling",
  config: "Configuration",
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export default function FindingCard({
  finding,
  index,
  onUnlock,
}: {
  finding: ClientFinding;
  index: number;
  onUnlock?: () => void;
}) {
  const [open, setOpen] = useState(index === 0); // first card expanded by default

  if (finding.is_locked) {
    return <LockedCard finding={finding} onUnlock={onUnlock} />;
  }

  const hasDetails =
    finding.why_it_matters || finding.fix_snippet || finding.fix_prompt;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <SeverityPill severity={finding.severity} />
            <span className="text-xs font-medium text-neutral-400">
              {CATEGORY_LABELS[finding.category]}
            </span>
          </div>
          <h3 className="text-base font-semibold leading-snug text-neutral-900">
            {finding.title}
          </h3>
          {finding.plain_explanation && (
            <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
              {finding.plain_explanation}
            </p>
          )}
        </div>
        <Chevron
          className={`mt-1 h-5 w-5 shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && hasDetails && (
        <div className="space-y-5 border-t border-neutral-100 px-5 pb-5 pt-4">
          {finding.plain_explanation && (
            <Section label="What it is">
              <p className="text-sm leading-relaxed text-neutral-700">
                {finding.plain_explanation}
              </p>
            </Section>
          )}

          {finding.why_it_matters && (
            <Section label="Why it matters">
              <p className="text-sm leading-relaxed text-neutral-700">
                {finding.why_it_matters}
              </p>
            </Section>
          )}

          {(finding.file_path || finding.line != null) && (
            <p className="font-mono text-xs text-neutral-400">
              {finding.file_path}
              {finding.line != null ? `:${finding.line}` : ""}
            </p>
          )}

          {finding.fix_snippet && (
            <Section label="Suggested fix">
              <CodeBlock code={finding.fix_snippet} filePath={finding.file_path} />
            </Section>
          )}

          {finding.fix_prompt && (
            <CopyButton
              text={finding.fix_prompt}
              idleLabel="Copy fix for Claude Code"
              copiedLabel="Copied — paste it in!"
              iconIdle={<WandIcon className="h-4 w-4" />}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            />
          )}
        </div>
      )}
    </div>
  );
}

function LockedCard({
  finding,
  onUnlock,
}: {
  finding: ClientFinding;
  onUnlock?: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* Teased content (blurred) */}
      <div className="select-none px-5 py-4" aria-hidden="true">
        <div className="mb-2 flex items-center gap-2">
          <SeverityPill severity={finding.severity} />
          <span className="text-xs font-medium text-neutral-400">
            {CATEGORY_LABELS[finding.category]}
          </span>
        </div>
        <div className="space-y-2 blur-[6px]">
          <div className="h-4 w-2/3 rounded bg-neutral-300" />
          <div className="h-3 w-full rounded bg-neutral-200" />
          <div className="h-3 w-4/5 rounded bg-neutral-200" />
        </div>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/55 backdrop-blur-[1px]">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white">
          <LockIcon className="h-4 w-4" />
        </div>
        <button
          type="button"
          onClick={onUnlock}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
        >
          Unlock full report
        </button>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
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
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
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
