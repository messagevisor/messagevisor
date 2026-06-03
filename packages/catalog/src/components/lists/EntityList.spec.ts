import { getEntityListHighlightTerms } from "./EntityList";

describe("EntityList highlighting", function () {
  it("uses free text for key and last-modified highlights only", function () {
    expect(getEntityListHighlightTerms("welcome")).toEqual({
      key: ["welcome"],
      description: [],
      relationship: [],
      lastModified: ["welcome"],
    });
  });

  it("uses scoped qualifiers for visible description and relationship highlights", function () {
    expect(
      getEntityListHighlightTerms('description:"Welcome back" target:web locale:en-US'),
    ).toEqual({
      key: [],
      description: ["Welcome back"],
      relationship: ["web", "en-US"],
      lastModified: [],
    });
  });

  it("does not highlight status, overrides, or translation qualifiers in list rows", function () {
    expect(
      getEntityListHighlightTerms('has:overrides is:deprecated translation:"welcome"'),
    ).toEqual({
      key: [],
      description: [],
      relationship: [],
      lastModified: [],
    });
  });
});
