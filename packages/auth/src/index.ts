import { authSchema, type AuthDb } from "@puzzlehub/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { magicLink } from "better-auth/plugins/magic-link";

export interface AuthRuntimeConfig {
  appName: string;
  baseUrl: string;
  trustedOrigins: string[];
  emailAndPasswordEnabled: boolean;
  magicLinkEnabled: boolean;
}

export const defaultAuthConfig: AuthRuntimeConfig = {
  appName: "PuzzleHub",
  baseUrl: "http://localhost:8787",
  trustedOrigins: ["http://localhost:8081", "http://localhost:5173"],
  emailAndPasswordEnabled: false,
  magicLinkEnabled: true,
};

export function createAuthConfig(overrides: Partial<AuthRuntimeConfig> = {}): AuthRuntimeConfig {
  return {
    ...defaultAuthConfig,
    ...overrides,
    trustedOrigins: overrides.trustedOrigins ?? defaultAuthConfig.trustedOrigins,
  };
}

// Where Better Auth mounts its routes; the worker mounts the handler at the same
// prefix so baseURL + basePath routing lines up.
export const authBasePath = "/v1/auth";

export interface SendMagicLinkParams {
  email: string;
  url: string;
  token: string;
}

export interface CreateAuthOptions {
  // Drizzle client over the D1 binding, built with @puzzlehub/db's createAuthDb.
  db: AuthDb;
  // Server secret (BETTER_AUTH_SECRET); signs sessions/tokens.
  secret: string;
  // Full origin of the API (e.g. https://api.puzzlehub.app).
  baseUrl: string;
  trustedOrigins: string[];
  // Delivery transport for magic links; injected so the package stays transport-agnostic.
  sendMagicLink: (params: SendMagicLinkParams) => Promise<void>;
  emailAndPasswordEnabled?: boolean;
}

// Build the Better Auth instance backed by the existing Drizzle/D1 auth tables.
// Magic link is the primary method; the bearer plugin lets the mobile client carry
// the session as an Authorization header instead of a cookie.
export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    basePath: authBasePath,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema: authSchema,
      usePlural: true,
    }),
    emailAndPassword: { enabled: options.emailAndPasswordEnabled ?? false },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, token, url }) => {
          await options.sendMagicLink({ email, token, url });
        },
      }),
      bearer(),
    ],
  });
}

export type PuzzleHubAuth = ReturnType<typeof createAuth>;
