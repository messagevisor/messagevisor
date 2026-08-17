import * as crypto from "crypto";

import { getVirtualBucket, VBUCKET_COUNT } from "../utils/hashEntityKey";

export interface BlockPlanEntry<T = unknown> {
  key: string;
  payload: T;
}

interface PreparedBlockPlanEntry<T = unknown> extends BlockPlanEntry<T> {
  serializedByteLength: number;
}

export interface PlannedBlock<T = unknown> {
  vbucketStart: number;
  vbucketEnd: number;
  entries: BlockPlanEntry<T>[];
}

interface PreparedPlannedBlock<T = unknown> {
  vbucketStart: number;
  vbucketEnd: number;
  entries: PreparedBlockPlanEntry<T>[];
}

export interface CatalogBlock<T = unknown> {
  vbucketStart: number;
  contentHash: string;
  content: Record<string, T>;
  serialized: string;
}

export interface CatalogRangeTable {
  layoutVersion: number;
  vbucketBits: number;
  blockSize: number;
  blocks: Array<[number, string]>;
}

function serializeEntries<T>(entries: BlockPlanEntry<T>[]) {
  return `{${[...entries]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((entry) => serializeEntry(entry))
    .join(",")}}`;
}

function serializeEntry<T>(entry: BlockPlanEntry<T>) {
  return `${JSON.stringify(entry.key)}:${JSON.stringify(entry.payload) ?? "null"}`;
}

function prepareEntries<T>(entries: BlockPlanEntry<T>[]): PreparedBlockPlanEntry<T>[] {
  return [...entries]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((entry) => ({
      ...entry,
      serializedByteLength: Buffer.byteLength(serializeEntry(entry), "utf8"),
    }));
}

function getSerializedByteLength<T>(entries: PreparedBlockPlanEntry<T>[]) {
  if (entries.length === 0) {
    return 2;
  }

  return (
    2 +
    entries.reduce((total, entry) => total + entry.serializedByteLength, 0) +
    Math.max(0, entries.length - 1)
  );
}

function splitEntries<T>(entries: PreparedBlockPlanEntry<T>[], splitAt: number) {
  const left: PreparedBlockPlanEntry<T>[] = [];
  const right: PreparedBlockPlanEntry<T>[] = [];

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
 * keys. Midpoint splitting intentionally favours stable insertion behaviour
 * over perfect packing, so blocks may average below the configured budget.
 */
export function planBlocks<T>(entries: BlockPlanEntry<T>[], blockSize: number): PlannedBlock<T>[] {
  const initial: PreparedPlannedBlock<T> = {
    vbucketStart: 0,
    vbucketEnd: VBUCKET_COUNT,
    entries: prepareEntries(entries),
  };
  const pending: PreparedPlannedBlock<T>[] = [initial];
  const planned: PreparedPlannedBlock<T>[] = [];

  while (pending.length > 0) {
    const block = pending.shift() as PreparedPlannedBlock<T>;
    if (
      getSerializedByteLength(block.entries) > blockSize &&
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
  return crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

export function toCatalogBlocks<T>(entries: BlockPlanEntry<T>[], blockSize: number) {
  return planBlocks(entries, blockSize).map((planned) => {
    const serialized = serializeBlock(planned.entries);
    const content: Record<string, T> = {};

    for (const entry of planned.entries) {
      content[entry.key] = entry.payload;
    }

    return {
      vbucketStart: planned.vbucketStart,
      contentHash: hashBlockContent(serialized),
      content,
      serialized,
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
