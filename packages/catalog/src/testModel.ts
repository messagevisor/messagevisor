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

export function getCatalogAssertions(test: CatalogTestSpec): CatalogExpandedAssertion[] {
  return test.assertions.map((assertion, fallbackIndex) => {
    const assertionIndex =
      typeof assertion.assertionIndex === "number" ? assertion.assertionIndex : fallbackIndex;
    const matrixIndex =
      typeof assertion.matrixIndex === "number" ? assertion.matrixIndex : undefined;
    const matrixValues = assertion.matrixValues as Record<string, unknown> | undefined;
    const matrixCount =
      typeof assertion.matrixCount === "number" ? assertion.matrixCount : undefined;
    const cleanAssertion = { ...assertion };
    delete cleanAssertion.assertionIndex;
    delete cleanAssertion.matrixIndex;
    delete cleanAssertion.matrixValues;
    delete cleanAssertion.matrixCount;
    const assertionLabel =
      typeof assertion.key === "string" ? assertion.key : String(assertionIndex + 1);

    return {
      assertion: cleanAssertion,
      label:
        typeof matrixIndex === "number" ? `${assertionLabel}.${matrixIndex + 1}` : assertionLabel,
      ...(typeof matrixIndex === "number"
        ? {
            matrixValues,
            caseIndex: matrixIndex,
            caseCount: matrixCount,
          }
        : {}),
    };
  });
}

export function getTestAssertionPermalink(testKey: string, label: string) {
  return `${testKey}:${label}`;
}
