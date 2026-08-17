import { fnv1a32, getVirtualBucket } from "./hashEntityKey";

describe("catalog entity key hashing", () => {
  it.each([
    ["", 2166136261],
    ["hello", 1335831723],
    ["welcome", 669089267],
    ["café.message", 3711523861],
    ["emoji-😀", 802847573],
    ["a".repeat(1000), 500786573],
    ["message.with-dash", 2716094821],
  ])("keeps the stable FNV-1a vector for %s", (value, expected) => {
    expect(fnv1a32(value)).toBe(expected);
  });

  it("maps keys into the configured 16-bit bucket space", () => {
    expect(getVirtualBucket("welcome")).toBe(fnv1a32("welcome") & 0xffff);
    expect(getVirtualBucket("welcome")).toBeGreaterThanOrEqual(0);
    expect(getVirtualBucket("welcome")).toBeLessThan(65536);
  });
});
