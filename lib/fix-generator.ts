import Anthropic from "@anthropic-ai/sdk";

/**
 * Generate corrected file contents for the issues found in one file. The model
 * sees the current file text plus the findings (grounded by their fix_snippet /
 * fix_prompt) and returns the full corrected file. This is pure text generation
 * — the repo is never executed.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export interface FixInput {
  title: string;
  why_it_matters: string;
  fix_snippet: string | null;
  fix_prompt: string;
  line: number | null;
}

const SYSTEM = `You are a senior application-security engineer fixing issues in a single source file.

You are given the file's current contents and a list of security issues found in it. Return the COMPLETE corrected file with those issues fixed.

Rules:
- Make minimal, surgical edits. Change only what's needed to fix the listed issues; preserve all other code, formatting, comments, and imports exactly.
- Keep the file syntactically valid and consistent with its existing style.
- Do not add commentary, explanations, or "// fixed" notes.
- Output ONLY the raw file contents. No markdown, no code fences, no preamble.`;

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z0-9]*\s*\n?/, "").replace(/\n?```$/, "");
  }
  return t;
}

export async function generateFixedFile(
  filePath: string,
  original: string,
  findings: FixInput[],
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const issues = findings
    .map(
      (f, i) =>
        `${i + 1}. ${f.title}\n   Why it matters: ${f.why_it_matters}\n   ${
          f.line != null ? `Around line ${f.line}. ` : ""
        }Fix guidance: ${f.fix_prompt}${
          f.fix_snippet ? `\n   Reference snippet:\n${f.fix_snippet}` : ""
        }`,
    )
    .join("\n\n");

  const user = `File: ${filePath}\n\nISSUES TO FIX:\n${issues}\n\nCURRENT FILE CONTENTS:\n<<<FILE\n${original}\nFILE>>>\n\nReturn the complete corrected contents of ${filePath}.`;

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageStreamParams);

  const message = await stream.finalMessage();
  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const fixed = stripFences(raw);
  if (!fixed.trim() || fixed.trim() === original.trim()) {
    return null; // nothing changed
  }
  return fixed.endsWith("\n") ? fixed : `${fixed}\n`;
}
