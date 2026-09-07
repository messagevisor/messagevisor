import type { FormatPresets, Locale } from "@messagevisor/types";
import { mergeFormatPresets } from "../formats";
import { resolveLocaleChain } from "../localeResolution";

export function resolveLintFormats(
  locale: string,
  locales: Record<string, Locale>,
  overrides?: FormatPresets,
) {
  let formats: FormatPresets | undefined;
  for (const key of resolveLocaleChain(locale, locales, "inheritFormatsFrom")) {
    formats = mergeFormatPresets(formats, locales[key]?.formats);
  }
  return mergeFormatPresets(formats, overrides);
}

/** Validate resolved options once, never construct a formatter per translation. */
export function createEffectiveFormatValidator() {
  const cache = new Map<string, string | null>();
  return (locale: string, formats: FormatPresets | undefined) => {
    const issues: { path: string[]; message: string }[] = [];
    for (const [type, presets] of Object.entries(formats || {})) {
      for (const [name, options] of Object.entries(presets || {})) {
        const key = JSON.stringify([locale, type, options]);
        if (!cache.has(key)) {
          let error: string | null = null;
          try {
            if (type === "number") {
              const opts = options as Intl.NumberFormatOptions;
              // Currency is allowed to come from the instance or an evaluation.
              new Intl.NumberFormat(
                locale,
                opts.style === "currency" && !opts.currency ? { ...opts, currency: "USD" } : opts,
              );
            } else if (type === "relative") {
              new Intl.RelativeTimeFormat(locale, options as Intl.RelativeTimeFormatOptions);
            } else {
              new Intl.DateTimeFormat(locale, options as Intl.DateTimeFormatOptions);
            }
          } catch (caught) {
            error = caught instanceof Error ? caught.message : String(caught);
          }
          cache.set(key, error);
        }
        const message = cache.get(key);
        if (message) issues.push({ path: [type, name], message });
      }
    }
    return issues;
  };
}
