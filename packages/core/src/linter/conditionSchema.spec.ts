import { getConditionsZodSchema } from "./conditionSchema";

const schema = getConditionsZodSchema({ code: { type: "string" } });

describe("condition schema regex operators", function () {
  it("accepts valid matches and notMatches expressions", function () {
    expect(
      schema.safeParse({
        attribute: "code",
        operator: "matches",
        value: "^summer-[0-9]+$",
        regexFlags: "i",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ attribute: "code", operator: "notMatches", value: "internal" }).success,
    ).toBe(true);
  });

  it("rejects invalid expressions, flags on other operators, and non-string attributes", function () {
    expect(schema.safeParse({ attribute: "code", operator: "matches", value: "[" }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        attribute: "code",
        operator: "equals",
        value: "x",
        regexFlags: "i",
      }).success,
    ).toBe(false);
    expect(
      getConditionsZodSchema({ count: { type: "integer" } }).safeParse({
        attribute: "count",
        operator: "matches",
        value: "1",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        attribute: "code",
        operator: "matches",
        value: "x",
        regexFlags: "invalid",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        attribute: "code",
        operator: "matches",
        value: "x",
        regexFlags: "ii",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        attribute: "code",
        operator: "matches",
        value: "x",
        regexFlags: "g",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["lookahead", "value(?=x)"],
    ["lookbehind", "(?<=x)value"],
    ["noncapturing group", "(?:value)"],
    ["named group", "(?<name>value)"],
    ["backreference", "(value)\\1"],
    ["named backreference", "(?<name>value)\\k<name>"],
    ["possessive quantifier", "value++"],
  ])("rejects portable regex incompatible %s syntax", function (_name, value) {
    expect(schema.safeParse({ attribute: "code", operator: "matches", value }).success).toBe(false);
  });

  it.each([
    ["special characters in a class", "^[()?+*]+$", undefined],
    ["an escaped literal backslash before a digit", "^\\\\1$", undefined],
    ["a Unicode code point", "^.$", "u"],
  ])("accepts portable regex syntax for %s", function (_name, value, regexFlags) {
    expect(
      schema.safeParse({ attribute: "code", operator: "matches", value, regexFlags }).success,
    ).toBe(true);
  });

  it("requires portable timezone-qualified ISO date-time values", function () {
    const dateSchema = getConditionsZodSchema({ createdAt: { type: "date" } });
    expect(
      dateSchema.safeParse({
        attribute: "createdAt",
        operator: "before",
        value: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      dateSchema.safeParse({
        attribute: "createdAt",
        operator: "before",
        value: "2026-01-01",
      }).success,
    ).toBe(false);
  });
});
