import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Gauge, Plug, Settings, Sun, Moon, Monitor, Check, Menu, X, LogOut } from "lucide-react";
import { Button } from "../ui/button.js";
import { useTheme } from "../../hooks/use-theme.js";
import { useAuth } from "../../context/auth.js";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/forecast", label: "Forecast", icon: Gauge },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  location,
  onNavigate,
}: {
  location: ReturnType<typeof useLocation>;
  onNavigate?: () => void;
}) {
  return (
    <>
      {nav.map((item) => {
        const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors " +
              (isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        );
      })}
    </>
  );
}

export function AppLayout({
  children,
  projectId,
  onProjectChange,
}: {
  children: React.ReactNode;
  projectId: string;
  onProjectChange: (value: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [draftProjectId, setDraftProjectId] = React.useState(projectId);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setDraftProjectId(projectId);
  }, [projectId]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="hidden lg:flex w-64 flex-col border-r bg-background">
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <img src="/logo-icon.png" alt="Burnwise" className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">Burnwise</span>
          </div>

          <div className="border-b p-4">
            <label htmlFor="projectId" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Project
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="projectId"
                value={draftProjectId}
                onChange={(e) => setDraftProjectId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onProjectChange(draftProjectId)}
                placeholder="default"
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                onClick={() => onProjectChange(draftProjectId)}
                aria-label="Apply project"
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            <NavLinks location={location} />
          </nav>

          <div className="border-t p-3 space-y-1">
            {user && (
              <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                {user.displayName || user.email}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Moon className="mr-2 h-4 w-4" /> : theme === "light" ? <Sun className="mr-2 h-4 w-4" /> : <Monitor className="mr-2 h-4 w-4" />}
              Theme
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex-1">
          <header className="lg:hidden flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <img src="/logo-icon.png" alt="Burnwise" className="h-7 w-7" />
              <span className="font-semibold tracking-tight">Burnwise</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{projectId}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              </Button>
            </div>
          </header>

          {mobileOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
              <div className="absolute left-0 top-0 h-full w-64 bg-background shadow-lg">
                <div className="flex h-14 items-center justify-between border-b px-4">
                  <div className="flex items-center gap-2">
                    <img src="/logo-icon.png" alt="Burnwise" className="h-8 w-8" />
                    <span className="text-lg font-semibold tracking-tight">Burnwise</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                <div className="border-b p-4">
                  <label htmlFor="projectId" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Project
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="projectId"
                      value={draftProjectId}
                      onChange={(e) => setDraftProjectId(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onProjectChange(draftProjectId)}
                      placeholder="default"
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      onClick={() => onProjectChange(draftProjectId)}
                      aria-label="Apply project"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <nav className="p-3 space-y-1">
                  <NavLinks location={location} onNavigate={() => setMobileOpen(false)} />
                </nav>

                <div className="border-t p-3 space-y-1">
                  {user && (
                    <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                      {user.displayName || user.email}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? <Moon className="mr-2 h-4 w-4" /> : theme === "light" ? <Sun className="mr-2 h-4 w-4" /> : <Monitor className="mr-2 h-4 w-4" />}
                    Theme
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => { logout(); setMobileOpen(false); }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            </div>
          )}

          <main className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
