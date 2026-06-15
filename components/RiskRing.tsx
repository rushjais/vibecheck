/**
 * Color-coded risk score ring. Score is 0–100 where HIGHER = SAFER.
 */

export type RiskTier = {
  color: string; // ring stroke
  text: string; // number color
  label: string;
};

export function riskTier(score: number): RiskTier {
  if (score >= 70) {
    return { color: "#10b981", text: "text-emerald-600", label: "Looking solid" };
  }
  if (score >= 40) {
    return { color: "#f59e0b", text: "text-amber-500", label: "Some work to do" };
  }
  return { color: "#ef4444", text: "text-red-500", label: "Needs attention before launch" };
}

export default function RiskRing({
  score,
  size = 168,
}: {
  score: number;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const tier = riskTier(clamped);

  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (clamped / 100) * c;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Risk score ${clamped} out of 100 — ${tier.label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#eceae6"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tier.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-[44px] font-bold leading-none tabular-nums ${tier.text}`}>
          {clamped}
        </div>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
          out of 100
        </div>
      </div>
    </div>
  );
}
