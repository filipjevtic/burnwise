import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/auth.js";
import { AppLayout } from "./components/layout/AppLayout.js";
import { useProjectData } from "./hooks/use-project-data.js";
import { useProjects } from "./hooks/use-projects.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ForecastPage } from "./pages/ForecastPage.js";
import { IntegrationsPage } from "./pages/IntegrationsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { CreateProjectPage } from "./pages/CreateProjectPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useAlerts } from "./hooks/use-alerts.js";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert.js";

function AppRoutes() {
  const { user, token, loading, setupRequired } = useAuth();
  const { projects, loading: projectsLoading, createProject, seedDemo } = useProjects();
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
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
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
          onLoadDemo={async () => {
            const { projectId: id } = await seedDemo();
            setProjectId(id);
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
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      )}
      {data.syncMessage && (
        <Alert className="mb-6 border-green-500/50 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-200">
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
              sprints={data.sprints}
              selectedSprint={data.selectedSprint}
              setSelectedSprint={data.setSelectedSprint}
              summary={data.summary}
              loading={data.summaryLoading}
            />
          }
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
                const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
                fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/v1/sprints/project/${projectId}`, { headers: h })
                  .then((res) => res.json())
                  .then((d) => data.sprints !== d.sprints && d.sprints)
                  .catch(() => null);
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
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
