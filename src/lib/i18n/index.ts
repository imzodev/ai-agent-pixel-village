// i18n resolver. Returns the right catalog for a given locale, with
// English as fallback for any missing key.

import type { Locale, MessageCatalog, MessageKey } from "@/types/i18n";
import { EN } from "./en";
import { ES } from "./es";

const CATALOGS: Record<Locale, MessageCatalog> = { en: EN, es: ES };

export function getCatalog(locale: Locale): MessageCatalog {
  return CATALOGS[locale] ?? EN;
}

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const cat = getCatalog(locale);
  let str = cat[key] ?? EN[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return "en";
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : "en";
}
