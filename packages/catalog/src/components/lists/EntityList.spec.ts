import {
  getEntityListHighlightTerms,
  getRelationshipSummaryLabels,
  getTargetTooltipLabel,
} from "./EntityList";

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

describe("EntityList target metadata", function () {
  it("formats sorted unique target names for compact row tooltips", function () {
    expect(getTargetTooltipLabel(["mobile", "web", "mobile"])).toEqual("Targets: mobile, web");
  });

  it("returns an empty target tooltip label when no targets are present", function () {
    expect(getTargetTooltipLabel()).toEqual("");
    expect(getTargetTooltipLabel([])).toEqual("");
  });
});

describe("EntityList relationship metadata", function () {
  it("formats compact relationship count labels by entity type", function () {
    expect(
      getRelationshipSummaryLabels("message", { key: "welcome", href: "", usedInTargetCount: 2 }),
    ).toEqual(["2 targets"]);
    expect(
      getRelationshipSummaryLabels("attribute", {
        key: "plan",
        href: "",
        usedInSegmentCount: 1,
        usedInMessageCount: 2,
      }),
    ).toEqual(["1 segment", "2 messages"]);
    expect(
      getRelationshipSummaryLabels("segment", { key: "pro", href: "", usedInMessageCount: 1 }),
    ).toEqual(["1 message"]);
  });
});
