/**
 * Plain-English validation for a public GitHub repo URL.
 *
 * Isomorphic (no Node/browser-only APIs) so it runs on both the client form
 * and the server route handler. It checks *shape* only — whether a repo is
 * actually public/reachable is verified separately (network call) in the API.
 */

export type RepoValidation =
  | { ok: true; owner: string; repo: string; url: string }
  | { ok: false; error: string };

const NAME_RE = /^[A-Za-z0-9._-]+$/;

export function validateRepoUrl(raw: string): RepoValidation {
  const input = (raw ?? "").trim();

  if (!input) {
    return { ok: false, error: "Paste your GitHub repo link to get started." };
  }

  // SSH / git protocol forms — common when people copy the wrong button.
  if (/^git@/i.test(input) || /^ssh:\/\//i.test(input)) {
    return {
      ok: false,
      error:
        "That's an SSH link. Paste the web address instead — the one that starts with https://github.com/.",
    };
  }
  if (/^git:\/\//i.test(input)) {
    return {
      ok: false,
      error:
        "Paste the web address from your repo's page — it starts with https://github.com/.",
    };
  }

  let url: URL;
  try {
    // Be forgiving: accept "github.com/owner/repo" without the scheme.
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return {
      ok: false,
      error:
        "That doesn't look like a link. Paste the address from your repo's GitHub page (it starts with https://github.com/).",
    };
  }

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return {
      ok: false,
      error:
        "We can only scan public repos on GitHub right now. Paste a link that starts with https://github.com/.",
    };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return {
      ok: false,
      error:
        "That link is missing the project name. It should look like https://github.com/owner/repo.",
    };
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");

  if (!NAME_RE.test(owner) || !NAME_RE.test(repo)) {
    return {
      ok: false,
      error:
        "That doesn't look like a valid repo link. It should look like https://github.com/owner/repo.",
    };
  }

  return { ok: true, owner, repo, url: `https://github.com/${owner}/${repo}` };
}
