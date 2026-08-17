import {
  hashBlockContent,
  planBlocks,
  serializeBlock,
  toCatalogBlocks,
  toCatalogRangeTable,
} from "./blockWriter";
import { findBlockHash } from "../blockReader";
import { getVirtualBucket } from "../utils/hashEntityKey";

function entries(count: number, suffix = "") {
  return Array.from({ length: count }, (_, index) => ({
    key: `message.${index.toString().padStart(4, "0")}`,
    payload: { value: `${suffix}${index}`, padding: "x".repeat(80) },
  }));
}

describe("catalog message blocks", () => {
  it("splits oversized content into deterministic virtual bucket ranges", () => {
    const planned = planBlocks(entries(200), 16384);
    const first = toCatalogBlocks(entries(200), 16384);
    const second = toCatalogBlocks(entries(200), 16384);

    expect(first).toEqual(second);
    expect(planned.length).toBe(first.length);
    expect(first.length).toBeGreaterThan(1);

    const ranges = toCatalogRangeTable(first, 16384);
    expect(ranges.blocks[0][0]).toBe(0);

    for (const entry of entries(200)) {
      const blockHash = findBlockHash(ranges, getVirtualBucket(entry.key));
      expect(
        first.some((block) => block.contentHash === blockHash && block.content[entry.key]),
      ).toBe(true);
    }
  });

  it("changes only the block containing a changed entity", () => {
    const before = toCatalogBlocks(entries(200), 16384);
    const changedEntries = entries(200);
    changedEntries[17] = {
      ...changedEntries[17],
      payload: { ...changedEntries[17].payload, value: "changed" },
    };
    const after = toCatalogBlocks(changedEntries, 16384);
    const beforeHashes = new Set(before.map((block) => block.contentHash));
    const changedHashes = after.filter((block) => !beforeHashes.has(block.contentHash));

    expect(changedHashes.length).toBeGreaterThan(0);
    expect(changedHashes.length).toBeLessThan(after.length);
  });

  it("hashes the exact compact block payload", () => {
    const block = { key: "value" };
    const serialized = serializeBlock([{ key: "key", payload: "value" }]);

    expect(serialized).toBe(JSON.stringify(block));
    expect(hashBlockContent(serialized)).toHaveLength(16);
  });

  it("keeps integer-like keys in deterministic lexical order", () => {
    expect(
      serializeBlock([
        { key: "10", payload: "ten" },
        { key: "2", payload: "two" },
      ]),
    ).toBe('{"10":"ten","2":"two"}');
  });

  it("keeps a single oversized entity addressable", () => {
    const block = toCatalogBlocks(
      [{ key: "message.large", payload: { value: "x".repeat(20000) } }],
      16384,
    );

    expect(block).toHaveLength(1);
    expect(block[0].content["message.large"]).toBeDefined();
  });
});
