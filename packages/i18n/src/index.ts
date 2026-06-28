export const defaultLocale = "en" as const;

export const supportedLocales = [
  "en",
  "nb",
  "es-419",
  "es-ES",
  "pt-BR",
  "de",
  "fr",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "it",
  "nl",
  "pl",
  "tr",
  "id",
  "hi",
  "ar",
  "ru",
] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type TextDirection = "ltr" | "rtl";
export type TranslationStatus = "complete" | "fallback";

export interface LocaleMetadata {
  direction: TextDirection;
  englishName: string;
  nativeName: string;
  status: TranslationStatus;
}

export type TranslationParams = Record<string, number | string>;

const en = {
  "action.close": "Close",
  "action.erase": "Erase",
  "action.hint": "Hint",
  "action.restart": "Restart",
  "action.undo": "Undo",
  "app.brand": "PuzzleHub",
  "conflict.banner": "Sync conflict — this puzzle changed on another device.",
  "conflict.dismiss": "Dismiss",
  "error.loadSavedGame": "Could not load saved game.",
  "error.loadProgress": "Could not load progress.",
  "error.loadSyncStatus": "Could not load sync status.",
  "error.resetGame": "Could not reset game.",
  "error.loadPreferences": "Could not load preferences.",
  "error.savePreferences": "Could not save preferences.",
  "error.saveMove": "Could not save move.",
  "error.saveCompletion": "Could not save completion.",
  "error.savePauseState": "Could not save pause state.",
  "error.saveTimer": "Could not save timer.",
  "error.undoMove": "Could not undo move.",
  "achievement.first_daily": "Daily Debut",
  "achievement.first_solve": "First Solve",
  "achievement.hard_completed": "Hard Mode",
  "achievement.no_mistake_solve": "Flawless",
  "achievement.streak_3": "On a Roll",
  "achievement.streak_7": "Unstoppable",
  "game.block": "Block Puzzle",
  "game.nonogram": "Nonogram",
  "game.sort": "Sort Puzzle",
  "game.sudoku": "Classic Sudoku",
  "game.word": "Word Search",
  "games.title": "Games",
  "metric.hints": "Hints",
  "metric.bestScore": "Best score",
  "metric.bestTime": "Best time",
  "metric.games": "Games",
  "metric.medal": "Medal",
  "metric.mistakes": "Mistakes",
  "metric.score": "Score",
  "metric.streak": "Streak",
  "metric.time": "Time",
  "metric.totalXp": "Total XP",
  "metric.longestStreak": "Longest streak",
  "metric.xp": "XP",
  "mode.answer": "Answer",
  "mode.notes": "Notes",
  "modal.completed": "Completed",
  "reward.achievements": "Achievements",
  "reward.bronze": "Bronze",
  "reward.firstCompletion": "First solve",
  "reward.flawless": "Flawless",
  "reward.gold": "Gold",
  "reward.newBestScore": "New best score",
  "reward.newBestTime": "New best time",
  "reward.newLongestStreak": "New longest streak",
  "reward.personalRecords": "Personal records",
  "reward.silver": "Silver",
  "screen.dailySudoku": "Daily Sudoku",
  "screen.paused": "Paused",
  "screen.progress": "Progress",
  "settings.appearance": "Appearance",
  "settings.dark": "Dark",
  "settings.english": "English",
  "settings.language": "Language",
  "settings.light": "Light",
  "settings.norwegian": "Norwegian",
  "settings.restartPuzzle": "Restart puzzle",
  "settings.systemDefault": "System",
  "settings.title": "Settings",
  "status.conflict": "{count} conflict",
  "status.loading": "Loading",
  "status.local": "Local",
  "status.offline": "Offline",
  "status.pending": "{count} pending",
  "status.synced": "Synced",
  "status.waiting": "{count} waiting",
} as const;

export type TranslationKey = keyof typeof en;
type TranslationCatalog = Record<TranslationKey, string>;
type PartialTranslationCatalog = Partial<TranslationCatalog>;

