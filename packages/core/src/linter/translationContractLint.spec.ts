import type { Message } from "@messagevisor/types";
import {
  collectMessageContract,
  compareMessageContracts,
  lintTranslationContracts,
} from "./translationContractLint";
import { applyTranslationMutations } from "../translationWorkflow";

const compare = (source: string, target: string) =>
  compareMessageContracts(collectMessageContract(source), collectMessageContract(target));

describe("linguistically appropriate ICU contracts", () => {
  it("permits linguistic pluralisation, new CLDR categories and reordered arguments", () => {
    expect(
      compare(
        "{name}: {count}",
        "{count, plural, one {# item} few {# items} other {# items}} {name}",
      ),
    ).toEqual([]);
    expect(
      compare(
        "{n, plural, =0 {None} one {One} other {#}}",
        "{n, plural, =0 {Zero} few {Few} many {Many} other {#}}",
      ),
    ).toEqual([]);
    expect(compare("{when, date}", "{when, time}")).toEqual([]);
    expect(compare("{n, number}", "{n}")).toEqual([]);
  });

  it.each([
    [
      "{role, select, admin {Admin} other {Other}}",
      "{role, select, user {User} other {Other}}",
      "selectors.role",
    ],
    ["{n, plural, =0 {None} other {#}}", "{n, plural, other {#}}", "selectors.n"],
    ["{n, plural, offset:1 other {#}}", "{n, plural, other {#}}", "selectors.n"],
    ["{n, selectordinal, other {#}}", "{n, plural, other {#}}", "selectors.n"],
    ["{n, number}", "{n, date}", "arguments.n.type"],
    ["{name}", "{other}", "arguments.name"],
    ["<b><i>{name}</i></b>", "<i><b>{name}</b></i>", "tags"],
  ])("rejects semantic changes from %s", (source, target, difference) => {
    expect(compare(source, target)).toContain(difference);
  });

  it("does not mistake quoted ICU syntax for arguments", () => {
    expect(compare("'{literal}' {real}", "Texte {real}")).toEqual([]);
  });

  it("checks target hashes even when source ICU is invalid or contract lint is disabled", () => {
    const original: Message = applyTranslationMutations(
      { translations: { en: "{invalid", nl: "Hallo" } },
      [{ locale: "nl", status: "reviewed" }],
      { sourceLocale: "en" },
    );
    original.translations.nl = "Edited";
    for (const checkMessageContract of [false, true]) {
      expect(
        lintTranslationContracts({ welcome: original }, "en", () => "welcome.yml", {
          checkMessageContract,
        }).map((issue) => issue.code),
      ).toContain("reviewed_translation_changed");
    }
  });

  it("resolves effective sources and reports precise override paths", () => {
    const issues = lintTranslationContracts(
      {
        hello: {
          translations: { en: "Hi" },
          overrides: [{ key: "pro", segments: "*", translations: { en: "{name}", nl: "{wrong}" } }],
        },
      },
      "en-GB",
      () => "hello.yml",
      {
        checkMessageContract: true,
        locales: { en: {}, "en-GB": { inheritTranslationsFrom: "en" } },
      },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(["overrides", 0, "translations", "nl"]);
  });
});
