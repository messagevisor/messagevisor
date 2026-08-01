import {
  filterCatalogSetExecutions,
  normalizeSelectedSets,
  sortCatalogSetKeys,
} from "./setSelection";

describe("Catalog set selection", function () {
  it("normalizes repeatable set options without duplicates", function () {
    expect(normalizeSelectedSets([" dev ", "production", "dev", false])).toEqual([
      "dev",
      "production",
    ]);
  });

  it("filters executions and rejects unknown sets", function () {
    const executions = ["dev", "staging"].map((set) => ({
      set,
      projectConfig: {},
      datasource: {},
    }));
    expect(filterCatalogSetExecutions(executions, ["staging"])).toEqual([executions[1]]);
    expect(() => filterCatalogSetExecutions(executions, ["production"])).toThrow(
      "Catalog set not found: production",
    );
  });

  it("sorts development sets first and production sets last", function () {
    expect(sortCatalogSetKeys(["production", "staging", "dev-next", "dev", "prod-eu"])).toEqual([
      "dev",
      "dev-next",
      "staging",
      "prod-eu",
      "production",
    ]);
  });
});
