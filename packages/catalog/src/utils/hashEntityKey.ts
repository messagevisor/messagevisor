/**
 * FNV-1a 32-bit over UTF-16 code units.
 *
 * This intentionally uses charCodeAt instead of code points so Node and browser
 * runtimes produce the same virtual bucket for every entity key.
 */
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export const VBUCKET_BITS = 16;
export const VBUCKET_COUNT = 1 << VBUCKET_BITS;

export function getVirtualBucket(key: string): number {
  return fnv1a32(key) & (VBUCKET_COUNT - 1);
}
