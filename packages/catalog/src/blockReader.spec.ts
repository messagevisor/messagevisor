import { createBlockCache, findBlockHash } from "./blockReader";

describe("catalog block reader", () => {
  const ranges = {
    layoutVersion: 1,
    vbucketBits: 16,
    blockSize: 262144,
    blocks: [
      [0, "first"],
      [100, "middle"],
      [50000, "last"],
    ] as Array<[number, string]>,
  };

  it.each([
    [0, "first"],
    [99, "first"],
    [100, "middle"],
    [49999, "middle"],
    [50000, "last"],
    [65535, "last"],
  ])("finds the owning block at bucket %s", (bucket, expected) => {
    expect(findBlockHash(ranges, bucket)).toBe(expected);
  });

  it("handles a single block and rejects an empty table", () => {
    expect(findBlockHash({ ...ranges, blocks: [[0, "only"]] }, 65535)).toBe("only");
    expect(() => findBlockHash({ ...ranges, blocks: [] }, 0)).toThrow(
      "Catalog block range table is empty",
    );
  });

  it("evicts the least recently used block", () => {
    const cache = createBlockCache<string>(2);

    cache.set("a", "A");
    cache.set("b", "B");
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C");

    expect(cache.get("a")).toBe("A");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("C");
  });
});
