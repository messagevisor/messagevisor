import { getCatalogAssertions, getTestAssertionPermalink } from "./testModel";

describe("Catalog test model", function () {
  it("preserves authored and applied matrix identity", function () {
    const assertions = getCatalogAssertions({
      key: "messages.welcome",
      entityType: "message",
      entityKey: "welcome",
      authoredAssertions: [
        { matrix: { locale: ["en", "nl"], plan: ["free", "pro"] }, locale: "${{ locale }}" },
      ],
      assertions: [
        { assertionIndex: 0, matrixIndex: 0, locale: "en" },
        { assertionIndex: 0, matrixIndex: 1, locale: "en" },
        { assertionIndex: 0, matrixIndex: 2, locale: "nl" },
        { assertionIndex: 0, matrixIndex: 3, locale: "nl" },
      ],
    });

    expect(assertions.map(({ label }) => label)).toEqual(["1.1", "1.2", "1.3", "1.4"]);
    expect(assertions[2]).toEqual(
      expect.objectContaining({
        caseIndex: 2,
        caseCount: 4,
        matrixValues: { locale: "nl", plan: "free" },
      }),
    );
    expect(getTestAssertionPermalink("messages.welcome", "1.3")).toBe("messages.welcome:1.3");
  });
});
