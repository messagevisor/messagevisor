import type { Matrix } from "@messagevisor/types";

export type MatrixCombination = Record<string, unknown>;

function generateCombinations(
  keys: string[],
  matrix: Matrix,
  index: number,
  previous: MatrixCombination,
  combinations: MatrixCombination[],
) {
  const key = keys[index];
  const values = matrix[key] || [];

  for (const value of values) {
    const combination = { ...previous, [key]: value };

    if (index === keys.length - 1) {
      combinations.push(combination);
    } else {
      generateCombinations(keys, matrix, index + 1, combination, combinations);
    }
  }
}

export function getMatrixCombinations(matrix: Matrix) {
  const keys = Object.keys(matrix || {});

  if (keys.length === 0) {
    return [];
  }

  const combinations: MatrixCombination[] = [];
  generateCombinations(keys, matrix, 0, {}, combinations);

  return combinations;
}

export function applyCombinationToValue(value: unknown, combination: MatrixCombination): unknown {
  if (typeof value === "string") {
    const variableKeys = value.match(/\${{(.+?)}}/g);

    if (!variableKeys) {
      return value;
    }

    if (variableKeys.length === 1 && value.startsWith("${{") && value.endsWith("}}")) {
      const key = value.replace("${{", "").replace("}}", "").trim();
      return combination[key];
    }

    return value.replace(/\${{(.+?)}}/g, (_, key) => String(combination[key.trim()]));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => applyCombinationToValue(entry, combination));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        applyCombinationToValue(entry, combination),
      ]),
    );
  }

  return value;
}
