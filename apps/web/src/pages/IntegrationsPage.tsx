import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardTitle } from "../components/ui/card.js";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Badge } from "../components/ui/badge.js";
import { PageHeader, ErrorNote } from "../components/ui/page.js";
import { useAuth } from "../context/auth.js";

import { API_URL } from "../lib/api-url.js";

const integrations = [
  {
    id: "github",
    name: "GitHub",
    description: "Sync issues and milestones as tickets and sprints.",
    status: "ready",
  },
  {
    id: "jira",
    name: "Jira",
    description: "Sync Jira issues and sprints.",
    status: "ready",
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Sync GitLab issues and milestones.",
    status: "ready",
  },
];

export function IntegrationsPage({
  projectId,
  onSync,
}: {
  projectId: string;
  onSync: (message: string) => void;
}) {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubBaseUrl, setGithubBaseUrl] = useState("");

  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [jiraStoryPointsField, setJiraStoryPointsField] = useState("");

  const [gitlabBaseUrl, setGitlabBaseUrl] = useState("https://gitlab.com");
  const [gitlabToken, setGitlabToken] = useState("");
  const [gitlabProjectPath, setGitlabProjectPath] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIntegration, setOpenIntegration] = useState<string | null>("github");
  const [savedProvider, setSavedProvider] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; message: string } | null>(null);

  // Test a connection without persisting or syncing (#70). The body carries the
  // current form fields; a blank token reuses the stored one server-side.
  async function handleTest(provider: string, body: Record<string, unknown>) {
    setTesting(provider);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/test/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ provider, ...body }),
      });
      const data = await res.json().catch(() => ({ ok: false, message: "Test failed" }));
      setTestResult({ provider, ok: Boolean(data.ok), message: data.message ?? (data.ok ? "Connected." : "Test failed") });
    } catch (err) {
      setTestResult({ provider, ok: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(null);
    }
  }

  // Pre-populate the form with the saved config (#70). The token is never
  // returned; hasToken tells us one is stored so we can leave the field blank.
  useEffect(() => {
    if (!projectId || !token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`${API_URL}/api/v1/integrations/config/${projectId}`, { headers: authHeader });
      if (!res.ok || cancelled) return;
      const cfg = await res.json();
      if (cancelled) return;
      setSavedProvider(cfg.provider);
      setOpenIntegration(cfg.provider);
      if (cfg.provider === "github") {
        const [owner, repo] = (cfg.repository ?? "").split("/");
        setGithubOwner(owner ?? "");
        setGithubRepo(repo ?? "");
        // Only surface an Enterprise host; public github.com stays the default (blank).
        setGithubBaseUrl(cfg.baseUrl && cfg.baseUrl !== "https://github.com" ? cfg.baseUrl : "");
      } else if (cfg.provider === "jira") {
        setJiraBaseUrl(cfg.baseUrl ?? "");
        setJiraProjectKey(cfg.projectKey ?? "");
        setJiraStoryPointsField(cfg.storyPointsField ?? "");
      } else if (cfg.provider === "gitlab") {
        setGitlabBaseUrl(cfg.baseUrl ?? "https://gitlab.com");
        setGitlabProjectPath(cfg.repository ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
    // authHeader is derived from token; projectId + token are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  async function handleGitHubSync(e: React.FormEvent) {
    e.preventDefault();
    if (!githubOwner || !githubRepo) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/github/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          owner: githubOwner,
          repo: githubRepo,
          token: githubToken || undefined,
          baseUrl: githubBaseUrl.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onSync(`Synced ${data.sprints} sprints and ${data.tickets} tickets from GitHub.${data.failed ? ` ${data.failed} item(s) failed to import — see server logs.` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleJiraSync(e: React.FormEvent) {
    e.preventDefault();
    if (!jiraBaseUrl || !jiraEmail || !jiraProjectKey) return;
    if (!jiraToken && savedProvider !== "jira") return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/jira/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          baseUrl: jiraBaseUrl,
          email: jiraEmail,
          token: jiraToken || undefined,
          projectKey: jiraProjectKey,
          storyPointsField: jiraStoryPointsField.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onSync(`Synced ${data.sprints} sprints and ${data.tickets} tickets from Jira.${data.failed ? ` ${data.failed} item(s) failed to import — see server logs.` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleGitLabSync(e: React.FormEvent) {
    e.preventDefault();
    if (!gitlabBaseUrl || !gitlabProjectPath) return;
    if (!gitlabToken && savedProvider !== "gitlab") return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/integrations/gitlab/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          baseUrl: gitlabBaseUrl,
          token: gitlabToken || undefined,
          projectPath: gitlabProjectPath,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onSync(`Synced ${data.sprints} sprints and ${data.tickets} tickets from GitLab.${data.failed ? ` ${data.failed} item(s) failed to import — see server logs.` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const testResultNote = (provider: string) =>
    testResult && testResult.provider === provider ? (
      <p className={`text-xs ${testResult.ok ? "text-green-600 dark:text-green-500" : "text-destructive"}`}>
        {testResult.ok ? "✓ " : "✗ "}
        {testResult.message}
      </p>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" description="Connect issue trackers to import tickets and sprints." />

      {error && <ErrorNote>Error: {error}</ErrorNote>}

      <div className="space-y-4">
        {integrations.map((integration) => {
          const isOpen = openIntegration === integration.id;
          return (
            <Card key={integration.id}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                data-testid={`integration-${integration.id}`}
                onClick={() => setOpenIntegration(isOpen ? null : integration.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenIntegration(isOpen ? null : integration.id);
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-4 p-6 text-left hover:bg-accent/50"
              >
                <img
                  src={`/logos/${integration.id}.svg`}
                  alt={`${integration.name} logo`}
                  className={`h-8 w-8 ${integration.id === "github" ? "dark:invert" : ""}`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{integration.name}</CardTitle>
                    <Badge variant={integration.status === "ready" ? "success" : "secondary"}>
                      {integration.status === "ready" ? "Ready" : "Soon"}
                    </Badge>
                  </div>
                  <CardDescription>{integration.description}</CardDescription>
                </div>
                {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>

              {isOpen && (
                <CardContent className="border-t">
                  {integration.id === "github" && integration.status === "ready" && (
                    <form onSubmit={handleGitHubSync} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                          <Label htmlFor="githubOwner">Owner</Label>
                          <Input
                            id="githubOwner"
                            value={githubOwner}
                            onChange={(e) => setGithubOwner(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="githubRepo">Repo</Label>
                          <Input id="githubRepo" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} />
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="githubToken">Token (optional)</Label>
                        <Input
                          id="githubToken"
                          type="password"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                          placeholder={savedProvider === "github" ? "Saved — leave blank to keep" : undefined}
                        />
                        <p className="text-xs text-muted-foreground">
                          Needs the <code>repo</code> scope (read).{" "}
                          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="underline">
                            Create a token
                          </a>
                          .
                        </p>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="githubBaseUrl">Enterprise base URL (optional)</Label>
                        <Input
                          id="githubBaseUrl"
                          value={githubBaseUrl}
                          onChange={(e) => setGithubBaseUrl(e.target.value)}
                          placeholder="https://github.example.com"
                        />
                        <p className="text-xs text-muted-foreground">
                          For GitHub Enterprise Server. Leave blank to use github.com.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="submit" disabled={syncing || !githubOwner || !githubRepo || !isAdmin}>
                          {syncing ? "Syncing..." : "Sync from GitHub"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={testing === "github" || !githubOwner || !githubRepo || !isAdmin}
                          onClick={() =>
                            handleTest("github", {
                              owner: githubOwner,
                              repo: githubRepo,
                              token: githubToken || undefined,
                              baseUrl: githubBaseUrl.trim() || undefined,
                            })
                          }
                        >
                          {testing === "github" ? "Testing..." : "Test connection"}
                        </Button>
                      </div>
                      {testResultNote("github")}
                    </form>
                  )}
                  {integration.id === "jira" && integration.status === "ready" && (
                    <form onSubmit={handleJiraSync} className="space-y-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="jiraBaseUrl">Jira base URL</Label>
                        <Input
                          id="jiraBaseUrl"
                          value={jiraBaseUrl}
                          onChange={(e) => setJiraBaseUrl(e.target.value)}
                          placeholder="https://yourdomain.atlassian.net"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="jiraEmail">Email</Label>
                        <Input
                          id="jiraEmail"
                          type="email"
                          value={jiraEmail}
                          onChange={(e) => setJiraEmail(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="jiraToken">API token</Label>
                        <Input
                          id="jiraToken"
                          type="password"
                          value={jiraToken}
                          onChange={(e) => setJiraToken(e.target.value)}
                          placeholder={savedProvider === "jira" ? "Saved — leave blank to keep" : undefined}
                        />
                        <p className="text-xs text-muted-foreground">
                          Create an API token at{" "}
                          <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="underline">
                            id.atlassian.com
                          </a>
                          .
                        </p>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="jiraProjectKey">Project key</Label>
                        <Input
                          id="jiraProjectKey"
                          value={jiraProjectKey}
                          onChange={(e) => setJiraProjectKey(e.target.value)}
                          placeholder="PROJ"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="jiraStoryPointsField">Story points field ID (optional)</Label>
                        <Input
                          id="jiraStoryPointsField"
                          value={jiraStoryPointsField}
                          onChange={(e) => setJiraStoryPointsField(e.target.value)}
                          placeholder="customfield_10016"
                        />
                        <p className="text-xs text-muted-foreground">
                          Jira instances assign different custom field IDs for story points. Leave blank to use the common default.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          disabled={syncing || !jiraBaseUrl || !jiraEmail || !jiraProjectKey || (!jiraToken && savedProvider !== "jira") || !isAdmin}
                        >
                          {syncing ? "Syncing..." : "Sync from Jira"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={testing === "jira" || !jiraBaseUrl || !jiraEmail || (!jiraToken && savedProvider !== "jira") || !isAdmin}
                          onClick={() =>
                            handleTest("jira", {
                              baseUrl: jiraBaseUrl,
                              email: jiraEmail,
                              token: jiraToken || undefined,
                            })
                          }
                        >
                          {testing === "jira" ? "Testing..." : "Test connection"}
                        </Button>
                      </div>
                      {testResultNote("jira")}
                    </form>
                  )}
                  {integration.id === "gitlab" && integration.status === "ready" && (
                    <form onSubmit={handleGitLabSync} className="space-y-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="gitlabBaseUrl">GitLab base URL</Label>
                        <Input
                          id="gitlabBaseUrl"
                          value={gitlabBaseUrl}
                          onChange={(e) => setGitlabBaseUrl(e.target.value)}
                          placeholder="https://gitlab.com"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="gitlabToken">Access token</Label>
                        <Input
                          id="gitlabToken"
                          type="password"
                          value={gitlabToken}
                          onChange={(e) => setGitlabToken(e.target.value)}
                          placeholder={savedProvider === "gitlab" ? "Saved — leave blank to keep" : undefined}
                        />
                        <p className="text-xs text-muted-foreground">
                          Needs the <code>read_api</code> scope.{" "}
                          <a
                            href={`${gitlabBaseUrl.endsWith("/") ? gitlabBaseUrl.slice(0, -1) : gitlabBaseUrl}/-/user_settings/personal_access_tokens`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Create a token
                          </a>
                          .
                        </p>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="gitlabProjectPath">Project path (group/project)</Label>
                        <Input
                          id="gitlabProjectPath"
                          value={gitlabProjectPath}
                          onChange={(e) => setGitlabProjectPath(e.target.value)}
                          placeholder="group/project"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          disabled={syncing || !gitlabBaseUrl || !gitlabProjectPath || (!gitlabToken && savedProvider !== "gitlab") || !isAdmin}
                        >
                          {syncing ? "Syncing..." : "Sync from GitLab"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={testing === "gitlab" || !gitlabBaseUrl || !gitlabProjectPath || (!gitlabToken && savedProvider !== "gitlab") || !isAdmin}
                          onClick={() =>
                            handleTest("gitlab", {
                              baseUrl: gitlabBaseUrl,
                              token: gitlabToken || undefined,
                              projectPath: gitlabProjectPath,
                            })
                          }
                        >
                          {testing === "gitlab" ? "Testing..." : "Test connection"}
                        </Button>
                      </div>
                      {testResultNote("gitlab")}
                    </form>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

