import { parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { visitIcuElements } from "../icuStyleReferences";
import { collectMessageContract } from "../linter/translationContractLint";
import {
  checkBidiSafety,
  checkTranslationQuality,
  countGraphemes,
  pseudoLocaliseIcu,
  resolveQualityDirection,
} from "./index";

describe("AST pseudo localisation", () => {
  const source =
    "Hello <b>{name}</b> '{quoted}' {n, plural, offset:1 =0 {None} one {# item} other {# items at {price, number, ::currency/USD}}}";
  it.each(["accent", "rtl"] as const)(
    "retains ICU syntax, skeletons and protected values in %s mode",
    (mode) => {
      const output = pseudoLocaliseIcu(source, { mode });
      expect(output).not.toEqual(source);
      expect(collectMessageContract(output)).toEqual(collectMessageContract(source));
      expect(output).toContain("::currency/USD");
      expect(output).toContain("offset:1 =0");
      expect(() => parse(output)).not.toThrow();
      if (mode === "rtl") expect(checkBidiSafety(output, { direction: "rtl" })).toEqual([]);
    },
  );

  it("preserves quoted braces, apostrophes, pound signs and tags as literal text", () => {
    const output = pseudoLocaliseIcu("'{x}' '#' '<b>' don''t", { expansion: 0 });
    const types: number[] = [];
    visitIcuElements(parse(output), (element) => types.push(element.type));
    expect(types.every((type) => type === TYPE.literal)).toBe(true);
    expect(output).toContain("''");
  });

  it("expands by graphemes and validates options", () => {
    expect(pseudoLocaliseIcu("abcd", { expansion: 0.5 })).toBe("[áƀçď~~]");
    expect(countGraphemes("👨‍👩‍👧‍👦e\u0301")).toBe(2);
    expect(() => pseudoLocaliseIcu("x", { expansion: NaN })).toThrow("expansion");
  });

  it.each(["accent", "rtl"] as const)(
    "preserves the exact literal punctuation in %s mode",
    (mode) => {
      for (const source of ["'{}'", "#", "'{<#}'", "'{}'''", "'#'"]) {
        const literal = (parse(source)[0] as { value: string }).value;
        const expected = mode === "rtl" ? [...literal].reverse().join("") : literal;
        const output = parse(pseudoLocaliseIcu(source, { mode, expansion: 0 }));
        expect(output).toEqual([
          {
            type: TYPE.literal,
            value: mode === "rtl" ? `\u2067${expected}\u2069` : `[${expected}]`,
          },
        ]);
      }
    },
  );

  it("quotes literal pound signs according to the enclosing ICU argument", () => {
    const source = "{n, plural, other {'#' {s, select, other {#}}}}";
    const output = parse(pseudoLocaliseIcu(source, { expansion: 0 }));
    const literals: string[] = [];
    visitIcuElements(output, (element) => {
      if (element.type === TYPE.literal) literals.push(element.value);
    });
    expect(literals).toEqual(["[", "# ", "#", "]"]);
  });

  it("retains existing isolate boundaries when reversing RTL literal text", () => {
    const source = "\u2066abc\u2069 \u2067def \u2068ghi\u2069 jkl\u2069 {name}";
    const output = pseudoLocaliseIcu(source, { mode: "rtl", expansion: 0 });
    expect(checkBidiSafety(output, { direction: "rtl" })).toEqual([]);
    expect(output).toContain("\u2066çƀá\u2069");
  });
});

describe("bidi and authoring quality", () => {
  it.each([
    ["a<b>b</b>c", "abc", true],
    ["a{n, select, x {b} other {b}}c", "abc", true],
    ["{n, select, x {ab} other {bc}}", "abc", false],
    ["a{n, select, x {} other {X}}bc", "abc", true],
    ["a{name}bc", "abc", false],
    ["ab<nested><b>ab</b></nested>ac", "ababac", true],
    ["é<b>💛</b>!", "é💛!", true],
    ["{n, plural, one {a} other {b}}c", "ac", true],
    ["a{n, plural, other {#}}bc", "abc", false],
    ["'{a}'<b>b</b>", "{a}b", true],
  ])("matches terminology through rendered literal paths: %s", (value, term, found) => {
    expect(
      checkTranslationQuality(value as string, {
        translatorContext: { terminology: { forbidden: [term as string] } },
      }).some((issue) => issue.code === "forbidden_terminology"),
    ).toBe(found);
  });

  it("bounds terminology analysis across exponentially many branch paths", () => {
    const value = "{n, select, x {a} other {b}}".repeat(100);
    expect(
      checkTranslationQuality(value, {
        translatorContext: { terminology: { forbidden: ["abc"] } },
      }),
    ).toEqual([]);
  });

  it("infers locale direction without overriding authored metadata", () => {
    expect(resolveQualityDirection("ar")).toBe("rtl");
    expect(resolveQualityDirection("he-IL")).toBe("rtl");
    expect(resolveQualityDirection("en")).toBe("ltr");
    expect(resolveQualityDirection("ar", "ltr")).toBe("ltr");
    expect(resolveQualityDirection("invalid_locale")).toBeUndefined();
  });
  it("checks substitutions and pound values inside every branch", () => {
    const value = "مرحبا {name} {n, plural, one {#} other {{id}}}";
    expect(checkBidiSafety(value, { direction: "rtl" }).map((issue) => issue.argument)).toEqual([
      "name",
      "#",
      "id",
    ]);
    expect(checkBidiSafety("مرحبا \u2068{name}\u2069", { direction: "rtl" })).toEqual([]);
    expect(
      checkBidiSafety("مرحبا {name}", {
        direction: "rtl",
        translatorContext: {
          placeholders: { name: { description: "Arabic name", direction: "rtl" } },
        },
      }),
    ).toEqual([]);
  });

  it("detects override controls and unbalanced branch isolation", () => {
    expect(checkBidiSafety("\u202Etext").map((issue) => issue.code)).toContain(
      "bidi_unsafe_control",
    );
    expect(checkBidiSafety("\u2069text").map((issue) => issue.code)).toContain(
      "bidi_unbalanced_isolate",
    );
    expect(
      checkBidiSafety("{n, plural, one {\u2068one} other {other\u2069}}").map(
        (issue) => issue.code,
      ),
    ).toContain("bidi_unbalanced_isolate");
    expect(checkBidiSafety("{bad")).toMatchObject([{ code: "invalid_icu" }]);
  });

  it("requires the innermost isolate around an LTR value to be LRI or FSI", () => {
    expect(
      checkBidiSafety("\u2068\u2067{name}\u2069\u2069", { direction: "rtl" }).map(
        (issue) => issue.code,
      ),
    ).toEqual(["bidi_unisolated_argument"]);
    expect(checkBidiSafety("\u2067\u2068{name}\u2069\u2069", { direction: "rtl" })).toEqual([]);
  });

  it("checks literal grapheme budgets and forbidden terms without reading ICU names", () => {
    expect(
      checkTranslationQuality("👨‍👩‍👧‍👦 {secret}", {
        translatorContext: { maxGraphemes: 2, terminology: { forbidden: ["secret"] } },
      }),
    ).toEqual([]);
    expect(
      checkTranslationQuality("secret", {
        translatorContext: { maxGraphemes: 2, terminology: { forbidden: ["secret"] } },
      }).map((issue) => issue.code),
    ).toEqual(["grapheme_limit", "forbidden_terminology"]);
  });

  it("uses the longest branch path and never joins terminology across alternatives", () => {
    const value = "Hi {n, plural, one {secret} other {phrase}}!";
    expect(
      checkTranslationQuality(value, {
        translatorContext: { maxGraphemes: 10, terminology: { forbidden: ["secretphrase"] } },
      }),
    ).toEqual([]);
    expect(
      checkTranslationQuality(value, { translatorContext: { maxGraphemes: 9 } }).map(
        (issue) => issue.code,
      ),
    ).toEqual(["grapheme_limit"]);
  });
});
