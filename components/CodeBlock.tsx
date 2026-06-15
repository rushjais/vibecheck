"use client";

import { Highlight, themes } from "prism-react-renderer";
import CopyButton from "@/components/CopyButton";

const EXT_TO_LANG: Record<string, string> = {
  ts: "tsx",
  tsx: "tsx",
  js: "jsx",
  jsx: "jsx",
  mjs: "jsx",
  cjs: "jsx",
  json: "json",
  py: "python",
  rb: "ruby",
  go: "go",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
};

function languageFor(filePath: string | null): string {
  if (!filePath) return "tsx";
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "tsx";
}

export default function CodeBlock({
  code,
  filePath,
}: {
  code: string;
  filePath?: string | null;
}) {
  const language = languageFor(filePath ?? null);
  const trimmed = code.replace(/\n+$/, "");

  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5">
        <span className="font-mono text-xs text-neutral-400">
          {filePath ?? "suggested fix"}
        </span>
        <CopyButton
          text={trimmed}
          idleLabel="Copy"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
        />
      </div>
      <Highlight code={trimmed} language={language} theme={themes.vsDark}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} overflow-x-auto p-4 text-[13px] leading-relaxed`}
            style={{ ...style, background: "transparent" }}
          >
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  {line.map((token, key) => {
                    const tokenProps = getTokenProps({ token });
                    return <span key={key} {...tokenProps} />;
                  })}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
