/**
 * Minimal GitHub write client for opening fix PRs. Uses the Contents + Git Refs
 * REST API with the Pro user's OAuth token. We ONLY read and write file text —
 * we never clone, build, or execute the repository.
 */

const GH = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "LaunchGuard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export async function getDefaultBranch(
  token: string,
  owner: string,
  repo: string,
): Promise<{ branch: string; sha: string }> {
  const repoRes = await fetch(`${GH}/repos/${owner}/${repo}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!repoRes.ok) {
    throw new GitHubError(
      repoRes.status === 404
        ? "Repository not found, or your GitHub account can't access it."
        : "Couldn't read the repository from GitHub.",
      repoRes.status,
    );
  }
  const repoData = (await repoRes.json()) as { default_branch: string };
  const branch = repoData.default_branch;

  const refRes = await fetch(
    `${GH}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (!refRes.ok) {
    throw new GitHubError("Couldn't read the default branch.", refRes.status);
  }
  const refData = (await refRes.json()) as { object: { sha: string } };
  return { branch, sha: refData.object.sha };
}

export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  newBranch: string,
  fromSha: string,
): Promise<void> {
  const res = await fetch(`${GH}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  });
  if (!res.ok) {
    const msg =
      res.status === 403 || res.status === 404
        ? "We don't have write access to this repo. You need to own it (or have push access)."
        : "Couldn't create a branch on GitHub.";
    throw new GitHubError(msg, res.status);
  }
}

export async function getFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(
    `${GH}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new GitHubError(`Couldn't read ${path} from GitHub.`, res.status);
  }
  const data = (await res.json()) as { content?: string; sha: string; type?: string };
  if (data.type !== "file" || !data.content) return null;
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  newContent: string,
  fileSha: string,
  branch: string,
  message: string,
): Promise<void> {
  const res = await fetch(
    `${GH}/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(newContent, "utf-8").toString("base64"),
        sha: fileSha,
        branch,
      }),
    },
  );
  if (!res.ok) {
    throw new GitHubError(`Couldn't commit ${path}.`, res.status);
  }
}

export async function openPullRequest(
  token: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<{ url: string; number: number }> {
  const res = await fetch(`${GH}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ title, head, base, body }),
  });
  if (!res.ok) {
    throw new GitHubError("Couldn't open the pull request.", res.status);
  }
  const data = (await res.json()) as { html_url: string; number: number };
  return { url: data.html_url, number: data.number };
}
