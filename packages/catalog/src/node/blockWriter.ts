import * as crypto from "crypto";

import { getVirtualBucket, VBUCKET_COUNT } from "../utils/hashEntityKey";

export interface BlockPlanEntry<T = unknown> {
  key: string;
  payload: T;
}

export interface PlannedBlock<T = unknown> {
  vbucketStart: number;
  vbucketEnd: number;
  entries: BlockPlanEntry<T>[];
}

export interface CatalogBlock<T = unknown> {
  vbucketStart: number;
  contentHash: string;
  content: Record<string, T>;
}

export interface CatalogRangeTable {
  layoutVersion: number;
  vbucketBits: number;
  blockSize: number;
  blocks: Array<[number, string]>;
}

function serializeEntries<T>(entries: BlockPlanEntry<T>[]) {
  const content: Record<string, T> = {};

  for (const entry of [...entries].sort((left, right) => left.key.localeCompare(right.key))) {
    content[entry.key] = entry.payload;
  }

  return JSON.stringify(content);
}

function getSerializedByteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function splitEntries<T>(entries: BlockPlanEntry<T>[], splitAt: number) {
  const left: BlockPlanEntry<T>[] = [];
  const right: BlockPlanEntry<T>[] = [];

  for (const entry of entries) {
    if (getVirtualBucket(entry.key) < splitAt) {
      left.push(entry);
    } else {
      right.push(entry);
    }
  }

  return [left, right] as const;
}

/**
 * Plans deterministic, contiguous virtual-bucket ranges. Empty children are
 * omitted from the returned plan; the reader treats the previous non-empty
 * range as the owner of any gap, which still gives correct results for known
 * keys.
 */
export function planBlocks<T>(entries: BlockPlanEntry<T>[], blockSize: number): PlannedBlock<T>[] {
  const initial: PlannedBlock<T> = {
    vbucketStart: 0,
    vbucketEnd: VBUCKET_COUNT,
    entries: [...entries].sort((left, right) => left.key.localeCompare(right.key)),
  };
  const pending = [initial];
  const planned: PlannedBlock<T>[] = [];

  while (pending.length > 0) {
    const block = pending.shift() as PlannedBlock<T>;
    const serialized = serializeEntries(block.entries);

    if (
      getSerializedByteLength(serialized) > blockSize &&
      block.vbucketEnd - block.vbucketStart > 1
    ) {
      const splitAt = Math.floor((block.vbucketStart + block.vbucketEnd) / 2);
      const [leftEntries, rightEntries] = splitEntries(block.entries, splitAt);

      if (leftEntries.length > 0) {
        pending.push({
          vbucketStart: block.vbucketStart,
          vbucketEnd: splitAt,
          entries: leftEntries,
        });
      }

      if (rightEntries.length > 0) {
        pending.push({
          vbucketStart: splitAt,
          vbucketEnd: block.vbucketEnd,
          entries: rightEntries,
        });
      }

      continue;
    }

    planned.push(block);
  }

  return planned.sort((left, right) => left.vbucketStart - right.vbucketStart);
}

export function serializeBlock<T>(entries: BlockPlanEntry<T>[]) {
  return serializeEntries(entries);
}

export function hashBlockContent(content: string) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function toCatalogBlocks<T>(entries: BlockPlanEntry<T>[], blockSize: number) {
  return planBlocks(entries, blockSize).map((planned) => {
    const content = JSON.parse(serializeBlock(planned.entries)) as Record<string, T>;
    const serialized = JSON.stringify(content);

    return {
      vbucketStart: planned.vbucketStart,
      contentHash: hashBlockContent(serialized),
      content,
    } satisfies CatalogBlock<T>;
  });
}

export function toCatalogRangeTable(
  blocks: Array<Pick<CatalogBlock, "vbucketStart" | "contentHash">>,
  blockSize: number,
  layoutVersion = 1,
): CatalogRangeTable {
  return {
    layoutVersion,
    vbucketBits: 16,
    blockSize,
    blocks: blocks
      .sort((left, right) => left.vbucketStart - right.vbucketStart)
      .map((block, index) => [index === 0 ? 0 : block.vbucketStart, block.contentHash]),
  };
}
