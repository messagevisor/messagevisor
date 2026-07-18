import * as crypto from "crypto";

import { resolveTranslationRow } from "./resolveTranslationRow";

describe("resolveTranslationRow", function () {
  const locales = {
    en: {},
    "en-US": { inheritTranslationsFrom: "en" },
    nl: {},
  };

  it("resolves direct, inherited, and missing values", function () {
    const translations = { en: "Hello", nl: "Hallo" };
    expect(resolveTranslationRow(translations, "nl", locales)).toEqual(
      expect.objectContaining({ source: "direct", value: "Hallo" }),
    );
    expect(resolveTranslationRow(translations, "en-US", locales)).toEqual(
      expect.objectContaining({ source: "inherited", from: "en", value: "Hello" }),
    );
    expect(resolveTranslationRow(translations, "de", locales)).toEqual({
      locale: "de",
      value: "",
      source: "missing",
    });
  });

  it("surfaces translation status and source staleness", function () {
    const sourceHash = crypto.createHash("sha256").update("Hello").digest("hex");
    expect(
      resolveTranslationRow({ en: "Hello", nl: "Hallo" }, "nl", locales, {
        sourceLocale: "en",
        states: { nl: { status: "reviewed", sourceHash } },
      }),
    ).toEqual(expect.objectContaining({ status: "reviewed", sourceHash, stale: false }));
    expect(
      resolveTranslationRow({ en: "Hello again", nl: "Hallo" }, "nl", locales, {
        sourceLocale: "en",
        states: { nl: { status: "reviewed", sourceHash } },
      }),
    ).toEqual(expect.objectContaining({ stale: true }));
  });
});
