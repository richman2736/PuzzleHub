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
