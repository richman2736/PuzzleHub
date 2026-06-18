import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { createSqliteOutboxStore } from "./sudokuRepository";
import {
  createFetchSyncTransport,
  createSyncScheduler,
  flushSyncOutbox,
  type SyncScheduler,
} from "./syncClient";

// Native trigger source for the sync scheduler: flush when the app returns to
// the foreground and when connectivity is restored (a down -> up transition).
export function createNativeSyncTriggers(): (callback: () => void) => () => void {
  return (callback) => {
    const appStateSubscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        callback();
      }
    });

    let wasConnected = true;
    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;

      if (connected && !wasConnected) {
        callback();
      }

      wasConnected = connected;
    });

    return () => {
      appStateSubscription.remove();
      netInfoUnsubscribe();
    };
  };
}

// The API base URL is supplied via an Expo public env var. Empty (the default)
// leaves sync inert: the outbox keeps accumulating locally and is flushed once a
// URL is configured and the app is rebuilt.
export function getSyncApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
}

// Build and start the outbox sync scheduler against the live worker. Performs an
// immediate flush attempt, then flushes on foreground/reconnect with backoff.
export async function startSudokuSync(options: {
  deviceId: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<SyncScheduler> {
  const store = await createSqliteOutboxStore();
  const transport = createFetchSyncTransport(options.apiBaseUrl, options.fetchImpl);

  const scheduler = createSyncScheduler({
    flush: () => flushSyncOutbox(store, transport, { deviceId: options.deviceId }),
    onTrigger: createNativeSyncTriggers(),
    schedule: (callback, delayMs) => {
      const handle = setTimeout(callback, delayMs);
      return () => {
        clearTimeout(handle);
      };
    },
  });

  void scheduler.flushNow();

  return scheduler;
}
