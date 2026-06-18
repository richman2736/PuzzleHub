import { describe, expect, it } from "vitest";
import {
  createTranslator,
  getLocaleTextDirection,
  localeMetadata,
  normalizeLocale,
  supportedLocales,
  translate,
  type SupportedLocale,
} from "../index";

describe("i18n", () => {
  it("normalizes device locale tags into supported app locales", () => {
    expect(normalizeLocale("nb-NO")).toBe("nb");
    expect(normalizeLocale("nn-NO")).toBe("nb");
    expect(normalizeLocale("es-MX")).toBe("es-419");
    expect(normalizeLocale("es-ES")).toBe("es-ES");
    expect(normalizeLocale("pt_BR")).toBe("pt-BR");
    expect(normalizeLocale("zh-CN")).toBe("zh-Hans");
    expect(normalizeLocale("zh-TW")).toBe("zh-Hant");
    expect(normalizeLocale("ar-EG")).toBe("ar");
    expect(normalizeLocale("unknown")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
  });

  it("translates complete locales and falls back to English for incomplete locales", () => {
    expect(translate("nb-NO", "screen.dailySudoku")).toBe("Dagens sudoku");
    expect(translate("de-DE", "screen.dailySudoku")).toBe("Daily Sudoku");
  });

  it("interpolates values in translated strings", () => {
    expect(translate("en-US", "status.pending", { count: 3 })).toBe("3 pending");
    expect(translate("nb-NO", "status.waiting", { count: 4 })).toBe("4 venter");
  });

  it("creates a stable translator for a normalized locale", () => {
    const t = createTranslator("no-NO");

    expect(t.locale).toBe("nb");
    expect(t("mode.notes")).toBe("Kandidater");
  });

  it("declares metadata for every supported locale", () => {
    for (const locale of supportedLocales) {
      expect(localeMetadata[locale]).toBeDefined();
    }

    const metadataLocales = Object.keys(localeMetadata).sort() as SupportedLocale[];

    expect(metadataLocales).toEqual([...supportedLocales].sort());
    expect(localeMetadata.en.status).toBe("complete");
    expect(localeMetadata.nb.status).toBe("complete");
    expect(getLocaleTextDirection("ar-SA")).toBe("rtl");
  });
});
