import {
  createTranslator,
  getLocaleTextDirection,
  localeMetadata,
  normalizeLocale,
  type SupportedLocale,
} from "@puzzlehub/i18n";
import { useLocales } from "expo-localization";
import { useMemo } from "react";

export type LocalePreference = "system" | SupportedLocale;

export function usePuzzleHubI18n(localePreference: LocalePreference = "system") {
  const locales = useLocales();
  const deviceLocale = locales[0]?.languageTag;

  return useMemo(() => {
    const systemLocale = normalizeLocale(deviceLocale);
    const locale = localePreference === "system" ? systemLocale : localePreference;
    const t = createTranslator(locale);

    return {
      direction: getLocaleTextDirection(locale),
      formatNumber: (value: number) => new Intl.NumberFormat(locale).format(value),
      locale,
      metadata: localeMetadata[locale],
      systemLocale,
      t,
    };
  }, [deviceLocale, localePreference]);
}
