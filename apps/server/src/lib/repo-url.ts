/**
 * Normalize user-entered GitHub/GitLab repo identifiers to their bare parts
 * (#70). People paste full URLs ("https://github.com/foo/bar", ".git" suffixes,
 * trailing slashes) into fields that the APIs expect as plain "owner"/"repo" or
 * "group/project", which then 404. This strips them to the canonical form.
 */

/** Strip a git host URL / .git suffix / slashes down to the "a/b/..." path. */
function toPath(input: string): string {
  let s = input.trim();
  // Drop scheme + host: https://github.com/foo/bar or git@github.com:foo/bar
  s = s.replace(/^[a-z]+:\/\/[^/]+\//i, "").replace(/^git@[^:]+:/i, "");
  s = s.replace(/\.git$/i, "");
  s = s.replace(/^\/+/, "").replace(/\/+$/, "");
  return s;
}

/**
 * Resolve GitHub owner + repo from possibly-URL inputs. A full URL or "owner/repo"
 * in either field is accepted; the repo's own owner wins if both are given.
 * Returns null when an owner and repo can't be determined.
 */
export function parseGitHubRepo(ownerInput: string, repoInput: string): { owner: string; repo: string } | null {
  const repoPath = toPath(repoInput || "");
  const ownerPath = toPath(ownerInput || "");

  // If repo carries the full "owner/repo" (or a URL), it's authoritative.
  const repoParts = repoPath.split("/").filter(Boolean);
  if (repoParts.length >= 2) {
    return { owner: repoParts[repoParts.length - 2], repo: repoParts[repoParts.length - 1] };
  }
  // Otherwise owner may hold "owner/repo" (e.g. a URL pasted there).
  const ownerParts = ownerPath.split("/").filter(Boolean);
  if (repoParts.length === 1 && ownerParts.length >= 2) {
    return { owner: ownerParts[ownerParts.length - 1], repo: repoParts[0] };
  }
  if (repoParts.length === 1 && ownerParts.length === 1) {
    return { owner: ownerParts[0], repo: repoParts[0] };
  }
  if (repoParts.length === 0 && ownerParts.length >= 2) {
    return { owner: ownerParts[ownerParts.length - 2], repo: ownerParts[ownerParts.length - 1] };
  }
  return null;
}

/** Normalize a GitLab project path ("group/subgroup/project"), stripping any URL. */
export function parseGitLabProjectPath(input: string): string | null {
  const path = toPath(input || "");
  return path.split("/").filter(Boolean).length >= 2 ? path : null;
}
