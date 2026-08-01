import * as crypto from "crypto";

import type { Locale, TranslationStates } from "@messagevisor/types";

export interface ResolvedTranslationRow {
  locale: string;
  value: string;
  source: "direct" | "inherited" | "missing";
  from?: string;
  status?: "draft" | "translated" | "reviewed";
  sourceHash?: string;
  stale?: boolean;
}

export function resolveLocaleChain(
  localeKey: string,
  locales: Record<string, Locale>,
  field: "inheritFormatsFrom" | "inheritTranslationsFrom" = "inheritTranslationsFrom",
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

export function resolveTranslationRow(
  translations: Record<string, string> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
  options: { states?: TranslationStates; sourceLocale?: string } = {},
): ResolvedTranslationRow {
  const getWorkflow = (effectiveLocale: string) => {
    const state = options.states?.[effectiveLocale];
    if (!state) return {};
    const source = options.sourceLocale ? translations?.[options.sourceLocale] : undefined;
    return {
      status: state.status,
      sourceHash: state.sourceHash,
      stale:
        Boolean(state.sourceHash) &&
        typeof source === "string" &&
        state.sourceHash !== crypto.createHash("sha256").update(source).digest("hex"),
    };
  };

  if (typeof translations?.[localeKey] !== "undefined") {
    return {
      locale: localeKey,
      value: translations[localeKey],
      source: "direct",
      ...getWorkflow(localeKey),
    };
  }

  for (const candidate of resolveLocaleChain(localeKey, locales).reverse()) {
    if (candidate !== localeKey && typeof translations?.[candidate] !== "undefined") {
      return {
        locale: localeKey,
        value: translations[candidate],
        source: "inherited",
        from: candidate,
        ...getWorkflow(candidate),
      };
    }
  }

  return { locale: localeKey, value: "", source: "missing" };
}
