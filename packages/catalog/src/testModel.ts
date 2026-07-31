export interface CatalogTestSpec {
  key: string;
  entityType: string;
  entityKey: string;
  promotable?: boolean;
  authoredAssertions: Array<Record<string, unknown>>;
  assertions: Array<Record<string, unknown>>;
}

export interface CatalogExpandedAssertion {
  assertion: Record<string, unknown>;
  label: string;
  matrixValues?: Record<string, unknown>;
  caseIndex?: number;
  caseCount?: number;
}

function getMatrixCombinations(matrix: Record<string, unknown[]>) {
  return Object.keys(matrix).reduce<Array<Record<string, unknown>>>(
    (combinations, key) =>
      combinations.flatMap((combination) =>
        matrix[key].map((value) => ({ ...combination, [key]: value })),
      ),
    [{}],
  );
}

export function getCatalogAssertions(test: CatalogTestSpec): CatalogExpandedAssertion[] {
  return test.assertions.map((assertion, fallbackIndex) => {
    const assertionIndex =
      typeof assertion.assertionIndex === "number" ? assertion.assertionIndex : fallbackIndex;
    const matrixIndex =
      typeof assertion.matrixIndex === "number" ? assertion.matrixIndex : undefined;
    const authored = test.authoredAssertions[assertionIndex];
    const matrix = authored?.matrix as Record<string, unknown[]> | undefined;
    const combinations = matrix ? getMatrixCombinations(matrix) : [];
    const cleanAssertion = { ...assertion };
    delete cleanAssertion.assertionIndex;
    delete cleanAssertion.matrixIndex;

    return {
      assertion: cleanAssertion,
      label:
        typeof matrixIndex === "number"
          ? `${assertionIndex + 1}.${matrixIndex + 1}`
          : String(assertionIndex + 1),
      ...(typeof matrixIndex === "number"
        ? {
            matrixValues: combinations[matrixIndex],
            caseIndex: matrixIndex,
            caseCount: combinations.length,
          }
        : {}),
    };
  });
}

export function getTestAssertionPermalink(testKey: string, label: string) {
  return `${testKey}:${label}`;
}
