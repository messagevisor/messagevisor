import { matchesPattern, targetIncludesMessage } from "./targeting";

describe("targeting", function () {
  it("matches exact and wildcard patterns without treating regex characters specially", function () {
    expect(matchesPattern("checkout.title", "checkout.*")).toBe(true);
    expect(matchesPattern("checkoutXtitle", "checkout.title")).toBe(false);
    expect(matchesPattern("admin.title", ["checkout*", "admin*"])).toBe(true);
  });

  it("distinguishes omitted and explicitly empty includes", function () {
    expect(targetIncludesMessage(undefined, "anything")).toBe(true);
    expect(targetIncludesMessage({ includeMessages: [] }, "anything")).toBe(false);
  });

  it("applies excludes after includes", function () {
    expect(
      targetIncludesMessage(
        { includeMessages: "checkout*", excludeMessages: "checkout.internal*" },
        "checkout.internal.title",
      ),
    ).toBe(false);
  });
});
