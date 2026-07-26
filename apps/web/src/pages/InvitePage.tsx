import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Button } from "../components/ui/button.js";
import { Alert, AlertDescription } from "../components/ui/alert.js";
import { AlertCircle } from "lucide-react";
import { SSOButtons } from "../components/auth/SSOButtons.js";
import { useAuthProviders } from "../hooks/use-auth-providers.js";

import { API_URL } from "../lib/api-url.js";

interface InviteInfo {
  token: string;
  projectName: string;
  workspaceName: string;
  role: string;
  email: string | null;
  expiresAt: string;
}

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const providers = useAuthProviders();

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/v1/invites/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Invalid invite");
        }
        return res.json();
      })
      .then((data) => {
        setInvite(data.invite);
        if (data.invite.email) setEmail(data.invite.email);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, password: password || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to accept invite");
      }
      const data = await res.json();
      loginWithToken(data.token);
      navigate("/", { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading invite…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <a href="/login" className="text-sm underline text-muted-foreground">Back to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src="/logo-icon.png" alt="Burnwise" className="h-10 w-10" />
          <h1 className="text-2xl font-semibold tracking-tight">You're invited</h1>
          <p className="text-sm text-muted-foreground text-center">
            Join <strong>{invite?.projectName}</strong> on{" "}
            <strong>{invite?.workspaceName}</strong> as <strong>{invite?.role}</strong>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>Enter your details to accept the invite</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAccept} className="space-y-4">
              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!invite?.email}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="displayName">Your name</Label>
                <Input
                  id="displayName"
                  placeholder="Jane Smith"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">
                  Password <span className="text-muted-foreground">(optional if using SSO)</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !email}>
                {submitting ? "Joining…" : "Accept invite"}
              </Button>
            </form>
            <div className="mt-4">
              <SSOButtons label="Or join with" providers={providers} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
