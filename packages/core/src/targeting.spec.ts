import { matchesPattern, targetIncludesMessage, resolveTargetLocaleKeys } from "./targeting";

describe("targeting", function () {
  it("shares omitted, empty and explicit locale boundaries across consumers", () => {
    const all = ["en", "nl"];
    expect(resolveTargetLocaleKeys(undefined, all)).toEqual(all);
    expect(resolveTargetLocaleKeys({ locales: [] }, all, "en")).toEqual([]);
    expect(resolveTargetLocaleKeys({ locales: ["en"] }, all, "nl")).toEqual([]);
    expect(resolveTargetLocaleKeys({ locales: ["en"] }, all, ["nl", "en"])).toEqual(["en"]);
    expect(resolveTargetLocaleKeys(undefined, all, [])).toEqual([]);
    expect(resolveTargetLocaleKeys({}, all, "nl")).toEqual(["nl"]);
  });
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
