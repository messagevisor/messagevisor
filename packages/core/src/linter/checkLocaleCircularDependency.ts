import type { Locale } from "@messagevisor/types";

export type LocaleInheritanceField =
  | "inheritFormatsFrom"
  | "inheritTranslationsFrom"
  | "mergeExamplesFrom";

export interface LocaleCircularDependency {
  field: LocaleInheritanceField;
  cycle: string[];
}

export function checkLocaleCircularDependency(
  localesByKey: Record<string, Locale>,
  field: LocaleInheritanceField,
): LocaleCircularDependency[] {
  const cycles: LocaleCircularDependency[] = [];
  const reportedCycles = new Set<string>();

  for (const localeKey of Object.keys(localesByKey)) {
    const path: string[] = [];
    const seenInPath = new Map<string, number>();
    let currentKey: string | undefined = localeKey;

    while (currentKey) {
      if (seenInPath.has(currentKey)) {
        const cycle = [...path.slice(seenInPath.get(currentKey)), currentKey];
        const normalizedKey = cycle.slice(0, -1).sort().join(">");

        if (!reportedCycles.has(normalizedKey)) {
          reportedCycles.add(normalizedKey);
          cycles.push({ field, cycle });
        }

        break;
      }

      const locale = localesByKey[currentKey];

      if (!locale) {
        break;
      }

      seenInPath.set(currentKey, path.length);
      path.push(currentKey);
      currentKey = locale[field];
    }
  }

  return cycles;
}
