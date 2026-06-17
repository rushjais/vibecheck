/**
 * Fetch small file excerpts from a public GitHub repo so the report LLM can
 * ground its fixes in the real code. The scan engine's clone is ephemeral and
 * already deleted by this point, so we re-read just the relevant lines via the
 * GitHub contents API. Everything here is size-capped to keep LLM input bounded.
 */

const MAX_FILES = 12;
const WINDOW = 6; // lines of context on each side of a finding's line
const MAX_FILE_LINES = 200; // include whole file only if it's small
const MAX_TOTAL_CHARS = 16_000; // hard cap across all excerpts

type RawFinding = {
  file_path?: string | null;
  line?: number | null;
};

async function fetchFile(
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        headers: {
          Accept: "application/vnd.github.raw+json",
          "User-Agent": "Vibecheck",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Merge target line numbers into non-overlapping [start, end] windows. */
function windows(lines: number[], totalLines: number): Array<[number, number]> {
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
  const result: Array<[number, number]> = [];
  for (const ln of sorted) {
    const start = Math.max(1, ln - WINDOW);
    const end = Math.min(totalLines, ln + WINDOW);
    const last = result[result.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      result.push([start, end]);
    }
  }
  return result;
}

function renderExcerpt(path: string, content: string, targetLines: number[]): string {
  const lines = content.split("\n");
  const numbered = (from: number, to: number) =>
    lines
      .slice(from - 1, to)
      .map((l, i) => `${from + i}\t${l}`)
      .join("\n");

  let body: string;
  if (lines.length <= MAX_FILE_LINES) {
    body = numbered(1, lines.length);
  } else if (targetLines.length === 0) {
    body = numbered(1, MAX_FILE_LINES);
  } else {
    body = windows(targetLines, lines.length)
      .map(([s, e]) => numbered(s, e))
      .join("\n  …\n");
  }

  return `--- ${path} ---\n${body}`;
}

/**
 * Build a single text blob of file excerpts for the findings that reference a
 * file. Returns "" when nothing could be fetched.
 */
export async function buildFileExcerpts(
  owner: string,
  repo: string,
  findings: RawFinding[],
): Promise<string> {
  // Group target line numbers by file path.
  const byFile = new Map<string, number[]>();
  for (const f of findings) {
    if (!f.file_path) continue;
    const lines = byFile.get(f.file_path) ?? [];
    if (typeof f.line === "number") lines.push(f.line);
    byFile.set(f.file_path, lines);
  }

  const paths = Array.from(byFile.keys()).slice(0, MAX_FILES);
  const excerpts: string[] = [];
  let total = 0;

  for (const path of paths) {
    const content = await fetchFile(owner, repo, path);
    if (content == null) continue;
    const excerpt = renderExcerpt(path, content, byFile.get(path) ?? []);
    if (total + excerpt.length > MAX_TOTAL_CHARS) {
      excerpts.push(`--- ${path} ---\n(omitted — excerpt budget reached)`);
      break;
    }
    excerpts.push(excerpt);
    total += excerpt.length;
  }

  return excerpts.join("\n\n");
}
