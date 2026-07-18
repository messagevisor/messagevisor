import type { Locale } from "@messagevisor/types";

export type LocaleInheritanceField = "inheritFormatsFrom" | "inheritTranslationsFrom";

export interface ResolvedLocaleValue<T> {
  value: T;
  sourceLocale: string;
  direct: boolean;
}

/** Returns the inheritance chain in merge order: oldest ancestor first. */
export function resolveLocaleChain(
  localeKey: string,
  locales: Record<string, Locale>,
  field: LocaleInheritanceField = "inheritTranslationsFrom",
) {
  const chain: string[] = [];
  const seen = new Set<string>();
  let currentKey: string | undefined = localeKey;

  while (currentKey && !seen.has(currentKey)) {
    seen.add(currentKey);
    chain.unshift(currentKey);
    currentKey = locales[currentKey]?.[field];
  }

  return chain;
}

export function resolveLocaleValue<T>(
  values: Record<string, T> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
): ResolvedLocaleValue<T> | undefined {
  const candidates = resolveLocaleChain(localeKey, locales).reverse();

  for (const candidate of candidates) {
    if (typeof values?.[candidate] !== "undefined") {
      return {
        value: values[candidate],
        sourceLocale: candidate,
        direct: candidate === localeKey,
      };
    }
  }
}

export function resolveInheritedLocaleValue<T>(
  values: Record<string, T> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
): ResolvedLocaleValue<T> | undefined {
  const seen = new Set<string>();
  let currentKey = locales[localeKey]?.inheritTranslationsFrom;

  while (currentKey && !seen.has(currentKey)) {
    seen.add(currentKey);
    if (typeof values?.[currentKey] !== "undefined") {
      return { value: values[currentKey], sourceLocale: currentKey, direct: false };
    }
    currentKey = locales[currentKey]?.inheritTranslationsFrom;
  }
}

export function getLocaleInheritanceDepth(localeKey: string, locales: Record<string, Locale>) {
  return Math.max(0, resolveLocaleChain(localeKey, locales).length - 1);
}
