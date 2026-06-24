/**
 * Project-level role hierarchy and the rules for resolving a caller's effective
 * role on a project.
 *
 * Modeled on two-level RBAC used by comparable platforms (Langfuse Org→Project,
 * Sentry, GitHub orgs):
 *   - Workspace (org) admins/owners implicitly have full access to every
 *     project in their workspace — they bypass project membership.
 *   - Everyone else is governed by their explicit `TeamMember` role on the
 *     project, falling back to a read-only default so ordinary workspace members
 *     keep the visibility they have today (single-workspace installs).
 *
 * Capability mapping used by routes:
 *   - read project data            → viewer+
 *   - write project data           → member+
 *   - manage team / settings / del → admin+ (owner is admin's superset)
 */

export type ProjectRole = "viewer" | "member" | "admin" | "owner";

export const PROJECT_ROLES: ProjectRole[] = ["viewer", "member", "admin", "owner"];

const RANK: Record<ProjectRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

/** Workspace-level roles that grant implicit owner access to all projects. */
const WORKSPACE_SUPERUSER_ROLES = new Set(["admin", "owner"]);

/** Default project role for a workspace member with no explicit membership. */
export const DEFAULT_PROJECT_ROLE: ProjectRole = "viewer";

/** Numeric rank of a role; unknown values rank as 0 (below viewer). */
export function roleRank(role: string | null | undefined): number {
  if (!role) return 0;
  return RANK[role.toLowerCase() as ProjectRole] ?? 0;
}

/** True when `actual` meets or exceeds the `required` role. */
export function roleSatisfies(actual: string | null | undefined, required: ProjectRole): boolean {
  return roleRank(actual) >= RANK[required];
}

/** Coerce an arbitrary string to a known ProjectRole, defaulting to viewer. */
export function normalizeProjectRole(role: string | null | undefined): ProjectRole {
  const lower = (role ?? "").toLowerCase();
  return (PROJECT_ROLES as string[]).includes(lower) ? (lower as ProjectRole) : DEFAULT_PROJECT_ROLE;
}

/**
 * Resolve a caller's effective project role from their workspace role and their
 * explicit project membership (if any).
 *
 * - Workspace admins/owners → `owner` (full access, bypassing membership).
 * - Otherwise → the explicit membership role, or `DEFAULT_PROJECT_ROLE` when the
 *   user has no membership on the project.
 */
export function effectiveProjectRole(
  workspaceRole: string | null | undefined,
  membershipRole: string | null | undefined
): ProjectRole {
  if (workspaceRole && WORKSPACE_SUPERUSER_ROLES.has(workspaceRole.toLowerCase())) {
    return "owner";
  }
  if (membershipRole) return normalizeProjectRole(membershipRole);
  return DEFAULT_PROJECT_ROLE;
}
