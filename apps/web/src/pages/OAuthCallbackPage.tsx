import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

export function OAuthCallbackPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      const messages: Record<string, string> = {
        oauth_cancelled: "Sign-in was cancelled.",
        no_email: "Your provider account has no verified email address.",
        email_unverified: "Your provider has not verified this email address.",
        domain_not_allowed: "Your email domain is not allowed to sign in to this workspace.",
        invalid_state: "Sign-in session expired or was invalid. Please try again.",
        setup_required: "Workspace setup is not complete.",
        oauth_error: "An error occurred during sign-in.",
        unknown_provider: "Unknown SSO provider.",
      };
      setError(messages[err] ?? "SSO sign-in failed.");
      return;
    }

    if (token) {
      loginWithToken(token);
      navigate("/", { replace: true });
    } else {
      setError("No token received from provider.");
    }
  }, [loginWithToken, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <a href="/login" className="text-sm underline text-muted-foreground">
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
