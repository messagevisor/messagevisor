import type { DuplicateTranslationValue } from "../types";
import { sortDuplicateValues } from "../utils/duplicateSorting";

function duplicate(value: string, count: number): DuplicateTranslationValue {
  const messageKeys = Array.from({ length: count }, (_, index) => `message.${index + 1}`);

  return {
    value,
    messageKeys,
    sources: messageKeys.map((messageKey) => ({ messageKey, locale: "en" })),
  };
}

describe("Locale duplicate sorting", function () {
  it("sorts by message count descending by default", function () {
    const sorted = sortDuplicateValues(
      [duplicate("two", 2), duplicate("four", 4), duplicate("three", 3)],
      { column: "messages", direction: "desc" },
    );

    expect(sorted.map((item) => item.value)).toEqual(["four", "three", "two"]);
  });

  it("sorts duplicate values alphabetically", function () {
    const sorted = sortDuplicateValues(
      [duplicate("Banana", 2), duplicate("Apple", 3), duplicate("Cherry", 2)],
      { column: "value", direction: "asc" },
    );

    expect(sorted.map((item) => item.value)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("can reverse both sortable columns", function () {
    expect(
      sortDuplicateValues([duplicate("two", 2), duplicate("four", 4)], {
        column: "messages",
        direction: "asc",
      }).map((item) => item.value),
    ).toEqual(["two", "four"]);

    expect(
      sortDuplicateValues([duplicate("Apple", 2), duplicate("Banana", 2)], {
        column: "value",
        direction: "desc",
      }).map((item) => item.value),
    ).toEqual(["Banana", "Apple"]);
  });
});
