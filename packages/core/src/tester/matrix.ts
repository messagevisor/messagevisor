import type {
  LocaleAssertion,
  Matrix,
  MessageAssertion,
  TargetAssertion,
  SegmentAssertion,
} from "@messagevisor/types";

import { applyCombinationToValue, getMatrixCombinations, type MatrixCombination } from "../matrix";

interface MatrixEnabledAssertion {
  matrix?: Matrix;
  description?: string;
}

interface ExpandedAssertionMeta {
  assertionIndex: number;
  matrixIndex?: number;
  matrixValues?: MatrixCombination;
  matrixCount?: number;
}

export type ExpandedMessageAssertion = Omit<MessageAssertion, "matrix"> & ExpandedAssertionMeta;
export type ExpandedSegmentAssertion = Omit<SegmentAssertion, "matrix"> & ExpandedAssertionMeta;
export type ExpandedLocaleAssertion = Omit<LocaleAssertion, "matrix"> & ExpandedAssertionMeta;
export type ExpandedTargetAssertion = Omit<TargetAssertion, "matrix"> & ExpandedAssertionMeta;

function normalizeBooleanLike(value: unknown): unknown {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function expandAssertions<T extends MatrixEnabledAssertion>(
  assertions: T[],
  normalizer?: (assertion: any) => any,
): Array<Omit<T, "matrix"> & ExpandedAssertionMeta> {
  const expanded: Array<Omit<T, "matrix"> & ExpandedAssertionMeta> = [];

  for (let assertionIndex = 0; assertionIndex < assertions.length; assertionIndex++) {
    const rawAssertion = assertions[assertionIndex];
    const { matrix, ...assertionWithoutMatrix } = rawAssertion;

    if (!matrix) {
      expanded.push({
        ...(normalizer ? normalizer({ ...assertionWithoutMatrix }) : assertionWithoutMatrix),
        assertionIndex,
      } as Omit<T, "matrix"> & ExpandedAssertionMeta);
      continue;
    }

    const combinations = getMatrixCombinations(matrix);

    for (let matrixIndex = 0; matrixIndex < combinations.length; matrixIndex++) {
      const expandedAssertion = applyCombinationToValue(
        assertionWithoutMatrix,
        combinations[matrixIndex],
      ) as Omit<T, "matrix">;

      expanded.push({
        ...(normalizer ? normalizer(expandedAssertion) : expandedAssertion),
        assertionIndex,
        matrixIndex,
        matrixValues: combinations[matrixIndex],
        matrixCount: combinations.length,
      } as Omit<T, "matrix"> & ExpandedAssertionMeta);
    }
  }

  return expanded;
}

export function expandMessageAssertions(
  assertions: MessageAssertion[],
): ExpandedMessageAssertion[] {
  return expandAssertions(assertions, (assertion) => ({
    ...assertion,
    withFlags: assertion.withFlags
      ? Object.fromEntries(
          Object.entries(assertion.withFlags).map(([key, value]) => [
            key,
            normalizeBooleanLike(value),
          ]),
        )
      : assertion.withFlags,
  }));
}

export function expandSegmentAssertions(
  assertions: SegmentAssertion[],
): ExpandedSegmentAssertion[] {
  return expandAssertions(assertions, (assertion) => ({
    ...assertion,
    expectedToMatch: normalizeBooleanLike(assertion.expectedToMatch),
  }));
}

export function expandLocaleAssertions(assertions: LocaleAssertion[]): ExpandedLocaleAssertion[] {
  return expandAssertions(assertions);
}

export function expandTargetAssertions(assertions: TargetAssertion[]): ExpandedTargetAssertion[] {
  return expandAssertions(assertions);
}

export function expandTestAssertions(test: any): Array<Record<string, unknown>> {
  if ("message" in test) return expandMessageAssertions(test.assertions) as any;
  if ("segment" in test) return expandSegmentAssertions(test.assertions) as any;
  if ("locale" in test) return expandLocaleAssertions(test.assertions) as any;
  return expandTargetAssertions(test.assertions) as any;
}
