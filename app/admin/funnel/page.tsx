import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEPS = [
  { name: "scan_started", label: "Scan started", hint: "Pasted a repo" },
  { name: "scan_viewed", label: "Report viewed", hint: "Saw the results" },
  { name: "unlock_clicked", label: "Unlock clicked", hint: "Hit the paywall" },
  { name: "checkout_started", label: "Checkout started", hint: "Went to Stripe" },
  { name: "checkout_completed", label: "Checkout completed", hint: "Paid → Pro" },
] as const;

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const passphrase = process.env.ADMIN_PASSPHRASE;
  const provided = typeof sp.key === "string" ? sp.key : "";

  // Gate: hardcoded passphrase env var (placeholder auth for now).
  if (!passphrase || provided !== passphrase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <form
          method="GET"
          className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold text-neutral-900">
            Funnel dashboard
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Enter the admin passphrase to continue.
          </p>
          <input
            type="password"
            name="key"
            placeholder="Passphrase"
            autoFocus
            className="mt-4 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            View funnel
          </button>
          {provided && !passphrase && (
            <p className="mt-2 text-xs text-red-600">
              ADMIN_PASSPHRASE is not set on the server.
            </p>
          )}
          {provided && passphrase && provided !== passphrase && (
            <p className="mt-2 text-xs text-red-600">Incorrect passphrase.</p>
          )}
        </form>
      </main>
    );
  }

  // Pull the funnel events and count DISTINCT scans that reached each step.
  const admin = createServerClient();
  const { data: rows } = await admin
    .from("events")
    .select("name, scan_id")
    .in(
      "name",
      STEPS.map((s) => s.name),
    )
    .limit(100000);

  const seen: Record<string, Set<string>> = {};
  for (const s of STEPS) seen[s.name] = new Set();
  for (const row of rows ?? []) {
    if (row.name in seen && row.scan_id) {
      seen[row.name].add(row.scan_id);
    }
  }

  const counts = STEPS.map((s) => seen[s.name].size);
  const top = counts[0] || 0;

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-10 text-neutral-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Conversion funnel
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Distinct scans reaching each step. Source: the <code>events</code>{" "}
          table.
        </p>

        <div className="mt-8 space-y-3">
          {STEPS.map((step, i) => {
            const count = counts[i];
            const prev = i === 0 ? count : counts[i - 1];
            const stepConv = i === 0 ? 100 : prev ? (count / prev) * 100 : 0;
            const widthOfTop = top ? Math.max((count / top) * 100, 2) : 2;
            const dropFromPrev = i === 0 ? 0 : prev - count;

            return (
              <div
                key={step.name}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-sm font-semibold">{step.label}</div>
                    <div className="text-xs text-neutral-400">{step.hint}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums">
                      {count}
                    </div>
                    {i > 0 && (
                      <div className="text-xs text-neutral-500">
                        {pct(count, prev)} of prev
                        {dropFromPrev > 0 && (
                          <span className="text-red-500">
                            {" "}
                            · −{dropFromPrev}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${widthOfTop}%` }}
                  />
                </div>
                <div className="sr-only">{stepConv.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-900 bg-neutral-900 p-5 text-white">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Overall: scan → paid
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {pct(counts[counts.length - 1], top)}
          </div>
          <div className="mt-1 text-sm text-neutral-400">
            {counts[counts.length - 1]} of {top} scans converted to Pro.
          </div>
        </div>
      </div>
    </main>
  );
}
