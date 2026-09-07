import {
  applyTranslationMutations,
  getTranslationSourceHash,
  getTranslationTargetHash,
  getTranslationStateIssues,
  reconcileTranslationGroup,
  type TranslationGroup,
} from "./index";

describe("atomic translation workflow", () => {
  const group: TranslationGroup = { translations: { en: "Hello", nl: "Hallo" } };
  const reviewed = () =>
    applyTranslationMutations(group, [{ locale: "nl", status: "reviewed" }], {
      sourceLocale: "en",
    });

  it("binds review to exact source and target text without mutating input", () => {
    const result = reviewed();
    expect(result.translationStates?.nl).toEqual({
      status: "reviewed",
      sourceHash: getTranslationSourceHash("Hello"),
      targetHash: getTranslationTargetHash("Hallo"),
    });
    expect(group.translationStates).toBeUndefined();
    expect(getTranslationSourceHash("é")).not.toBe(getTranslationSourceHash("e\u0301"));
    expect(getTranslationSourceHash("x\r\n")).not.toBe(getTranslationSourceHash("x\n"));
  });

  it("invalidates changed copy, preserves noops and deletes orphan states", () => {
    const original = reviewed();
    expect(applyTranslationMutations(original, [{ locale: "nl", value: "Hallo" }])).toEqual(
      original,
    );
    const changed = applyTranslationMutations(original, [{ locale: "nl", value: "Hoi" }]);
    expect(changed.translationStates?.nl).toEqual({ status: "translated" });
    expect(original.translations.nl).toBe("Hallo");
    const deleted = applyTranslationMutations(original, [{ locale: "nl", value: undefined }]);
    expect(deleted.translations).toEqual({ en: "Hello" });
    expect(deleted.translationStates).toBeUndefined();
    expect(
      reconcileTranslationGroup(group, { ...group, translationStates: { fr: { status: "draft" } } })
        .translationStates,
    ).toBeUndefined();
  });

  it("hashes the final source regardless of operation order and supports empty text", () => {
    const result = applyTranslationMutations(
      group,
      [
        { locale: "nl", value: "", status: "reviewed" },
        { locale: "en", value: "New" },
      ],
      { sourceLocale: "en" },
    );
    expect(result.translationStates?.nl).toEqual({
      status: "reviewed",
      sourceHash: getTranslationSourceHash("New"),
      targetHash: getTranslationTargetHash(""),
    });
  });

  it("resolves inherited source and keeps stale review evidence after source edits", () => {
    const original = applyTranslationMutations(group, [{ locale: "nl", status: "reviewed" }], {
      sourceLocale: "en-GB",
      locales: { en: {}, "en-GB": { inheritTranslationsFrom: "en" }, nl: {} },
    });
    const result = applyTranslationMutations(original, [{ locale: "en", value: "Changed" }]);
    expect(
      getTranslationStateIssues("Hallo", result.translationStates?.nl, "Changed"),
    ).toContainEqual({ code: "stale_translation", field: "sourceHash" });
    expect(
      getTranslationStateIssues("Direct edit", original.translationStates?.nl, "Hello"),
    ).toContainEqual({ code: "reviewed_translation_changed", field: "targetHash" });
  });

  it("rejects invalid review atomically and requires explicit review approval", () => {
    expect(() =>
      applyTranslationMutations(
        group,
        [
          { locale: "en", value: "new" },
          { locale: "fr", status: "reviewed" },
        ],
        { sourceLocale: "en" },
      ),
    ).toThrow("direct translation");
    expect(group.translations.en).toBe("Hello");
    expect(() => applyTranslationMutations(group, [{ locale: "nl", status: "reviewed" }])).toThrow(
      "sourceLocale",
    );
    expect(reconcileTranslationGroup(undefined, reviewed()).translationStates?.nl).toEqual({
      status: "translated",
    });
  });
});