const nb: TranslationCatalog = {
  "action.close": "Lukk",
  "action.erase": "Slett",
  "action.hint": "Hint",
  "action.restart": "Start på nytt",
  "action.undo": "Angre",
  "app.brand": "PuzzleHub",
  "conflict.banner": "Synkroniseringskonflikt – dette spillet ble endret på en annen enhet.",
  "conflict.dismiss": "Lukk",
  "error.loadSavedGame": "Kunne ikke laste lagret spill.",
  "error.loadProgress": "Kunne ikke laste progresjon.",
  "error.loadSyncStatus": "Kunne ikke laste synkstatus.",
  "error.resetGame": "Kunne ikke starte spillet på nytt.",
  "error.loadPreferences": "Kunne ikke laste innstillinger.",
  "error.savePreferences": "Kunne ikke lagre innstillinger.",
  "error.saveMove": "Kunne ikke lagre trekk.",
  "error.saveCompletion": "Kunne ikke lagre fullføring.",
  "error.savePauseState": "Kunne ikke lagre pause.",
  "error.saveTimer": "Kunne ikke lagre tid.",
  "error.undoMove": "Kunne ikke angre trekk.",
  "achievement.first_daily": "Daglig debut",
  "achievement.first_solve": "Første løsning",
  "achievement.hard_completed": "Hard modus",
  "achievement.no_mistake_solve": "Feilfri",
  "achievement.streak_3": "I flyt",
  "achievement.streak_7": "Ustoppelig",
  "game.block": "Blokkpuslespill",
  "game.nonogram": "Nonogram",
  "game.sort": "Sorteringsspill",
  "game.sudoku": "Klassisk sudoku",
  "game.word": "Ordsøk",
  "games.title": "Spill",
  "metric.hints": "Hint",
  "metric.bestScore": "Beste poeng",
  "metric.bestTime": "Beste tid",
  "metric.games": "Spill",
  "metric.medal": "Medalje",
  "metric.mistakes": "Feil",
  "metric.score": "Poeng",
  "metric.streak": "Streak",
  "metric.time": "Tid",
  "metric.totalXp": "Total XP",
  "metric.longestStreak": "Lengste streak",
  "metric.xp": "XP",
  "mode.answer": "Svar",
  "mode.notes": "Kandidater",
  "modal.completed": "Fullført",
  "reward.achievements": "Prestasjoner",
  "reward.bronze": "Bronse",
  "reward.firstCompletion": "Første løsning",
  "reward.flawless": "Feilfri",
  "reward.gold": "Gull",
  "reward.newBestScore": "Ny beste poengsum",
  "reward.newBestTime": "Ny beste tid",
  "reward.newLongestStreak": "Ny lengste streak",
  "reward.personalRecords": "Personlige rekorder",
  "reward.silver": "Sølv",
  "screen.dailySudoku": "Dagens sudoku",
  "screen.paused": "Pause",
  "screen.progress": "Progresjon",
  "settings.appearance": "Utseende",
  "settings.dark": "Mørkt",
  "settings.english": "Engelsk",
  "settings.language": "Språk",
  "settings.light": "Lyst",
  "settings.norwegian": "Norsk",
  "settings.restartPuzzle": "Start brettet på nytt",
  "settings.systemDefault": "System",
  "settings.title": "Innstillinger",
  "status.conflict": "{count} konflikt",
  "status.loading": "Laster",
  "status.local": "Lokalt",
  "status.offline": "Frakoblet",
  "status.pending": "{count} venter",
  "status.synced": "Synket",
  "status.waiting": "{count} venter",
};

