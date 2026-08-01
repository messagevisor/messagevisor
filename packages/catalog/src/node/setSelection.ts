export interface CatalogSetExecution {
  set: string;
  projectConfig: any;
  datasource: any;
}

export function normalizeSelectedSets(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : typeof values === "undefined" ? [] : [values];
  return Array.from(
    new Set(
      rawValues
        .flatMap((value) => (typeof value === "string" ? [value] : []))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function filterCatalogSetExecutions<T extends CatalogSetExecution>(
  executions: T[],
  selectedSets: string[] | undefined,
) {
  if (!selectedSets?.length) return executions;
  const selectedSet = new Set(selectedSets);
  const availableSets = new Set(executions.map(({ set }) => set));
  const missingSets = selectedSets.filter((set) => !availableSets.has(set));
  if (missingSets.length > 0) {
    throw new Error(`Catalog set not found: ${missingSets.join(", ")}`);
  }
  return executions.filter((execution) => selectedSet.has(execution.set));
}

function getCatalogSetSortRank(set: string) {
  const normalizedSet = set.toLowerCase();
  if (normalizedSet.startsWith("dev")) return 0;
  if (normalizedSet.startsWith("prod")) return 2;
  return 1;
}

export function sortCatalogSetKeys(setKeys: string[]) {
  return [...setKeys].sort((a, b) => {
    const rankDiff = getCatalogSetSortRank(a) - getCatalogSetSortRank(b);
    return rankDiff || a.localeCompare(b);
  });
}
