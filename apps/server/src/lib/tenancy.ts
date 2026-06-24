/**
 * Tenancy onboarding rules.
 *
 * Burnwise is single-workspace-per-install by default. All data access is
 * scoped to the workspace carried in the caller's JWT (enforced by the
 * assert*InWorkspace guards and workspace-filtered queries), so multi-tenancy is
 * a configuration switch rather than a data-model change. This helper is the one
 * place that decides whether a new workspace may be onboarded.
 */

/**
 * Whether a new workspace may be created/onboarded.
 *
 * - When multi-workspace is enabled, always allowed.
 * - Otherwise, only allowed while no workspace exists yet (first-run setup).
 */
export function canOnboardWorkspace(
  existingWorkspaceCount: number,
  multiWorkspaceEnabled: boolean
): boolean {
  return multiWorkspaceEnabled || existingWorkspaceCount <= 0;
}
