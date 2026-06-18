import { isSupportedLocale, type SupportedLocale } from "@puzzlehub/i18n";
import * as SQLite from "expo-sqlite";
import { runExclusiveWrite } from "./sqliteWriteQueue";

const databaseName = "puzzlehub-mobile.db";

export type AppLanguagePreference = "system" | SupportedLocale;
export type AppThemePreference = "system" | "light" | "dark";

export interface AppPreferences {
  language: AppLanguagePreference;
  theme: AppThemePreference;
}

export const defaultAppPreferences: AppPreferences = {
  language: "system",
  theme: "system",
};

interface PreferenceRow {
  key: string;
  value: string;
}

interface RawAppPreferences {
  language: string | undefined;
  theme: string | undefined;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase();

  return databasePromise;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(databaseName);

  await db.execAsync("PRAGMA journal_mode = WAL;");
  await ensurePreferencesTable(db);

  return db;
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PreferenceRow>(
    `SELECT key, value
     FROM app_preferences
     WHERE key IN ('language', 'theme')`,
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));

  return normalizeAppPreferences({
    language: values.get("language"),
    theme: values.get("theme"),
  });
}

export async function saveAppPreferences(preferences: AppPreferences): Promise<void> {
  const db = await getDatabase();
  const normalized = normalizeAppPreferences(preferences);
  const now = new Date().toISOString();

  await runExclusiveWrite(db, async (tx) => {
    await savePreferenceValue(tx, "language", normalized.language, now);
    await savePreferenceValue(tx, "theme", normalized.theme, now);
  });
}

async function ensurePreferencesTable(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

async function savePreferenceValue(
  db: SQLite.SQLiteDatabase,
  key: keyof AppPreferences,
  value: string,
  updatedAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_preferences (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    key,
    value,
    updatedAt,
  );
}

function normalizeAppPreferences(input: RawAppPreferences): AppPreferences {
  return {
    language: normalizeLanguagePreference(input.language),
    theme: normalizeThemePreference(input.theme),
  };
}

function normalizeLanguagePreference(
  value: AppLanguagePreference | string | undefined,
): AppLanguagePreference {
  if (value === "system" || (typeof value === "string" && isSupportedLocale(value))) {
    return value;
  }

  return defaultAppPreferences.language;
}

function normalizeThemePreference(
  value: AppThemePreference | string | undefined,
): AppThemePreference {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }

  return defaultAppPreferences.theme;
}
