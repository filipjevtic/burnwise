import { useState } from "react";
import { useAuth } from "../context/auth.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Button } from "../components/ui/button.js";
import { Alert, AlertDescription } from "../components/ui/alert.js";
import { AlertCircle } from "lucide-react";
import { SSOButtons } from "../components/auth/SSOButtons.js";

export function SetupPage() {
  const { setup } = useAuth();
  const [workspaceName, setWorkspaceName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await setup({ email, password, displayName, workspaceName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src="/logo-icon.png" alt="Burnwise" className="h-10 w-10" />
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Burnwise</h1>
          <p className="text-sm text-muted-foreground">Set up your workspace and admin account</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">First-time setup</CardTitle>
            <CardDescription>This runs once. You can invite team members after setup.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="workspaceName">Workspace name</Label>
                <Input
                  id="workspaceName"
                  placeholder="Acme Corp"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>

              <div className="border-t pt-4 space-y-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Admin account</p>
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
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                {loading ? "Setting up..." : "Create workspace"}
              </Button>
            </form>
            <div className="mt-4">
              <SSOButtons label="Or sign in with an existing account" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
