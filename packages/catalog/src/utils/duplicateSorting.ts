import type { DuplicateTranslationValue } from "../types";

export type DuplicateValuesSortColumn = "value" | "messages";
export type SortDirection = "asc" | "desc";

export interface DuplicateValuesSort {
  column: DuplicateValuesSortColumn;
  direction: SortDirection;
}

export function sortDuplicateValues(
  duplicateValues: DuplicateTranslationValue[],
  sort: DuplicateValuesSort,
): DuplicateTranslationValue[] {
  return duplicateValues.slice().sort((left, right) => {
    const direction = sort.direction === "asc" ? 1 : -1;
    const fallback = left.value.localeCompare(right.value);

    if (sort.column === "messages") {
      const result = left.messageKeys.length - right.messageKeys.length;
      return (result || fallback) * direction;
    }

    return (
      (left.value.localeCompare(right.value) ||
        left.messageKeys.length - right.messageKeys.length) * direction
    );
  });
}

export function getNextDuplicateValuesSort(
  current: DuplicateValuesSort,
  column: DuplicateValuesSortColumn,
): DuplicateValuesSort {
  if (current.column !== column) {
    return {
      column,
      direction: column === "messages" ? "desc" : "asc",
    };
  }

  return {
    column,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}
