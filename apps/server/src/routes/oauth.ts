import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { randomBytes } from "node:crypto";
import cookie from "@fastify/cookie";
import jwt from "jsonwebtoken";
import { getPrisma } from "../db.js";
import { config } from "../config.js";
import type { AuthPayload } from "../middleware/auth.js";

const STATE_COOKIE = "bw_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 minutes

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry } as jwt.SignOptions);
}

function callbackUrl(): string {
  return `${config.appUrl.replace(/\/$/, "")}/oauth/callback`;
}

function serverCallbackUrl(provider: string): string {
  const serverBase = config.serverPublicUrl.replace(/\/$/, "");
  return `${serverBase}/api/v1/auth/oauth/${provider}/callback`;
}

interface ExtractedUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  extractUser: (profile: Record<string, unknown>) => ExtractedUser;
}

/** OIDC/OAuth providers assert email_verified in different shapes (bool or string). */
function claimIsTrue(value: unknown): boolean {
  return value === true || value === "true";
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
          // GitHub email verification is resolved from the /user/emails API
          // (primary + verified) in the callback, which sets __emailVerified.
          return {
            id: String(profile.id),
            email: String(profile.email || ""),
            displayName: String(profile.name || profile.login || ""),
            emailVerified: claimIsTrue(profile.__emailVerified),
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
            emailVerified: claimIsTrue(profile.email_verified),
          };
        },
      };
    case "gitlab": {
      const base = config.oauth.gitlab.baseUrl.replace(/\/$/, "");
      return {
        authUrl: `${base}/oauth/authorize`,
        tokenUrl: `${base}/oauth/token`,
        userUrl: `${base}/api/v4/user`,
        scope: "read_user",
        clientId: config.oauth.gitlab.clientId,
        clientSecret: config.oauth.gitlab.clientSecret,
        extractUser(profile) {
          // GitLab requires email confirmation before `confirmed_at` is set,
          // so a confirmed timestamp means the email is verified.
          return {
            id: String(profile.id),
            email: String(profile.email || ""),
            displayName: String(profile.name || profile.username || ""),
            emailVerified: Boolean(profile.confirmed_at),
          };
        },
      };
    }
    case "oidc": {
      if (!oidcEndpoints) return null;
      return {
        authUrl: oidcEndpoints.authorization_endpoint,
        tokenUrl: oidcEndpoints.token_endpoint,
        userUrl: oidcEndpoints.userinfo_endpoint,
        scope: config.oidc.scope,
        clientId: config.oidc.clientId,
        clientSecret: config.oidc.clientSecret,
        extractUser(profile) {
          return {
            id: String(profile.sub || profile.id || ""),
            email: String(profile.email || ""),
            displayName: String(profile.name || profile.preferred_username || profile.email || ""),
            emailVerified: claimIsTrue(profile.email_verified),
          };
        },
      };
    }
    default:
      return null;
  }
}

/** True when the email's domain is allowed to sign in (empty allowlist = all). */
function emailDomainAllowed(email: string): boolean {
  if (config.ssoAllowedDomains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && config.ssoAllowedDomains.includes(domain);
}

interface OIDCDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let oidcEndpoints: OIDCDiscovery | null = null;

async function loadOIDCDiscovery(): Promise<void> {
  if (oidcEndpoints) return;
  if (!config.oidc.issuerUrl || !config.oidc.clientId) return;
  const issuer = config.oidc.issuerUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json() as Record<string, unknown>;
    oidcEndpoints = {
      authorization_endpoint: String(doc.authorization_endpoint),
      token_endpoint: String(doc.token_endpoint),
      userinfo_endpoint: String(doc.userinfo_endpoint),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to fetch OIDC discovery from ${issuer}: ${msg}`);
  }
}

export async function registerOAuthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();
  await loadOIDCDiscovery();

  // Signed cookies carry the CSRF state nonce between the init redirect and the
  // callback, binding the flow to the user's browser.
  await app.register(cookie, { secret: config.jwtSecret });

  app.get<{ Params: { provider: string } }>(
    "/:provider",
    async (request, reply) => {
      // Local-only mode (#23): SSO is disabled — no identity leaves the machine.
      if (config.localOnly) return reply.status(404).send({ error: "SSO is disabled in local-only mode" });
      const { provider } = request.params;
      // OIDC discovery may have failed at boot (IdP down); retry lazily.
      if (provider === "oidc") await loadOIDCDiscovery();
      const providerCfg = getProviderConfig(provider);

      if (!providerCfg) {
        return reply.status(400).send({ error: `Unknown SSO provider: ${provider}` });
      }
      if (!providerCfg.clientId) {
        return reply.status(400).send({ error: `SSO provider '${provider}' is not configured` });
      }

      // CSRF: random nonce sent to the IdP as `state` and stored in a signed,
      // http-only cookie. On callback the two must match.
      const stateNonce = randomBytes(32).toString("hex");
      reply.setCookie(STATE_COOKIE, stateNonce, {
        path: "/api/v1/auth/oauth",
        httpOnly: true,
        sameSite: "lax",
        secure: config.serverPublicUrl.startsWith("https://"),
        signed: true,
        maxAge: STATE_TTL_SECONDS,
      });

      const params = new URLSearchParams({
        client_id: providerCfg.clientId,
        redirect_uri: serverCallbackUrl(provider),
        scope: providerCfg.scope,
        response_type: "code",
        state: stateNonce,
      });

      return reply.redirect(`${providerCfg.authUrl}?${params.toString()}`);
    }
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; error?: string; state?: string } }>(
    "/:provider/callback",
    async (request, reply) => {
      // Local-only mode (#23): SSO is disabled — never run token exchange.
      if (config.localOnly) return reply.status(404).send({ error: "SSO is disabled in local-only mode" });
      const { provider } = request.params;
      const { code, error, state } = request.query;
      const frontendCallback = callbackUrl();

      if (error || !code) {
        return reply.redirect(`${frontendCallback}?error=${encodeURIComponent(error || "oauth_cancelled")}`);
      }

      // CSRF: the state returned by the IdP must match the nonce in our signed
      // cookie. Missing/mismatched state means the flow wasn't started here.
      const cookieRaw = request.cookies[STATE_COOKIE];
      const unsigned = cookieRaw ? reply.unsignCookie(cookieRaw) : null;
      reply.clearCookie(STATE_COOKIE, { path: "/api/v1/auth/oauth" });
      if (!state || !unsigned?.valid || unsigned.value !== state) {
        return reply.redirect(`${frontendCallback}?error=invalid_state`);
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
            if (primary) {
              profile.email = primary.email;
              profile.__emailVerified = true;
            }
          }
        } else {
          const userRes = await fetch(providerCfg.userUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          profile = await userRes.json() as Record<string, unknown>;
        }

        const { id: ssoId, email, displayName, emailVerified } = providerCfg.extractUser(profile);

        if (!email) {
          return reply.redirect(`${frontendCallback}?error=no_email`);
        }

        // Account-linking safety: only link/create by an email the IdP has
        // verified, otherwise an attacker asserting someone else's address could
        // hijack an existing account.
        if (!emailVerified) {
          return reply.redirect(`${frontendCallback}?error=email_unverified`);
        }

        if (!emailDomainAllowed(email)) {
          return reply.redirect(`${frontendCallback}?error=domain_not_allowed`);
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