export const localeMetadata: Record<SupportedLocale, LocaleMetadata> = {
  ar: {
    direction: "rtl",
    englishName: "Arabic",
    nativeName: "العربية",
    status: "fallback",
  },
  de: {
    direction: "ltr",
    englishName: "German",
    nativeName: "Deutsch",
    status: "fallback",
  },
  en: {
    direction: "ltr",
    englishName: "English",
    nativeName: "English",
    status: "complete",
  },
  "es-419": {
    direction: "ltr",
    englishName: "Spanish (Latin America)",
    nativeName: "español latinoamericano",
    status: "fallback",
  },
  "es-ES": {
    direction: "ltr",
    englishName: "Spanish (Spain)",
    nativeName: "español",
    status: "fallback",
  },
  fr: {
    direction: "ltr",
    englishName: "French",
    nativeName: "français",
    status: "fallback",
  },
  hi: {
    direction: "ltr",
    englishName: "Hindi",
    nativeName: "हिन्दी",
    status: "fallback",
  },
  id: {
    direction: "ltr",
    englishName: "Indonesian",
    nativeName: "Bahasa Indonesia",
    status: "fallback",
  },
  it: {
    direction: "ltr",
    englishName: "Italian",
    nativeName: "italiano",
    status: "fallback",
  },
  ja: {
    direction: "ltr",
    englishName: "Japanese",
    nativeName: "日本語",
    status: "fallback",
  },
  ko: {
    direction: "ltr",
    englishName: "Korean",
    nativeName: "한국어",
    status: "fallback",
  },
  nb: {
    direction: "ltr",
    englishName: "Norwegian Bokmål",
    nativeName: "norsk bokmål",
    status: "complete",
  },
  nl: {
    direction: "ltr",
    englishName: "Dutch",
    nativeName: "Nederlands",
    status: "fallback",
  },
  pl: {
    direction: "ltr",
    englishName: "Polish",
    nativeName: "polski",
    status: "fallback",
  },
  "pt-BR": {
    direction: "ltr",
    englishName: "Portuguese (Brazil)",
    nativeName: "português do Brasil",
    status: "fallback",
  },
  ru: {
    direction: "ltr",
    englishName: "Russian",
    nativeName: "русский",
    status: "fallback",
  },
  tr: {
    direction: "ltr",
    englishName: "Turkish",
    nativeName: "Türkçe",
    status: "fallback",
  },
  "zh-Hans": {
    direction: "ltr",
    englishName: "Chinese (Simplified)",
    nativeName: "简体中文",
    status: "fallback",
  },
  "zh-Hant": {
    direction: "ltr",
    englishName: "Chinese (Traditional)",
    nativeName: "繁體中文",
    status: "fallback",
  },
};

const catalogs: Record<SupportedLocale, PartialTranslationCatalog> = {
  ar: {},
  de: {},
  en,
  "es-419": {},
  "es-ES": {},
  fr: {},
  hi: {},
  id: {},
  it: {},
  ja: {},
  ko: {},
  nb,
  nl: {},
  pl: {},
  "pt-BR": {},
  ru: {},
  tr: {},
  "zh-Hans": {},
  "zh-Hant": {},
};

const supportedLocaleSet = new Set<string>(supportedLocales);

export interface Translator {
  (key: TranslationKey, params?: TranslationParams): string;
  locale: SupportedLocale;
}

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocaleSet.has(locale);
}

export function normalizeLocale(locale: null | string | undefined): SupportedLocale {
  if (locale === null || locale === undefined) {
    return defaultLocale;
  }

  const normalized = locale.trim().replace(/_/g, "-");

  if (normalized.length === 0) {
    return defaultLocale;
  }

  const exactMatch = supportedLocales.find(
    (supportedLocale) => supportedLocale.toLowerCase() === normalized.toLowerCase(),
  );

  if (exactMatch !== undefined) {
    return exactMatch;
  }

  const parts = normalized.toLowerCase().split("-");
  const language = parts[0];
  const regionOrScript = parts.slice(1);

  switch (language) {
    case "ar":
      return "ar";
    case "de":
      return "de";
    case "en":
      return "en";
    case "es":
      return regionOrScript.includes("es") ? "es-ES" : "es-419";
    case "fr":
      return "fr";
    case "hi":
      return "hi";
    case "id":
    case "in":
      return "id";
    case "it":
      return "it";
    case "ja":
      return "ja";
    case "ko":
      return "ko";
    case "nb":
    case "nn":
    case "no":
      return "nb";
    case "nl":
      return "nl";
    case "pl":
      return "pl";
    case "pt":
      return "pt-BR";
    case "ru":
      return "ru";
    case "tr":
      return "tr";
    case "zh":
      return isTraditionalChineseLocale(regionOrScript) ? "zh-Hant" : "zh-Hans";
    default:
      return defaultLocale;
  }
}

export function getLocaleTextDirection(locale: null | string | undefined): TextDirection {
  return localeMetadata[normalizeLocale(locale)].direction;
}

export function translate(
  locale: null | string | undefined,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const normalizedLocale = normalizeLocale(locale);
  const template = catalogs[normalizedLocale][key] ?? en[key];

  return interpolate(template, params);
}

export function createTranslator(locale: null | string | undefined): Translator {
  const normalizedLocale = normalizeLocale(locale);
  const translator = (key: TranslationKey, params?: TranslationParams) =>
    translate(normalizedLocale, key, params);

  translator.locale = normalizedLocale;

  return translator;
}

function isTraditionalChineseLocale(parts: string[]): boolean {
  return parts.some((part) => ["hant", "hk", "mo", "tw"].includes(part));
}

function interpolate(template: string, params?: TranslationParams): string {
  if (params === undefined) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];

    return value === undefined ? match : String(value);
  });
}
