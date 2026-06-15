import Anthropic from "@anthropic-ai/sdk";
import type {
  Severity,
  FindingCategory,
} from "@/types/database";

/**
 * The report-generation step — LaunchGuard's core IP. Turns raw scanner output
 * into a plain-English, prioritized report a non-technical founder can act on.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const MAX_RAW_FINDINGS = 60; // bound LLM input

export interface ReportFinding {
  title: string;
  severity: Severity;
  category: FindingCategory;
  plain_explanation: string;
  why_it_matters: string;
  fix_snippet: string | null;
  fix_prompt: string;
  file_path: string | null;
  line: number | null;
}

export interface Report {
  risk_score: number;
  summary: string;
  findings: ReportFinding[];
}

const SYSTEM_PROMPT = `You are a senior application-security engineer explaining risks to a smart but NON-TECHNICAL founder who built their app with AI tools. They do not know what a CWE, CORS, or SQL injection is unless you explain it in one plain sentence.

Your job: turn raw security-scanner output into a report this founder can actually understand and act on.

Hard rules:
- Deduplicate and prioritize the raw findings into the TOP 8 that matter most. If there are fewer than 8 real issues, return fewer. Merge findings that describe the same underlying problem into one.
- Return the findings in PRIORITY ORDER — the single most important issue first.
- For EACH finding produce:
  * title — plain English. NEVER a scanner rule ID, check ID, or code (e.g. never "javascript.lang.security.audit.sqli"). Translate it into something a non-technical person understands.
  * severity — one of: critical, high, medium, low.
  * category — one of: secrets, auth, injection, deps, scaling, config.
  * plain_explanation — what it is, with zero jargon. If you must use a technical term, define it in one plain sentence right there.
  * why_it_matters — the real-world consequence, concretely (e.g. "anyone on the internet could read your users' private messages", not "this violates confidentiality").
  * fix_snippet — concrete corrected code where applicable, otherwise null.
  * fix_prompt — a copy-paste instruction the founder can paste straight into an AI coding agent (Claude Code first, also works in Cursor) to fix it. Write it as a clear, self-contained instruction TO the agent: name the exact file and the precise change, and tell it to make the edit and keep the rest of the file unchanged (e.g. "In src/db/users.ts, replace the raw SQL string on line 42 with a parameterized query using placeholders, leaving the rest of the file as-is.").
  * file_path — the file involved, or null.
  * line — the line number, or null.
- Produce an overall risk_score from 0 to 100 where HIGHER = SAFER (100 = nothing concerning found, 0 = critically unsafe). Weight critical and high issues heavily.
- Write a 2–3 sentence plain-English summary that explicitly names the single most urgent thing to fix first.
- Ground your fixes in the provided file excerpts. Do not invent code that contradicts what the excerpts show.

Return ONLY a JSON object matching the schema. No markdown, no code fences, no preamble.`;

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const CATEGORIES: FindingCategory[] = [
  "secrets",
  "auth",
  "injection",
  "deps",
  "scaling",
  "config",
];

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    risk_score: { type: "integer" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: SEVERITIES },
          category: { type: "string", enum: CATEGORIES },
          plain_explanation: { type: "string" },
          why_it_matters: { type: "string" },
          fix_snippet: { type: ["string", "null"] },
          fix_prompt: { type: "string" },
          file_path: { type: ["string", "null"] },
          line: { type: ["integer", "null"] },
        },
        required: [
          "title",
          "severity",
          "category",
          "plain_explanation",
          "why_it_matters",
          "fix_snippet",
          "fix_prompt",
          "file_path",
          "line",
        ],
      },
    },
  },
  required: ["risk_score", "summary", "findings"],
} as const;

/** Strip stray markdown code fences before JSON.parse. */
function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t.trim();
}

export class ReportGenerationError extends Error {}

/**
 * Call Claude to produce the structured report. Throws ReportGenerationError on
 * any API failure or unparseable output — the caller marks the scan 'failed'.
 */
export async function generateReport(
  repoUrl: string,
  rawFindings: unknown,
  fileExcerpts: string,
): Promise<Report> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ReportGenerationError("ANTHROPIC_API_KEY is not configured.");
  }

  const findings = extractFindings(rawFindings).slice(0, MAX_RAW_FINDINGS);

  const userContent = [
    `Repository: ${repoUrl}`,
    "",
    "RAW SCANNER FINDINGS (JSON):",
    JSON.stringify(findings),
    "",
    "RELEVANT FILE EXCERPTS:",
    fileExcerpts || "(no excerpts available)",
  ].join("\n");

  const client = new Anthropic();

  let rawText: string;
  try {
    // Stream + finalMessage avoids the SDK's long-request timeout guard while
    // adaptive thinking does the prioritization work. output_config.format
    // forces valid JSON; we still parse defensively below.
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32_000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: REPORT_SCHEMA },
      },
      messages: [{ role: "user", content: userContent }],
    } as Anthropic.MessageStreamParams);

    const message = await stream.finalMessage();
    rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    throw new ReportGenerationError(
      `Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    throw new ReportGenerationError("Model did not return valid JSON.");
  }

  return normalizeReport(parsed);
}

function extractFindings(rawFindings: unknown): unknown[] {
  if (
    rawFindings &&
    typeof rawFindings === "object" &&
    Array.isArray((rawFindings as { findings?: unknown }).findings)
  ) {
    return (rawFindings as { findings: unknown[] }).findings;
  }
  if (Array.isArray(rawFindings)) return rawFindings;
  return [];
}

/** Validate + coerce the parsed object into a Report; throw if unusable. */
function normalizeReport(parsed: unknown): Report {
  if (!parsed || typeof parsed !== "object") {
    throw new ReportGenerationError("Report was not an object.");
  }
  const obj = parsed as Record<string, unknown>;

  const rawScore = Number(obj.risk_score);
  const risk_score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 50;

  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : "We finished reviewing your app. See the findings below.";

  const rawList = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: ReportFinding[] = rawList
    .map(coerceFinding)
    .filter((f): f is ReportFinding => f !== null)
    .slice(0, 8);

  return { risk_score, summary, findings };
}

function coerceFinding(raw: unknown): ReportFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;

  const title = typeof f.title === "string" ? f.title.trim() : "";
  if (!title) return null;

  const severity = SEVERITIES.includes(f.severity as Severity)
    ? (f.severity as Severity)
    : "medium";
  const category = CATEGORIES.includes(f.category as FindingCategory)
    ? (f.category as FindingCategory)
    : "config";

  return {
    title,
    severity,
    category,
    plain_explanation:
      typeof f.plain_explanation === "string" ? f.plain_explanation : "",
    why_it_matters:
      typeof f.why_it_matters === "string" ? f.why_it_matters : "",
    fix_snippet: typeof f.fix_snippet === "string" ? f.fix_snippet : null,
    fix_prompt: typeof f.fix_prompt === "string" ? f.fix_prompt : "",
    file_path: typeof f.file_path === "string" ? f.file_path : null,
    line: typeof f.line === "number" ? f.line : null,
  };
}
