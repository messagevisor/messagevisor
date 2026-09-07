import { renameReferences } from "./references";

describe("typed editorial references", () => {
  it("renames attribute paths and authored contexts without traversing literal values", () => {
    const message = {
      key: "welcome",
      translations: { en: "plan" },
      meta: { attribute: "plan", context: { plan: "literal" } },
      examples: [{ locale: "en", context: { plan: { attribute: "plan" } }, values: { plan: 1 } }],
      overrides: [
        {
          conditions: { and: [{ attribute: "plan.name", operator: "equals", value: "plan" }] },
          translations: { en: "plan" },
        },
      ],
    };
    expect(renameReferences("attribute", "message", message, "plan", "tier")).toEqual({
      ...message,
      key: undefined,
      examples: [{ locale: "en", context: { tier: { attribute: "plan" } }, values: { plan: 1 } }],
      overrides: [
        {
          conditions: { and: [{ attribute: "tier.name", operator: "equals", value: "plan" }] },
          translations: { en: "plan" },
        },
      ],
    });
    expect(message.examples[0].context).toHaveProperty("plan");
  });

  it("renames locale copy, review states, examples, inheritance and Target format keys", () => {
    const state = { status: "reviewed", sourceHash: "en" };
    expect(
      renameReferences(
        "locale",
        "message",
        {
          translations: { en: "en" },
          translationStates: { en: state },
          overrides: [{ translations: { en: "en" }, translationStates: { en: state } }],
          examples: [{ locale: "en", values: { locale: "en" } }],
        },
        "en",
        "en-GB",
      ),
    ).toMatchObject({
      translations: { "en-GB": "en" },
      translationStates: { "en-GB": state },
      overrides: [{ translations: { "en-GB": "en" }, translationStates: { "en-GB": state } }],
      examples: [{ locale: "en-GB", values: { locale: "en" } }],
    });
    expect(
      renameReferences(
        "locale",
        "locale",
        {
          inheritFormatsFrom: "en",
          inheritTranslationsFrom: "en",
          mergeExamplesFrom: "en",
        },
        "en",
        "en-GB",
      ),
    ).toMatchObject({
      inheritFormatsFrom: "en-GB",
      inheritTranslationsFrom: "en-GB",
      mergeExamplesFrom: "en-GB",
    });
    expect(
      renameReferences("locale", "target", { locales: ["en"], formats: { en: {} } }, "en", "en-GB"),
    ).toMatchObject({ locales: ["en-GB"], formats: { "en-GB": {} } });
  });

  it("handles every test discriminator and leaves matrices and raw ICU messages alone", () => {
    const values = { locale: "old", target: "old", segment: "old", message: "old" };
    const matrix = { locale: ["old"], message: ["old"] };
    expect(
      renameReferences(
        "target",
        "test",
        {
          message: "hello",
          assertions: [{ locale: "en", target: "old", values, matrix }],
        },
        "old",
        "new",
      ),
    ).toMatchObject({ assertions: [{ target: "new", values, matrix }] });
    expect(
      renameReferences(
        "segment",
        "test",
        {
          segment: "old",
          assertions: [{ segment: "old", context: values }],
        },
        "old",
        "new",
      ),
    ).toMatchObject({ segment: "new", assertions: [{ segment: "new", context: values }] });
    expect(
      renameReferences(
        "target",
        "test",
        {
          locale: "en",
          assertions: [{ target: "old", rawMessage: "old", values }],
        },
        "old",
        "new",
      ),
    ).toMatchObject({ assertions: [{ target: "new", rawMessage: "old", values }] });
    expect(
      renameReferences(
        "locale",
        "test",
        {
          target: "web",
          assertions: [{ locale: "old", rawMessage: "old", values }],
        },
        "old",
        "new",
      ),
    ).toMatchObject({ assertions: [{ locale: "new", rawMessage: "old", values }] });
  });

  it("preserves wildcard patterns and rewrites structured segment groups", () => {
    expect(
      renameReferences(
        "message",
        "target",
        {
          includeMessages: ["old", "old.*", "*"],
          excludeMessages: "old",
        },
        "old",
        "new",
      ),
    ).toMatchObject({ includeMessages: ["new", "old.*", "*"], excludeMessages: "new" });
    expect(
      renameReferences(
        "segment",
        "message",
        {
          overrides: [{ segments: { and: ["old", { not: "other" }] } }],
        },
        "old",
        "new",
      ),
    ).toMatchObject({ overrides: [{ segments: { and: ["new", { not: "other" }] } }] });
  });

  it.each([null, [], 42, "old", { overrides: 1, examples: [null] }])(
    "preserves malformed shapes for canonical validation",
    (entity) => {
      expect(renameReferences("locale", "message", entity, "old", "new")).toEqual(entity);
    },
  );
});
