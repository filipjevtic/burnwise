import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { Switch } from "../components/ui/switch.js";
import { PageHeader, ErrorNote } from "../components/ui/page.js";
import { useTeam, type TeamRole } from "../hooks/use-team.js";
import { useWorkspace } from "../hooks/use-workspace.js";
import { useApiKeys, type CreatedApiKey } from "../hooks/use-api-keys.js";
import { useAuth } from "../context/auth.js";
import { Wallet, Users, Link2, Copy, Check, KeyRound, Trash2 } from "lucide-react";
import { cn } from "../lib/utils.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const ROLES: TeamRole[] = ["owner", "admin", "member", "viewer"];

export function SettingsPage({
  projectId,
  onBudgetUpdated,
}: {
  projectId: string;
  onBudgetUpdated: () => void;
}) {
  const [tokenBudget, setTokenBudget] = useState<string>("");
  const [costBudget, setCostBudget] = useState<string>("");
  const [tokenThreshold, setTokenThreshold] = useState<string>("80");
  const [costThreshold, setCostThreshold] = useState<string>("80");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (!projectId || !token) return;
    fetch(`${API_URL}/api/v1/projects`, { headers: authHeader })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const project = data?.projects?.find((p: { id: string }) => p.id === projectId);
        if (!project) return;
        if (project.tokenBudget != null) setTokenBudget(String(project.tokenBudget));
        if (project.costBudget != null) setCostBudget(String(project.costBudget));
        if (project.tokenBudgetAlertThreshold != null) setTokenThreshold(String(project.tokenBudgetAlertThreshold));
        if (project.costBudgetAlertThreshold != null) setCostThreshold(String(project.costBudgetAlertThreshold));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);
  const { members, loading: teamLoading, error: teamError, addMember, removeMember, updateMember } = useTeam(projectId);
  const { workspace, update: updateWorkspace } = useWorkspace();
  const [traceViewerUrl, setTraceViewerUrl] = useState("");
  const [savingViewer, setSavingViewer] = useState(false);
  useEffect(() => {
    if (workspace) setTraceViewerUrl(workspace.traceViewerUrlTemplate ?? "");
  }, [workspace]);

  // CI webhook config (#183): per-project secret + pinned provider (admin only).
  const [ciConfigured, setCiConfigured] = useState(false);
  const [ciSecret, setCiSecret] = useState("");
  const [ciProvider, setCiProvider] = useState("");
  const [savingCi, setSavingCi] = useState(false);
  const [ciError, setCiError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || !token || !isAdmin) return;
    fetch(`${API_URL}/api/v1/ci/config/${projectId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setCiConfigured(Boolean(data.configured));
        setCiProvider(data.provider ?? "");
      })
      .catch(() => {});
  }, [projectId, token, isAdmin]);

  async function saveCiConfig(body: { secret?: string | null; provider?: string | null }) {
    setSavingCi(true);
    setCiError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/ci/config/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCiConfigured(Boolean(data.configured));
      setCiProvider(data.provider ?? "");
      setCiSecret("");
    } catch (err) {
      setCiError(err instanceof Error ? err.message : "Failed to save CI webhook config");
    } finally {
      setSavingCi(false);
    }
  }
  const [memberEmail, setMemberEmail] = useState("");
  const [memberDisplayName, setMemberDisplayName] = useState("");
  const [memberRole, setMemberRole] = useState<TeamRole>("member");
  const [teamActionLoading, setTeamActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"budget" | "team" | "keys">("budget");

  const { keys, loading: keysLoading, error: keysError, createKey, revokeKey } = useApiKeys();
  const [keyNote, setKeyNote] = useState("");
  const [keyScope, setKeyScope] = useState<"workspace" | "project">("workspace");
  const [keyLoading, setKeyLoading] = useState(false);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyLoading(true);
    setError(null);
    setNewKey(null);
    try {
      const created = await createKey({
        note: keyNote || undefined,
        scope: keyScope,
        projectId: keyScope === "project" ? projectId : undefined,
      });
      setNewKey(created);
      setKeyNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setKeyLoading(false);
    }
  }

  async function copyNewKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.secret);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  const [inviteRole, setInviteRole] = useState<TeamRole>("member");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteLink(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ projectId, role: inviteRole, email: inviteEmail || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInviteLink(data.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          tokenBudget: tokenBudget ? Number(tokenBudget) : null,
          costBudget: costBudget ? Number(costBudget) : null,
          tokenBudgetAlertThreshold: tokenThreshold ? Number(tokenThreshold) : null,
          costBudgetAlertThreshold: costThreshold ? Number(costThreshold) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess("Budget updated successfully.");
      onBudgetUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage project budgets and team access." />

      {error && <ErrorNote>Error: {error}</ErrorNote>}
      {success && (
        <div className="rounded-md border border-success/25 bg-success/10 p-3 text-sm text-success">{success}</div>
      )}

      <div className="border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("budget")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
              activeTab === "budget"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Wallet className="h-4 w-4" />
            Budget
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
              activeTab === "team"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-4 w-4" />
            Team
          </button>
          <button
            onClick={() => setActiveTab("keys")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
              activeTab === "keys"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <KeyRound className="h-4 w-4" />
            API Keys
          </button>
        </div>
      </div>

      {activeTab === "budget" && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              Project budget
            </CardTitle>
            <CardDescription>Set token and cost budgets for project {projectId}.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="tokenBudget">Token budget</Label>
                  <Input
                    id="tokenBudget"
                    type="number"
                    value={tokenBudget}
                    onChange={(e) => setTokenBudget(e.target.value)}
                    placeholder="e.g. 50000"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="costBudget">Cost budget (USD)</Label>
                  <Input
                    id="costBudget"
                    type="number"
                    step="0.01"
                    value={costBudget}
                    onChange={(e) => setCostBudget(e.target.value)}
                    placeholder="e.g. 5.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="tokenThreshold">Token alert threshold (%)</Label>
                  <Input
                    id="tokenThreshold"
                    type="number"
                    min="0"
                    max="100"
                    value={tokenThreshold}
                    onChange={(e) => setTokenThreshold(e.target.value)}
                    placeholder="80"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="costThreshold">Cost alert threshold (%)</Label>
                  <Input
                    id="costThreshold"
                    type="number"
                    min="0"
                    max="100"
                    value={costThreshold}
                    onChange={(e) => setCostThreshold(e.target.value)}
                    placeholder="80"
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving || !isAdmin}>
                {saving ? "Saving..." : "Save budget"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === "budget" && (
        <Card className="mt-6 max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              CI webhook
            </CardTitle>
            <CardDescription>
              A per-project secret to authenticate CI cost webhooks, so a leaked secret can't forge
              events into other projects. Pin a provider to restrict verification to its method.
              {ciConfigured ? " A secret is currently set." : " No secret set yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ciError && <ErrorNote>{ciError}</ErrorNote>}
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ciSecret">{ciConfigured ? "Replace secret" : "Secret"}</Label>
                <Input
                  id="ciSecret"
                  type="password"
                  autoComplete="new-password"
                  value={ciSecret}
                  disabled={!isAdmin}
                  placeholder={ciConfigured ? "•••••••• (leave blank to keep)" : "a long random string"}
                  onChange={(e) => setCiSecret(e.target.value)}
                />
              </div>
              <div className="grid max-w-xs gap-1.5">
                <Label htmlFor="ciProvider">Provider (verification method)</Label>
                <Select
                  id="ciProvider"
                  value={ciProvider}
                  disabled={!isAdmin}
                  onChange={(e) => setCiProvider(e.target.value)}
                >
                  <option value="">Any (accept any supported header)</option>
                  <option value="github">GitHub (HMAC signature)</option>
                  <option value="gitlab">GitLab (token)</option>
                  <option value="generic">Generic (bearer token)</option>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={!isAdmin || savingCi}
                  onClick={() => saveCiConfig({ ...(ciSecret ? { secret: ciSecret } : {}), provider: ciProvider || null })}
                >
                  {savingCi ? "Saving…" : "Save"}
                </Button>
                {ciConfigured && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isAdmin || savingCi}
                    onClick={() => saveCiConfig({ secret: null, provider: null })}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "keys" && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              Personal API keys
            </CardTitle>
            <CardDescription>
              Use a personal key (bw_sk_…) with the CLI, proxy, and IDE so your AI usage is
              attributed to you. The secret is shown only once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {keysError && <ErrorNote>Error: {keysError}</ErrorNote>}

            <form onSubmit={handleCreateKey} className="flex flex-wrap items-end gap-2 rounded-md border p-4">
              <div className="grid gap-1.5 flex-1 min-w-[160px]">
                <Label htmlFor="keyNote" className="text-xs">Note (optional)</Label>
                <Input
                  id="keyNote"
                  placeholder="e.g. laptop CLI"
                  value={keyNote}
                  onChange={(e) => setKeyNote(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="keyScope" className="text-xs">Scope</Label>
                <Select
                  id="keyScope"
                  value={keyScope}
                  onChange={(e) => setKeyScope(e.target.value as "workspace" | "project")}
                >
                  <option value="workspace">Workspace</option>
                  <option value="project">This project</option>
                </Select>
              </div>
              <Button type="submit" size="sm" disabled={keyLoading}>
                {keyLoading ? "Creating…" : "Create key"}
              </Button>
            </form>

            {newKey && (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/10 p-4">
                <p className="text-sm font-medium text-success">
                  Copy your new key now — it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <Input value={newKey.secret} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={copyNewKey} className="shrink-0">
                    {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Your keys</h3>
              {keysLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No API keys yet.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {keys.map((key) => (
                    <li key={key.id} className="flex items-center justify-between p-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm">{key.displaySecretKey}</span>
                        <span className="text-xs text-muted-foreground">
                          {key.note || "(no note)"} · {key.scope}
                          {key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " · never used"}
                          {!key.isActive && " · revoked"}
                        </span>
                      </div>
                      {key.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={async () => {
                            try {
                              await revokeKey(key.id);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to revoke key");
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "team" && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              Team members
            </CardTitle>
            <CardDescription>Manage who can access project {projectId}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {teamError && <ErrorNote>Error: {teamError}</ErrorNote>}

            {workspace && (
              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Per-developer attribution</div>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Show AI-effort broken down by individual developer. Keep this on for capacity planning; turn it off to keep Burnwise strictly team-level (no individual leaderboards).
                  </p>
                </div>
                <Switch
                  checked={workspace.showDeveloperAttribution}
                  disabled={!isAdmin}
                  aria-label="Show per-developer attribution"
                  onChange={async (e) => {
                    try {
                      await updateWorkspace({ showDeveloperAttribution: e.target.checked });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to update workspace setting");
                    }
                  }}
                />
              </div>
            )}

            {workspace && (
              <div className="space-y-2 rounded-md border border-border p-4">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Trace viewer deep-link</div>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Optional. An https URL to your OTel-native trace viewer (Langfuse, Phoenix, …) with a{" "}
                    <code className="font-mono">{"{traceId}"}</code> placeholder. When set, trace spans link out to it.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={traceViewerUrl}
                    disabled={!isAdmin}
                    placeholder="https://cloud.langfuse.com/project/abc/traces/{traceId}"
                    onChange={(e) => setTraceViewerUrl(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isAdmin || savingViewer || traceViewerUrl === (workspace.traceViewerUrlTemplate ?? "")}
                    onClick={async () => {
                      setSavingViewer(true);
                      try {
                        await updateWorkspace({ traceViewerUrlTemplate: traceViewerUrl.trim() || null });
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update trace viewer URL");
                      } finally {
                        setSavingViewer(false);
                      }
                    }}
                  >
                    {savingViewer ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            )}

            {!isAdmin && (
              <p className="text-sm text-muted-foreground">
                You have read-only access. Contact an admin to make changes.
              </p>
            )}

            {isAdmin && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4" />
                  Generate invite link
                </div>
                <form onSubmit={handleCreateInvite} className="flex flex-wrap gap-2 items-end">
                  <div className="grid gap-1.5 flex-1 min-w-[160px]">
                    <Label htmlFor="inviteEmail" className="text-xs">Email (optional)</Label>
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="lock to address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="inviteRole" className="text-xs">Role</Label>
                    <Select
                      id="inviteRole"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </div>
                  <Button type="submit" variant="outline" size="sm" disabled={inviteLoading}>
                    {inviteLoading ? "Generating…" : "Generate link"}
                  </Button>
                </form>
                {inviteLink && (
                  <div className="flex items-center gap-2">
                    <Input value={inviteLink} readOnly className="text-xs font-mono" />
                    <Button variant="outline" size="sm" onClick={copyInviteLink} className="shrink-0">
                      {inviteCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!memberEmail || !isAdmin) return;
                setTeamActionLoading(true);
                try {
                  await addMember({
                    email: memberEmail,
                    displayName: memberDisplayName || undefined,
                    role: memberRole,
                  });
                  setMemberEmail("");
                  setMemberDisplayName("");
                  setMemberRole("member");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to add member");
                } finally {
                  setTeamActionLoading(false);
                }
              }}
              className={cn("space-y-4", !isAdmin && "opacity-50 pointer-events-none")}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="memberEmail">Email</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="colleague@example.com"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="memberDisplayName">Display name (optional)</Label>
                  <Input
                    id="memberDisplayName"
                    value={memberDisplayName}
                    onChange={(e) => setMemberDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="memberRole">Role</Label>
                  <Select
                    id="memberRole"
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as TeamRole)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={teamActionLoading || !memberEmail || !isAdmin}>
                {teamActionLoading ? "Adding..." : "Add member"}
              </Button>
            </form>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Members</h3>
              {teamLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between p-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {member.displayName || member.email}
                        </span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin ? (
                          <>
                            <Select
                              value={member.role}
                              onChange={async (e) => {
                                const role = e.target.value as TeamRole;
                                setTeamActionLoading(true);
                                try {
                                  await updateMember(member.userId, role);
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Failed to update role");
                                } finally {
                                  setTeamActionLoading(false);
                                }
                              }}
                              aria-label="Member role"
                            >
                              {ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setTeamActionLoading(true);
                                try {
                                  await removeMember(member.userId);
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Failed to remove member");
                                } finally {
                                  setTeamActionLoading(false);
                                }
                              }}
                              disabled={teamActionLoading}
                            >
                              Remove
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">{member.role}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
