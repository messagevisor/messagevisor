import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { lintProject } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

describe("lintProject", function () {
  it("finds missing locales", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors.map((error) => error.message)).toContain(
      "At least one locale is required",
    );
  });

  it("disables ICU skeleton syntax by default", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");

    const projectConfig = getProjectConfig(root);

    expect(projectConfig.icuSkeleton).toEqual(false);
  });

  it("reports strict schema errors", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\nunknown: true\n");

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.hasError).toEqual(true);
    expect(
      result.errors.some(
        (error) =>
          error.entityType === "locale" &&
          error.filePath === path.join("locales", "en.yml") &&
          error.code === "unrecognized_keys" &&
          error.message.includes("unknown"),
      ),
    ).toEqual(true);
  });

  it("rejects non-boolean promotable values", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\npromotable: nope\n");

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(
      result.errors.some(
        (error) =>
          error.entityType === "locale" &&
          error.path.join(".") === "promotable" &&
          error.message.toLowerCase().includes("boolean"),
      ),
    ).toEqual(true);
  });

  it("rejects non-object message meta values", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/auth/signin.yml",
      ["description: Sign in", "meta: nope", "translations:", "  en: Sign in", ""].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(
      result.errors.some(
        (error) =>
          error.entityType === "message" &&
          error.path.join(".") === "meta" &&
          error.message.toLowerCase().includes("record"),
      ),
    ).toEqual(true);
  });

  it("validates message examples strictly", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/auth/signin.yml",
      [
        "description: Sign in",
        "examples:",
        "  - locale: en",
        "  - locale: missing",
        "  - matrix:",
        "      locale: [en]",
        "    locale: ${{ locale }}",
        "  - matrix:",
        "      user:",
        "        name: Ada",
        "    locale: en",
        "translations:",
        "  en: Sign in",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(
      result.errors.some(
        (error) =>
          error.entityType === "message" &&
          error.path.join(".") === "examples.1.locale" &&
          error.message.includes('Unknown locale "missing"'),
      ),
    ).toEqual(true);
    expect(
      result.errors.some(
        (error) =>
          error.path.join(".") === "examples.3.matrix.user" &&
          error.message.toLowerCase().includes("array"),
      ),
    ).toEqual(true);
    expect(
      result.errors.some(
        (error) => error.entityType === "message" && error.path.join(".") === "examples.2.locale",
      ),
    ).toEqual(false);
  });

  it("reports circular locale dependencies for translations, formats, and examples", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "messages/auth/signin.yml",
      "description: Sign in\ntranslations:\n  en: Sign in\n",
    );
    await writeFile(
      root,
      "locales/en.yml",
      "description: English\ninheritTranslationsFrom: nl\nmergeExamplesFrom: fr\nexamples:\n  - rawMessage: Hello\n",
    );
    await writeFile(
      root,
      "locales/nl.yml",
      "description: Dutch\ninheritTranslationsFrom: en\ninheritFormatsFrom: fr\n",
    );
    await writeFile(
      root,
      "locales/fr.yml",
      "description: French\ninheritFormatsFrom: nl\nmergeExamplesFrom: en\nexamples:\n  - message: auth.signin\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    const circularErrors = result.errors.filter(
      (error) => error.code === "circular_locale_dependency",
    );

    expect(circularErrors).toHaveLength(3);
    expect(circularErrors.map((error) => error.path[0]).sort()).toEqual([
      "inheritFormatsFrom",
      "inheritTranslationsFrom",
      "mergeExamplesFrom",
    ]);
  });

  it("validates locale examples strictly", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "messages/auth/signin.yml",
      "description: Sign in\ntranslations:\n  en: Sign in\n",
    );
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "examples:",
        "  - rawMessage: Hello",
        "    message: auth.signin",
        "  - description: Missing both",
        "  - message: missing.key",
        "  - matrix:",
        "      user:",
        "        name: Ada",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const messages = result.errors.map((error) => error.message);

    expect(messages).toContain("Example must define exactly one of `rawMessage` or `message`.");
    expect(messages).toContain('Unknown message "missing.key"');
    expect(
      result.errors.some(
        (error) =>
          error.path.join(".") === "examples.3.matrix.user" &&
          error.message.toLowerCase().includes("array"),
      ),
    ).toEqual(true);
  });

  it("accepts expanded Intl-backed locale format preset options", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "formats:",
        "  number:",
        "    compactShort:",
        "      notation: compact",
        "      compactDisplay: short",
        "    unitDistance:",
        "      style: unit",
        "      unit: kilometer",
        "      unitDisplay: short",
        "    signNegative:",
        "      signDisplay: negative",
        "    priceName:",
        "      style: currency",
        "      currency: USD",
        "      currencyDisplay: name",
        "    runtimeMoney:",
        "      style: currency",
        "      currencyDisplay: code",
        "    rounded:",
        "      maximumFractionDigits: 2",
        "      roundingMode: halfExpand",
        "      roundingPriority: lessPrecision",
        "      trailingZeroDisplay: stripIfInteger",
        "      numberingSystem: latn",
        "  date:",
        "    fullStyle:",
        "      dateStyle: full",
        "      calendar: gregory",
        "    arabicNumeric:",
        "      year: numeric",
        "      month: 2-digit",
        "      day: 2-digit",
        "      numberingSystem: arab",
        "  time:",
        "    fullStyle:",
        "      timeStyle: full",
        "      timeZone: UTC",
        "    period:",
        "      hour: numeric",
        "      dayPeriod: long",
        "      hour12: true",
        "  dateTimeRange:",
        "    fullStyle:",
        "      dateStyle: full",
        "      timeStyle: short",
        "      timeZone: UTC",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "targets/web.yml",
      [
        "description: Web",
        "includeMessages:",
        "  - '*'",
        "locales:",
        "  - en",
        "formats:",
        "  en:",
        "    number:",
        "      runtimeMoney:",
        "        style: currency",
        "        currencyDisplay: symbol",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors).toHaveLength(0);
  });

  it("validates target-level datafile build options", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "targets/web.yml",
      [
        "description: Web",
        "includeMessages:",
        "  - '*'",
        "locales:",
        "  - en",
        "stringify: false",
        "pretty: true",
        "revisionFromHash: true",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors).toHaveLength(0);

    await writeFile(
      root,
      "targets/web.yml",
      [
        "description: Web",
        "includeMessages:",
        "  - '*'",
        "locales:",
        "  - en",
        "stringify: no",
        "pretty: yes",
        "revisionFromHash: sometimes",
        "",
      ].join("\n"),
    );

    const invalidResult = await lintProject(projectConfig, datasource);
    const paths = invalidResult.errors.map((error) => error.path.join("."));

    expect(paths).toContain("stringify");
    expect(paths).toContain("pretty");
    expect(paths).toContain("revisionFromHash");
  });

  it("allows targets with empty or omitted includeMessages", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "targets/empty.yml",
      ["description: Empty", "includeMessages: []", "locales:", "  - en", ""].join("\n"),
    );
    await writeFile(
      root,
      "targets/all.yml",
      ["description: All", "locales:", "  - en", ""].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors).toHaveLength(0);
  });

  it("allows string includeMessages and excludeMessages in targets", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "targets/web.yml",
      [
        "description: Web",
        'includeMessages: "*"',
        "excludeMessages: internal*",
        "locales:",
        "  - en",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors).toHaveLength(0);
  });

  it("allows target includeFormats and excludeFormats pattern maps", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "targets/web.yml",
      [
        "description: Web",
        'includeMessages: "*"',
        "includeFormats:",
        '  number: "*"',
        "  date: short*",
        "  time:",
        "    - short",
        "    - long*",
        "excludeFormats:",
        "  number: money*",
        "locales:",
        "  - en",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors).toHaveLength(0);
  });

  it("rejects unknown target includeFormats and excludeFormats types", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "targets/web.yml",
      [
        "description: Web",
        'includeMessages: "*"',
        "includeFormats:",
        '  number: "*"',
        '  unknown: "*"',
        "excludeFormats:",
        '  nope: "*"',
        "locales:",
        "  - en",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const paths = result.errors.map((error) => error.path.join("."));

    expect(paths).toContain("includeFormats");
    expect(paths).toContain("excludeFormats");
  });

  it("rejects invalid locale format option combinations and ICU-only pseudo-styles", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "formats:",
        "  number:",
        "    badUnit:",
        "      style: unit",
        "    badCompact:",
        "      compactDisplay: short",
        "    badSpellout:",
        "      style: spellout",
        "  date:",
        "    badDateStyle:",
        "      dateStyle: full",
        "      year: numeric",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const messages = result.errors.map((error) => error.message);

    expect(messages).toContain("Unit number formats must define `unit`.");
    expect(messages).toContain('`compactDisplay` can only be used when `notation` is "compact".');
    expect(messages).toContain(
      "`dateStyle` / `timeStyle` cannot be combined with granular date/time component fields.",
    );
    expect(
      result.errors.some((error) => error.path.join(".") === "formats.number.badSpellout.style"),
    ).toEqual(true);
  });

  it("validates test assertion matrix usage", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "targets/web.yml",
      "description: Web\nincludeMessages:\n  - '*'\nlocales:\n  - en\n",
    );
    await writeFile(root, "segments/adult.yml", "conditions: '*'\ndescription: Adult\n");
    await writeFile(
      root,
      "messages/auth/signin.yml",
      "description: Sign in\ntranslations:\n  en: Sign in\n",
    );
    await writeFile(
      root,
      "tests/messages/auth/signin.spec.yml",
      [
        "message: auth.signin",
        "assertions:",
        "  - matrix:",
        "      name: [Ada]",
        "      enabled: [true]",
        "    locale: en",
        "    target: web",
        "    description: Hello ${{ name }}",
        "    withFlags:",
        "      new-homepage: ${{ enabled }}",
        "    values:",
        "      name: ${{ name }}",
        "    expectedTranslation: Sign in",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/segments/adult.spec.yml",
      [
        "segment: adult",
        "assertions:",
        "  - matrix:",
        "      shouldMatch: [true]",
        "    segment: adult",
        "    context:",
        "      plan: pro",
        "    expectedToMatch: ${{ shouldMatch }}",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/locales/en.spec.yml",
      [
        "locale: en",
        "assertions:",
        "  - matrix:",
        "      currency: [USD]",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: ${{ currency }}",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/targets/web.spec.yml",
      [
        "target: web",
        "assertions:",
        "  - matrix:",
        "      currency: [USD]",
        "    locale: en",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: ${{ currency }}",
        "",
      ].join("\n"),
    );
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.hasError).toEqual(false);
  });

  it("validates feature and experiment condition operators precisely", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/checkout/banner.yml",
      [
        "description: Checkout banner",
        "translations:",
        "  en: Default",
        "overrides:",
        "  - key: feature",
        "    conditions:",
        "      feature: new-checkout",
        "      operator: equals",
        "      value: true",
        "    translations:",
        "      en: Feature",
        "  - key: experiment",
        "    conditions:",
        "      experiment: checkout-copy",
        "      operator: isEnabled",
        "    translations:",
        "      en: Experiment",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const messages = result.errors.map((error) => error.message);

    expect(messages).toContain(
      'Feature conditions only support operators "isEnabled" and "isDisabled".',
    );
    expect(messages).toContain(
      "Feature conditions must not define `value`; the flag state comes from resolveFlag.",
    );
    expect(messages).toContain('Experiment conditions only support operator "hasVariation".');
    expect(messages).toContain(
      "Experiment conditions must define `value` with the expected variation.",
    );
  });

  it("requires unique override keys", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/dashboard/welcome.yml",
      [
        "description: Dashboard welcome",
        "translations:",
        "  en: Welcome",
        "overrides:",
        "  - key: pro",
        '    conditions: "*"',
        "    translations:",
        "      en: Welcome pro",
        "  - key: pro",
        '    conditions: "*"',
        "    translations:",
        "      en: Welcome again",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors.map((error) => error.message)).toContain(
      'Duplicate override key "pro". Override keys must be unique within a message.',
    );
  });

  it("accepts boolean promotable values on overrides", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/dashboard/welcome.yml",
      [
        "description: Dashboard welcome",
        "translations:",
        "  en: Welcome",
        "overrides:",
        "  - key: pro",
        "    promotable: false",
        '    conditions: "*"',
        "    translations:",
        "      en: Welcome pro",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.hasError).toEqual(false);
  });

  it("rejects non-boolean promotable values on overrides", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/dashboard/welcome.yml",
      [
        "description: Dashboard welcome",
        "translations:",
        "  en: Welcome",
        "overrides:",
        "  - key: pro",
        "    promotable: nope",
        '    conditions: "*"',
        "    translations:",
        "      en: Welcome pro",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(
      result.errors.some(
        (error) =>
          error.path.join(".") === "overrides.0.promotable" &&
          error.message.toLowerCase().includes("boolean"),
      ),
    ).toEqual(true);
  });

  it("rejects override keys containing namespace or export separator characters", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(
      root,
      "messagevisor.config.js",
      'module.exports = { namespaceCharacter: "_", exportOverrideKeySeparator: "#" };\n',
    );
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/dashboard/welcome.yml",
      [
        "description: Dashboard welcome",
        "translations:",
        "  en: Welcome",
        "overrides:",
        "  - key: plan_pro",
        '    conditions: "*"',
        "    translations:",
        "      en: Welcome pro",
        "  - key: plan#enterprise",
        '    conditions: "*"',
        "    translations:",
        "      en: Welcome enterprise",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        'Override key "plan_pro" must not include namespaceCharacter "_".',
        'Override key "plan#enterprise" must not include exportOverrideKeySeparator "#".',
      ]),
    );
  });

  it("accepts ICU styles that exist in inherited locale formats", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "formats:",
        "  number:",
        "    money:",
        "      style: currency",
        "      currency: USD",
        "  date:",
        "    long:",
        "      year: numeric",
        "      month: long",
        "      day: numeric",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "locales/en-US.yml",
      ["description: English (US)", "inheritFormatsFrom: en", ""].join("\n"),
    );
    await writeFile(
      root,
      "messages/billing/summary.yml",
      [
        "description: Billing summary",
        "translations:",
        '  en-US: "Total {amount, number, money} on {createdAt, date, long}"',
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors.filter((error) => error.code === "missing_icu_format_style")).toHaveLength(
      0,
    );
  });

  it("accepts ICU styles declared directly on child locales as full style overrides", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "formats:",
        "  number:",
        "    money:",
        "      style: currency",
        "      currency: USD",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "locales/en-US.yml",
      [
        "description: English (US)",
        "inheritFormatsFrom: en",
        "formats:",
        "  number:",
        "    money:",
        "      currency: EUR",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "messages/billing/summary.yml",
      [
        "description: Billing summary",
        "translations:",
        '  en-US: "Total {amount, number, money}"',
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);

    expect(result.errors.filter((error) => error.code === "missing_icu_format_style")).toHaveLength(
      0,
    );
  });

  it("reports missing ICU styles for the target locale format primitive", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "formats:",
        "  number:",
        "    money:",
        "      style: currency",
        "      currency: USD",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "locales/en-US.yml",
      ["description: English (US)", "inheritFormatsFrom: en", ""].join("\n"),
    );
    await writeFile(
      root,
      "messages/billing/summary.yml",
      [
        "description: Billing summary",
        "translations:",
        '  en-US: "Total {amount, number, money} at {createdAt, time, short}"',
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const styleErrors = result.errors.filter((error) => error.code === "missing_icu_format_style");

    expect(styleErrors).toHaveLength(1);
    expect(styleErrors[0].filePath.endsWith("messages/billing/summary.yml")).toEqual(true);
    expect(styleErrors[0].path).toEqual(["translations", "en-US"]);
    expect(styleErrors[0].message).toEqual(
      'Missing ICU time format style "short" for locale "en-US" in message "billing.summary". Add formats.time.short to locale "en-US" or one of its inheritFormatsFrom ancestors.',
    );
  });

  it("reports missing ICU styles in override translations and allows skeletons by default", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(
      root,
      "locales/en.yml",
      [
        "description: English",
        "formats:",
        "  number:",
        "    money:",
        "      style: currency",
        "      currency: USD",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "messages/billing/discount.yml",
      [
        "description: Billing discount",
        "translations:",
        '  en: "Total {amount, number, ::currency/USD}"',
        "overrides:",
        "  - key: vip",
        '    conditions: "*"',
        "    translations:",
        '      en: "VIP total {amount, number, vipMoney}"',
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const styleErrors = result.errors.filter((error) => error.code === "missing_icu_format_style");

    expect(styleErrors).toHaveLength(1);
    expect(styleErrors[0].path).toEqual(["overrides", 0, "translations", "en"]);
    expect(styleErrors[0].message).toEqual(
      'Missing ICU number format style "vipMoney" for locale "en" in message "billing.discount". Add formats.number.vipMoney to locale "en" or one of its inheritFormatsFrom ancestors.',
    );
  });

  it("reports ICU skeleton styles when they are disabled in project config", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = { icuSkeleton: false };\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/billing/total.yml",
      [
        "description: Billing total",
        "translations:",
        '  en: "Total {amount, number, ::currency/USD}"',
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const skeletonErrors = result.errors.filter(
      (error) => error.code === "icu_skeleton_not_allowed",
    );

    expect(projectConfig.icuSkeleton).toEqual(false);
    expect(skeletonErrors).toHaveLength(1);
    expect(skeletonErrors[0].path).toEqual(["translations", "en"]);
    expect(skeletonErrors[0].message).toEqual(
      'ICU skeleton style "::currency/USD" is not allowed for locale "en" in message "billing.total" because messagevisor.config.js has icuSkeleton set to false. Use a named formats.number preset instead, or enable icuSkeleton.',
    );
  });

  it("reports structurally invalid ICU syntax before datafiles are built", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/cart/count.yml",
      [
        "description: Cart count",
        "translations:",
        '  en: "{count, plural, one {One item} other {# items}"',
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await lintProject(projectConfig, datasource);
    const syntaxErrors = result.errors.filter((error) => error.code === "invalid_icu_syntax");

    expect(syntaxErrors).toHaveLength(1);
    expect(syntaxErrors[0].path).toEqual(["translations", "en"]);
    expect(syntaxErrors[0].message).toContain(
      'Invalid ICU syntax for locale "en" in message "cart.count".',
    );
    expect(syntaxErrors[0].message).toContain("Parser reported:");
  });
});
