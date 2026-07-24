import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/auth.js";
import { AppLayout } from "./components/layout/AppLayout.js";
import { useTheme } from "./hooks/use-theme.js";
import { useProjectData } from "./hooks/use-project-data.js";
import { useProjects } from "./hooks/use-projects.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { PortfolioPage } from "./pages/PortfolioPage.js";
import { SessionsPage } from "./pages/SessionsPage.js";
import { UnresolvedPage } from "./pages/UnresolvedPage.js";
import { VelocityPage } from "./pages/VelocityPage.js";
import { ForecastPage } from "./pages/ForecastPage.js";
import { IntegrationsPage } from "./pages/IntegrationsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { CreateProjectPage } from "./pages/CreateProjectPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { InvitePage } from "./pages/InvitePage.js";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { useAlerts } from "./hooks/use-alerts.js";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert.js";

function AppRoutes() {
  const { user, loading, setupRequired } = useAuth();
  const { projects, loading: projectsLoading, createProject } = useProjects();
  const [projectId, setProjectId] = useState<string>("");
  const [alertRefresh, setAlertRefresh] = useState(0);

  useEffect(() => {
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const data = useProjectData(projectId);
  const { alerts } = useAlerts(projectId, alertRefresh);

  if (loading || setupRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!projectsLoading && projects.length === 0) {
    return (
      <AppLayout projectId="" onProjectChange={() => {}} projects={[]} onProjectsChange={() => {}}>
        <CreateProjectPage
          onCreate={async (name) => {
            const p = await createProject(name);
            setProjectId(p.id);
          }}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout projectId={projectId} onProjectChange={setProjectId} projects={projects} onProjectsChange={setProjectId}>
      {data.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load project data</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{data.error}</span>
            <Button variant="outline" size="sm" onClick={data.retry} className="shrink-0">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {data.syncMessage && (
        <Alert variant="success" className="mb-6">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Sync complete</AlertTitle>
          <AlertDescription>{data.syncMessage}</AlertDescription>
        </Alert>
      )}

      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert, index) => (
            <Alert key={index} variant={alert.level === "critical" ? "destructive" : "warning"}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Budget alert</AlertTitle>
              <AlertDescription>
                {alert.message} ({alert.usage.toLocaleString()} / {alert.budget.toLocaleString()})
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <DashboardPage
              projectId={projectId}
              sprints={data.sprints}
              selectedSprint={data.selectedSprint}
              setSelectedSprint={data.setSelectedSprint}
              summary={data.summary}
              loading={data.summaryLoading}
            />
          }
        />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route
          path="/sessions"
          element={<SessionsPage projectId={projectId} sprints={data.sprints} />}
        />
        <Route path="/unresolved" element={<UnresolvedPage projectId={projectId} />} />
        <Route
          path="/velocity"
          element={<VelocityPage projectId={projectId} />}
        />
        <Route
          path="/forecast"
          element={
            <ForecastPage
              projectId={projectId}
              forecast={data.forecast}
              forecastTarget={data.forecastTarget}
              setForecastTarget={data.setForecastTarget}
              loading={data.forecastLoading}
            />
          }
        />
        <Route
          path="/integrations"
          element={
            <IntegrationsPage
              projectId={projectId}
              onSync={(message) => {
                data.setSyncMessage(message);
                // Reload sprints/tickets so newly imported data appears without
                // a full page reload.
                data.refetchSprints();
              }}
            />
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              projectId={projectId}
              onBudgetUpdated={() => {
                data.refreshForecast(data.forecastTarget);
                setAlertRefresh((n) => n + 1);
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export function App() {
  // Apply the theme class at the root so unauthenticated pages (login, setup,
  // invite) honor dark mode too — not just the authenticated AppLayout shell.
  useTheme();
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
