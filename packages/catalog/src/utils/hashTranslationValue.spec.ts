import { hashTranslationValue } from "./hashTranslationValue";

describe("hashTranslationValue", function () {
  it("returns a stable alphanumeric hash for the same value", function () {
    const value = "Hello, world!";

    expect(hashTranslationValue(value)).toBe(hashTranslationValue(value));
    expect(hashTranslationValue(value)).toMatch(/^dup[0-9a-z]+$/);
  });

  it("produces different hashes for whitespace differences", function () {
    expect(hashTranslationValue("hello world")).not.toBe(hashTranslationValue("hello  world"));
    expect(hashTranslationValue("hello")).not.toBe(hashTranslationValue("hello\n"));
  });

  it("produces different hashes for special-character differences", function () {
    expect(hashTranslationValue("café")).not.toBe(hashTranslationValue("cafe"));
    expect(hashTranslationValue("a&b")).not.toBe(hashTranslationValue("a b"));
  });
});
