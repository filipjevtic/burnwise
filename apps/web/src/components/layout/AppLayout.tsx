import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Gauge, Plug, Settings, Sun, Moon, Monitor, Menu, X, LogOut, Activity, TrendingUp, Layers, Inbox, ScrollText } from "lucide-react";
import { Button } from "../ui/button.js";
import { Select } from "../ui/select.js";
import { useTheme } from "../../hooks/use-theme.js";
import { useAuth } from "../../context/auth.js";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Layers },
  { to: "/sessions", label: "Sessions", icon: Activity },
  { to: "/unresolved", label: "Unresolved", icon: Inbox },
  { to: "/velocity", label: "Velocity", icon: TrendingUp },
  { to: "/forecast", label: "Forecast", icon: Gauge },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/audit", label: "Audit log", icon: ScrollText, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  location,
  onNavigate,
}: {
  location: ReturnType<typeof useLocation>;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <>
      {nav.filter((item) => !("adminOnly" in item && item.adminOnly) || isAdmin).map((item) => {
        const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={
              "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] " +
              (isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
            }
          >
            {/* Active indicator is an element, not a colored border-stripe. */}
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" aria-hidden />
            )}
            <item.icon className={"h-4 w-4 " + (isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {item.label}
          </NavLink>
        );
      })}
    </>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={"w-full justify-start text-muted-foreground hover:text-foreground " + (className ?? "")}
      onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
      Theme
    </Button>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo-icon.png" alt="Burnwise" className="h-7 w-7 rounded-md" />
      <span className="text-[0.95rem] font-semibold tracking-tight">Burnwise</span>
    </div>
  );
}

function ProjectPicker({
  id,
  projectId,
  projects,
  onChange,
}: {
  id: string;
  projectId: string;
  projects: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
        Project
      </label>
      <Select id={id} value={projectId} onChange={(e) => onChange(e.target.value)} className="h-8">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        {projects.length === 0 && <option value="">No projects</option>}
      </Select>
    </div>
  );
}

export function AppLayout({
  children,
  projectId,
  onProjectChange,
  projects = [],
}: {
  children: React.ReactNode;
  projectId: string;
  onProjectChange: (value: string) => void;
  projects?: Array<{ id: string; name: string }>;
  onProjectsChange?: (value: string) => void;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        {/* Desktop sidebar — a raised panel (one surface step above the app bg
            in dark mode) so it reads as distinct from the content area. */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex">
          <div className="flex h-14 items-center border-b border-border px-4">
            <Brand />
          </div>

          <div className="border-b border-border p-4">
            <ProjectPicker id="projectSelect" projectId={projectId} projects={projects} onChange={onProjectChange} />
          </div>

          <nav className="flex-1 space-y-0.5 p-3">
            <NavLinks location={location} />
          </nav>

          <div className="space-y-0.5 border-t border-border p-3">
            {user && (
              <div className="truncate px-3 py-2 text-xs text-muted-foreground">
                {user.displayName || user.email}
              </div>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex-1 lg:pl-64">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-[var(--z-header)] flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
              <Brand />
            </div>
            <ThemeToggle className="w-auto px-2" />
          </header>

          {mobileOpen && (
            <div className="fixed inset-0 z-[var(--z-overlay)] lg:hidden">
              <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
              <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-card shadow-lg">
                <div className="flex h-14 items-center justify-between border-b border-border px-4">
                  <Brand />
                  <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                <div className="border-b border-border p-4">
                  <ProjectPicker
                    id="projectSelectMobile"
                    projectId={projectId}
                    projects={projects}
                    onChange={(v) => { onProjectChange(v); setMobileOpen(false); }}
                  />
                </div>

                <nav className="flex-1 space-y-0.5 p-3">
                  <NavLinks location={location} onNavigate={() => setMobileOpen(false)} />
                </nav>

                <div className="space-y-0.5 border-t border-border p-3">
                  {user && (
                    <div className="truncate px-3 py-2 text-xs text-muted-foreground">
                      {user.displayName || user.email}
                    </div>
                  )}
                  <ThemeToggle />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                    onClick={() => { logout(); setMobileOpen(false); }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            </div>
          )}

          <main className="mx-auto max-w-7xl p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
