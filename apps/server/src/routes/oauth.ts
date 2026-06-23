import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import jwt from "jsonwebtoken";
import { getPrisma } from "../db.js";
import { config } from "../config.js";
import type { AuthPayload } from "../middleware/auth.js";

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry } as jwt.SignOptions);
}

function callbackUrl(): string {
  return `${config.appUrl.replace(/\/$/, "")}/oauth/callback`;
}

function serverCallbackUrl(provider: string): string {
  const serverBase = `http://localhost:${config.port}`;
  return `${serverBase}/api/v1/auth/oauth/${provider}/callback`;
}

interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  extractUser: (profile: Record<string, unknown>) => { id: string; email: string; displayName: string };
}

function getProviderConfig(provider: string): OAuthProviderConfig | null {
  switch (provider) {
    case "github":
      return {
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userUrl: "https://api.github.com/user",
        scope: "read:user user:email",
        clientId: config.oauth.github.clientId,
        clientSecret: config.oauth.github.clientSecret,
        extractUser(profile) {
          return {
            id: String(profile.id),
            email: String(profile.email || ""),
            displayName: String(profile.name || profile.login || ""),
          };
        },
      };
    case "google":
      return {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
        scope: "openid email profile",
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        extractUser(profile) {
          return {
            id: String(profile.sub),
            email: String(profile.email || ""),
            displayName: String(profile.name || profile.email || ""),
          };
        },
      };
    default:
      return null;
  }
}

export async function registerOAuthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get<{ Params: { provider: string } }>(
    "/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      const providerCfg = getProviderConfig(provider);

      if (!providerCfg) {
        return reply.status(400).send({ error: `Unknown SSO provider: ${provider}` });
      }
      if (!providerCfg.clientId) {
        return reply.status(400).send({ error: `SSO provider '${provider}' is not configured` });
      }

      const params = new URLSearchParams({
        client_id: providerCfg.clientId,
        redirect_uri: serverCallbackUrl(provider),
        scope: providerCfg.scope,
        response_type: "code",
        state: provider,
      });

      return reply.redirect(`${providerCfg.authUrl}?${params.toString()}`);
    }
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; error?: string; state?: string } }>(
    "/:provider/callback",
    async (request, reply) => {
      const { provider } = request.params;
      const { code, error } = request.query;
      const frontendCallback = callbackUrl();

      if (error || !code) {
        return reply.redirect(`${frontendCallback}?error=${encodeURIComponent(error || "oauth_cancelled")}`);
      }

      const providerCfg = getProviderConfig(provider);
      if (!providerCfg) {
        return reply.redirect(`${frontendCallback}?error=unknown_provider`);
      }

      try {
        const tokenRes = await fetch(providerCfg.tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            client_id: providerCfg.clientId,
            client_secret: providerCfg.clientSecret,
            code,
            redirect_uri: serverCallbackUrl(provider),
            grant_type: "authorization_code",
          }).toString(),
        });

        if (!tokenRes.ok) {
          throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
        }

        const tokenData = await tokenRes.json() as Record<string, unknown>;
        const accessToken = String(tokenData.access_token || "");
        if (!accessToken) {
          throw new Error("No access_token in response");
        }

        let profile: Record<string, unknown>;

        if (provider === "github") {
          const emailsRes = await fetch("https://api.github.com/user/emails", {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
          });
          const userRes = await fetch(providerCfg.userUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
          });
          profile = await userRes.json() as Record<string, unknown>;
          if (emailsRes.ok) {
            const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
            const primary = emails.find((e) => e.primary && e.verified);
            if (primary) profile.email = primary.email;
          }
        } else {
          const userRes = await fetch(providerCfg.userUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          profile = await userRes.json() as Record<string, unknown>;
        }

        const { id: ssoId, email, displayName } = providerCfg.extractUser(profile);

        if (!email) {
          return reply.redirect(`${frontendCallback}?error=no_email`);
        }

        const workspace = await prisma.workspace.findFirst({ where: { setupComplete: true } });
        if (!workspace) {
          return reply.redirect(`${frontendCallback}?error=setup_required`);
        }

        const user = await prisma.user.upsert({
          where: { workspaceId_email: { workspaceId: workspace.id, email } },
          update: { ssoProvider: provider, ssoId, displayName: displayName || undefined },
          create: {
            workspaceId: workspace.id,
            email,
            displayName,
            ssoProvider: provider,
            ssoId,
            role: "member",
          },
        });

        const jwtToken = signToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          workspaceId: workspace.id,
        });

        return reply.redirect(`${frontendCallback}?token=${encodeURIComponent(jwtToken)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "oauth_error";
        app.log.error(`OAuth callback error: ${msg}`);
        return reply.redirect(`${frontendCallback}?error=${encodeURIComponent("oauth_error")}`);
      }
    }
  );
}
