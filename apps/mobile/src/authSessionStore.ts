import * as SecureStore from "expo-secure-store";

const refreshTokenKey = "puzzlehub.auth.refreshToken";
const sessionTokenKey = "puzzlehub.auth.sessionToken";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
  keychainService: "puzzlehub.auth",
};

let accessTokenInMemory: string | null = null;

export interface PersistedAuthTokens {
  refreshToken: string | null;
  sessionToken: string | null;
}

export interface AuthTokenUpdate {
  refreshToken?: string | null;
  sessionToken?: string | null;
  accessToken?: string | null;
}

export async function loadPersistedAuthTokens(): Promise<PersistedAuthTokens> {
  await assertSecureStoreAvailable();

  const [refreshToken, sessionToken] = await Promise.all([
    SecureStore.getItemAsync(refreshTokenKey, secureStoreOptions),
    SecureStore.getItemAsync(sessionTokenKey, secureStoreOptions),
  ]);

  return {
    refreshToken,
    sessionToken,
  };
}

export async function saveAuthTokens(input: AuthTokenUpdate): Promise<void> {
  await assertSecureStoreAvailable();

  await Promise.all([
    writeOptionalSecureValue(refreshTokenKey, input.refreshToken),
    writeOptionalSecureValue(sessionTokenKey, input.sessionToken),
  ]);

  if (input.accessToken !== undefined) {
    setAccessTokenInMemory(input.accessToken);
  }
}

export async function clearAuthTokens(): Promise<void> {
  await assertSecureStoreAvailable();

  await Promise.all([
    SecureStore.deleteItemAsync(refreshTokenKey, secureStoreOptions),
    SecureStore.deleteItemAsync(sessionTokenKey, secureStoreOptions),
  ]);
  setAccessTokenInMemory(null);
}

export function setAccessTokenInMemory(accessToken: string | null): void {
  accessTokenInMemory = accessToken;
}

export function getAccessTokenInMemory(): string | null {
  return accessTokenInMemory;
}

async function writeOptionalSecureValue(
  key: string,
  value: string | null | undefined,
): Promise<void> {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    await SecureStore.deleteItemAsync(key, secureStoreOptions);
    return;
  }

  await SecureStore.setItemAsync(key, value, secureStoreOptions);
}

async function assertSecureStoreAvailable(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error("Secure token storage is not available on this device.");
  }
}
