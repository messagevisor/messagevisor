import {
  getEntityListHighlightTerms,
  getRelationshipSummaryLabels,
  getTargetTooltipLabel,
  hasMessageOverrides,
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
  it("detects message override metadata for compact row indicators", function () {
    expect(hasMessageOverrides("message", { key: "welcome", href: "", overrideCount: 1 })).toBe(
      true,
    );
    expect(
      hasMessageOverrides("message", { key: "welcome", href: "", overrideLocales: ["en-US"] }),
    ).toBe(true);
    expect(hasMessageOverrides("message", { key: "welcome", href: "", overrideCount: 0 })).toBe(
      false,
    );
    expect(hasMessageOverrides("segment", { key: "pro", href: "", overrideCount: 1 })).toBe(
      false,
    );
  });

  it("formats compact relationship count labels by entity type", function () {
    expect(
      getRelationshipSummaryLabels("message", {
        key: "welcome",
        href: "",
        targets: ["web", "mobile"],
      }),
    ).toEqual([{ label: "Targets", value: "2", tooltip: "Targets: mobile, web" }]);
    expect(
      getRelationshipSummaryLabels("attribute", {
        key: "plan",
        href: "",
        targets: ["web"],
        usedInSegmentCount: 1,
        usedInMessageCount: 2,
      }),
    ).toEqual([
      { label: "Targets", value: "1", tooltip: "Targets: web" },
      { label: "Used in", value: "1 segment" },
      { label: "Used in", value: "2 messages" },
    ]);
    expect(
      getRelationshipSummaryLabels("segment", { key: "pro", href: "", usedInMessageCount: 1 }),
    ).toEqual([{ label: "Used in", value: "1 message" }]);
  });
});
