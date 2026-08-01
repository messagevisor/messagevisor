import type { Locale } from "@messagevisor/types";

import {
  getLocaleInheritanceDepth,
  resolveInheritedLocaleValue,
  resolveLocaleChain,
  resolveLocaleValue,
} from "./localeResolution";

const locales: Record<string, Locale> = {
  en: {},
  "en-GB": { inheritTranslationsFrom: "en", inheritFormatsFrom: "en" },
  "en-GB-x-product": {
    inheritTranslationsFrom: "en-GB",
    inheritFormatsFrom: "en-GB",
  },
};

describe("locale resolution", function () {
  it("returns root-to-child chains for either inheritance field", function () {
    expect(resolveLocaleChain("en-GB-x-product", locales)).toEqual([
      "en",
      "en-GB",
      "en-GB-x-product",
    ]);
    expect(resolveLocaleChain("en-GB", locales, "inheritFormatsFrom")).toEqual(["en", "en-GB"]);
  });

  it("resolves the nearest value and preserves empty strings", function () {
    expect(resolveLocaleValue({ en: "parent", "en-GB": "" }, "en-GB-x-product", locales)).toEqual({
      value: "",
      sourceLocale: "en-GB",
      direct: false,
    });
    expect(resolveLocaleValue({ "en-GB": "direct" }, "en-GB", locales)).toEqual({
      value: "direct",
      sourceLocale: "en-GB",
      direct: true,
    });
  });

  it("can resolve inherited-only values and depth", function () {
    expect(resolveInheritedLocaleValue({ en: "parent" }, "en-GB", locales)).toEqual({
      value: "parent",
      sourceLocale: "en",
      direct: false,
    });
    expect(getLocaleInheritanceDepth("en-GB-x-product", locales)).toBe(2);
  });

  it("stops safely when an invalid project contains an inheritance cycle", function () {
    const cyclic: Record<string, Locale> = {
      a: { inheritTranslationsFrom: "b" },
      b: { inheritTranslationsFrom: "a" },
    };
    expect(resolveLocaleChain("a", cyclic)).toEqual(["b", "a"]);
    expect(resolveLocaleValue(undefined, "a", cyclic)).toBeUndefined();
  });
});
