import { getMessageZodSchema } from "./messageSchema";

describe("authoring translator context schema", () => {
  const schema = getMessageZodSchema(
    ["en"],
    [],
    {},
    { namespaceCharacter: ".", exportOverrideKeySeparator: "$" },
  );
  const translatorContext = {
    notes: "Shown at checkout",
    contextUrls: ["https://example.test/screenshot"],
    maxGraphemes: 40,
    productArea: "Checkout",
    owner: "Copy team",
    legalClassification: "Marketing",
    terminology: { preferred: ["Basket"], forbidden: ["Cart"], doNotTranslate: ["Messagevisor"] },
    placeholders: { name: { description: "Customer name", examples: ["Ada"], direction: "auto" } },
    accessibility: "label",
  };
  it("accepts explicit context on messages and overrides", () => {
    expect(
      schema.safeParse({
        description: "Test",
        translations: { en: "Hi" },
        translatorContext,
        overrides: [{ key: "pro", segments: "*", translations: { en: "Pro" }, translatorContext }],
      }).success,
    ).toBe(true);
  });
  it.each([
    { maxGraphemes: -1 },
    { unknown: "field" },
    { contextUrls: ["javascript:alert(1)"] },
    { placeholders: { name: { examples: ["Ada"] } } },
  ])("rejects malformed context %p", (context) => {
    expect(
      schema.safeParse({
        description: "Test",
        translations: { en: "Hi" },
        translatorContext: context,
      }).success,
    ).toBe(false);
  });
  it("accepts target hashes but rejects malformed fingerprints", () => {
    const value = {
      description: "Test",
      translations: { en: "Hi" },
      translationStates: { en: { status: "reviewed", targetHash: "a".repeat(64) } },
    };
    expect(schema.safeParse(value).success).toBe(true);
    value.translationStates.en.targetHash = "bad";
    expect(schema.safeParse(value).success).toBe(false);
  });
});
