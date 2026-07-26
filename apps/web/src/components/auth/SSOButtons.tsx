import { Button } from "../ui/button.js";

import { API_URL } from "../../lib/api-url.js";

export interface AuthProviders {
  github: boolean;
  google: boolean;
  gitlab: boolean;
  oidc: { enabled: boolean; name: string };
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#E24329" d="m12 22.17 4.03-12.4H7.97z" />
      <path fill="#FC6D26" d="m12 22.17-4.03-12.4H1.52z" />
      <path fill="#FCA326" d="M1.52 9.77.09 14.18a.97.97 0 0 0 .35 1.09L12 22.17z" />
      <path fill="#E24329" d="M1.52 9.77h6.45L5.56 1.71a.49.49 0 0 0-.93 0z" />
      <path fill="#FC6D26" d="m12 22.17 4.03-12.4h6.45z" />
      <path fill="#FCA326" d="m22.48 9.77 1.43 4.41a.97.97 0 0 1-.35 1.09L12 22.17z" />
      <path fill="#E24329" d="M22.48 9.77h-6.45l2.41-8.06a.49.49 0 0 1 .93 0z" />
    </svg>
  );
}

function SSOIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

interface SSOButtonsProps {
  label?: string;
  providers?: AuthProviders | null;
}

export function SSOButtons({ label = "Or continue with", providers }: SSOButtonsProps) {
  if (!providers) return null;

  const buttons: { key: string; label: string; icon: React.ReactNode }[] = [];
  if (providers.github) buttons.push({ key: "github", label: "GitHub", icon: <GitHubIcon /> });
  if (providers.google) buttons.push({ key: "google", label: "Google", icon: <GoogleIcon /> });
  if (providers.gitlab) buttons.push({ key: "gitlab", label: "GitLab", icon: <GitLabIcon /> });
  if (providers.oidc.enabled) buttons.push({ key: "oidc", label: providers.oidc.name, icon: <SSOIcon /> });

  if (buttons.length === 0) return null;

  const handleSSO = (provider: string) => {
    window.location.href = `${API_URL}/api/v1/auth/oauth/${provider}`;
  };

  const cols = buttons.length === 1 ? "grid-cols-1" : buttons.length === 3 ? "grid-cols-3" : buttons.length >= 4 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{label}</span>
        </div>
      </div>

      <div className={`grid ${cols} gap-2`}>
        {buttons.map((b) => (
          <Button
            key={b.key}
            type="button"
            variant="outline"
            onClick={() => handleSSO(b.key)}
            className="w-full gap-2"
          >
            {b.icon}
            {b.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
