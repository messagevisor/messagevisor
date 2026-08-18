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

// A block cannot split below one virtual bucket, so its largest possible size
// is bounded by the maximum messages per bucket multiplied by payload size.
// With 65,536 buckets, measured occupancy is 7 at 50k messages, 13 at 200k,
// 23 at 500k, and 34 at 1M. With 19 kB payloads that is about 133 kB at 50k,
// 247 kB at 200k, and 646 kB at 1M, so the configured budget becomes
// unenforceable well beyond current targets. Raising VBUCKET_BITS changes every
// key's placement and therefore requires a manifest layout version bump; the
// API currently rejects any other value, which is the gate that keeps this safe.

export function getVirtualBucket(key: string): number {
  return fnv1a32(key) & (VBUCKET_COUNT - 1);
}
