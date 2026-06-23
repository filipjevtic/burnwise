import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/auth.js";
import { AppLayout } from "./components/layout/AppLayout.js";
import { useProjectData } from "./hooks/use-project-data.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ForecastPage } from "./pages/ForecastPage.js";
import { IntegrationsPage } from "./pages/IntegrationsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useAlerts } from "./hooks/use-alerts.js";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert.js";

function AppRoutes() {
  const { user, loading, setupRequired } = useAuth();
  const [projectId, setProjectId] = useState<string>("default");
  const [alertRefresh, setAlertRefresh] = useState(0);
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
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppLayout projectId={projectId} onProjectChange={setProjectId}>
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
                fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/v1/sprints/project/${projectId}`)
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
