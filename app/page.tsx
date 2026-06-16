import ScanForm from "@/components/ScanForm";
import RepoPicker from "@/components/RepoPicker";
import AuthControl from "@/components/AuthControl";
import PrivateRepoEntry from "@/components/PrivateRepoEntry";

const CHECKS = [
  {
    title: "Security holes",
    body: "Open doors a stranger could walk through — like pages or data anyone could reach without logging in.",
    icon: ShieldIcon,
  },
  {
    title: "Exposed secrets",
    body: "Passwords and API keys accidentally left in your code, where the wrong person could find and use them.",
    icon: KeyIcon,
  },
  {
    title: "Will-it-scale",
    body: "The stuff that quietly breaks when lots of people show up at once — before a busy day takes you down.",
    icon: GaugeIcon,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white">
            <ShieldIcon className="h-4 w-4" />
          </span>
          LaunchGuard
        </div>
        <AuthControl />
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* Hero */}
        <section className="flex flex-col items-center pt-16 text-center sm:pt-24">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Free security &amp; launch-readiness check
          </div>

          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Keep building. We&apos;ll catch what breaks{" "}
            <span className="text-emerald-600">before your users do.</span>
          </h1>

          <p className="mt-5 max-w-xl text-balance text-lg text-neutral-600">
            Paste a link to your app&apos;s code and get a plain-English report on
            what&apos;s safe to launch — and what to fix first. No security
            background needed.
          </p>

          <div className="mt-9 flex w-full flex-col items-center">
            <ScanForm />
            {/* Private-repo entry: sign-in / connect prompts driven by /api/me. */}
            <PrivateRepoEntry />
            {/* Dropdown of your repos — shows only when signed in + connected. */}
            <RepoPicker />
          </div>
        </section>

        {/* What we check */}
        <section className="py-20 sm:py-28">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-400">
            What we check
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {CHECKS.map(({ title, body, icon: Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-5xl px-6 py-8 text-center text-sm text-neutral-500">
          LaunchGuard reads public code only. We never ask for write access on
          the free scan.
        </div>
      </footer>
    </div>
  );
}

/* --- Inline icons (no UI library) --- */

function ShieldIcon({ className }: { className?: string }) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
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
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3" />
      <path d="m16 5 3 3" />
      <path d="m18 7 2-2" />
    </svg>
  );
}

function GaugeIcon({ className }: { className?: string }) {
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
      <path d="M12 14 8.5 9.5" />
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <circle cx="12" cy="14" r="1.5" />
    </svg>
  );
}
