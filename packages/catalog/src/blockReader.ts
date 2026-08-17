export interface CatalogRangeTable {
  layoutVersion: number;
  vbucketBits: number;
  blockSize: number;
  blocks: Array<[number, string]>;
}

export function findBlockHash(ranges: CatalogRangeTable, vbucket: number): string {
  if (ranges.blocks.length === 0) {
    throw new Error("Catalog block range table is empty.");
  }

  let low = 0;
  let high = ranges.blocks.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = ranges.blocks[middle][0];

    if (start <= vbucket) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return ranges.blocks[Math.max(0, high)][1];
}

export interface BlockCache<T> {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  delete: (key: string) => void;
  clear: () => void;
}

export function createBlockCache<T>(maxBlocks = 16): BlockCache<T> {
  const values = new Map<string, T>();

  return {
    get(key) {
      const value = values.get(key);

      if (typeof value !== "undefined") {
        values.delete(key);
        values.set(key, value);
      }

      return value;
    },
    set(key, value) {
      values.delete(key);
      values.set(key, value);

      while (values.size > maxBlocks) {
        const oldest = values.keys().next().value;
        if (typeof oldest === "string") values.delete(oldest);
      }
    },
    delete(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}
