/** URL fragment prefix for locale duplicate translation values. */
const DUPLICATE_VALUE_HASH_PREFIX = "dup";

/**
 * Deterministic alphanumeric hash of a translation value for permalink fragments.
 * Hashes the full string (including whitespace and special characters).
 */
export function hashTranslationValue(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return `${DUPLICATE_VALUE_HASH_PREFIX}${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}
