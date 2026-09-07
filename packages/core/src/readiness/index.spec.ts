import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { Message } from "@messagevisor/types";
import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { buildDatafile } from "../builder";
import { applyTranslationMutations } from "../translationWorkflow";
import {
  applyTranslationReview,
  previewTranslationReview,
  reviewPlugin,
} from "../translationWorkflow/review";
import { qualityPlugin, reportProjectQuality } from "../quality";
import { readinessPlugin, reportProjectReadiness, reportTranslationReadiness } from "./index";

describe("readiness reports", () => {
  const locales = { en: {}, nl: {}, "nl-BE": { inheritTranslationsFrom: "nl" }, fr: {} };
  const message: Message = applyTranslationMutations(
    { translations: { en: "Hello", nl: "" } },
    [{ locale: "nl", status: "reviewed" }],
    { sourceLocale: "en" },
  );

  it("separates resolution, review, empty copy, missing and stale states", () => {
    const report = reportTranslationReadiness({ hello: message }, locales, {
      sourceLocale: "en",
      localeKeys: ["nl", "nl-BE", "fr"],
      gates: { requireReviewed: true, requireDirect: true },
    });
    expect(report.summary).toMatchObject({
      total: 3,
      direct: 1,
      inherited: 1,
      missing: 1,
      reviewed: 2,
      stale: 0,
    });
    expect(report.failures).toEqual(["missing_translations", "inherited_translations"]);
    const edited = { ...message, translations: { ...message.translations, nl: "Direct edit" } };
    expect(
      reportTranslationReadiness({ hello: edited }, locales, {
        sourceLocale: "en",
        localeKeys: ["nl-BE"],
      }).summary,
    ).toMatchObject({ stale: 1, reviewed: 0 });
  });

  it("supports resolution reporting without sourceLocale but cannot certify review", () => {
    const report = reportTranslationReadiness({ plain: { translations: { nl: "Hoi" } } }, locales, {
      localeKeys: ["nl"],
    });
    expect(report.passed).toBe(true);
    expect(report.entries[0].sourceAvailable).toBe(false);
    expect(
      reportTranslationReadiness({ hello: message }, locales, {
        localeKeys: ["nl"],
        gates: { requireReviewed: true },
      }).failures,
    ).toContain("review_source_unavailable");
  });

  it("includes overrides, skips archived copy and validates gates and locales", () => {
    const report = reportTranslationReadiness(
      {
        hello: {
          ...message,
          overrides: [{ key: "vip", segments: "*", translations: { en: "VIP" } }],
        },
        archived: { archived: true, translations: { en: "Old" } },
      },
      locales,
      { sourceLocale: "en", localeKeys: ["nl"] },
    );
    expect(report.entries).toHaveLength(2);
    expect(report.entries[1]).toMatchObject({ overrideKey: "vip", resolution: "missing" });
    expect(() => reportTranslationReadiness({}, locales, { gates: { maxMissing: -1 } })).toThrow(
      "nonnegative",
    );
    expect(() => reportTranslationReadiness({}, locales, { localeKeys: ["unknown"] })).toThrow(
      "Unknown locale",
    );
  });

  it("omits only the configured source by default and still reports explicitly selected source", () => {
    expect(
      reportTranslationReadiness({ hello: message }, locales, { sourceLocale: "en" }).entries.map(
        (entry) => entry.locale,
      ),
    ).toEqual(["fr", "nl", "nl-BE"]);
    expect(
      reportTranslationReadiness({ hello: message }, locales, {
        sourceLocale: "en",
        localeKeys: ["en"],
      }).entries,
    ).toMatchObject([{ locale: "en", reviewRequired: false }]);
  });

  it.each([NaN, Infinity, -Infinity, -1, 0.5])("rejects nonfinite or invalid gate %s", (limit) => {
    for (const gate of ["maxMissing", "maxStale"])
      expect(() => reportTranslationReadiness({}, locales, { gates: { [gate]: limit } })).toThrow(
        "nonnegative integer",
      );
  });

  it("does not let missing or stale allowances suppress missing source failures", () => {
    const report = reportTranslationReadiness({ hello: { translations: { nl: "Hoi" } } }, locales, {
      sourceLocale: "en",
      gates: { maxMissing: 100, maxStale: 100 },
    });
    expect(report.failures).toContain("missing_source_translation");
  });
});

describe("scoped readiness, quality and review commands", () => {
  let root: string;
  let datasource: Datasource;
  let config: ReturnType<typeof getProjectConfig>;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "messagevisor-workflow-"));
    await fs.writeFile(
      path.join(root, "messagevisor.config.js"),
      'module.exports = { sourceLocale: "en" };\n',
    );
    config = getProjectConfig(root);
    datasource = new Datasource(config, root);
    for (const locale of ["en", "nl", "fr", "ar"])
      await datasource.writeLocale(locale, {
        description: locale,
        ...(locale === "ar" ? { direction: "rtl" } : {}),
      });
    await datasource.writeTarget("web", {
      locales: ["nl"],
      includeMessages: "hello",
      context: { plan: "free" },
    });
    await datasource.writeTarget("empty", { locales: [] });
    await datasource.writeMessage("hello", {
      description: "Hello",
      translations: { en: "Hi {name}", nl: "Hoi {name}", ar: "مرحبا {name}" },
      overrides: [
        {
          key: "pro",
          conditions: { attribute: "plan", operator: "equals", value: "pro" },
          translations: { en: "Pro {name}" },
        },
      ],
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("uses target locale/message scope and removes impossible target overrides", async () => {
    const report = await reportProjectReadiness(config, datasource, { target: "web" });
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({ messageKey: "hello", locale: "nl", target: "web" });
    expect(report.passed).toBe(true);
    expect((await reportProjectReadiness(config, datasource, { target: "empty" })).entries).toEqual(
      [],
    );
    expect(
      (await reportProjectReadiness(config, datasource, { includeMessages: [] })).entries,
    ).toEqual([]);
    await expect(reportProjectReadiness(config, datasource, { locale: "xx" })).rejects.toThrow(
      "Unknown locale",
    );
    const quality = await reportProjectQuality(config, datasource, {
      target: "web",
      pseudo: "accent",
    });
    expect(quality.entries).toHaveLength(1);
    expect(quality.entries[0].pseudo).toContain("{name}");
  });

  it("retains the same contextual override identities as emitted datafiles", async () => {
    await datasource.writeSegment("paid", {
      conditions: { attribute: "plan", operator: "equals", value: "pro" },
    });
    await datasource.writeSegment("unknown", {
      conditions: { attribute: "region", operator: "equals", value: "eu" },
    });
    await datasource.writeTarget("web", {
      locales: ["nl"],
      context: { plan: "free" },
      stringify: false,
    });
    const translations = { en: "Hello", nl: "Hallo" };
    await datasource.writeMessage("hello", {
      translations,
      overrides: [
        { key: "always", segments: "*", translations },
        { key: "excluded", segments: "paid", translations },
        { key: "partial", segments: { or: ["paid", "unknown"] }, translations },
        { key: "negated", segments: { not: ["paid"] }, translations },
        { key: "conjunction", segments: "paid", conditions: "*", translations },
      ],
    });
    const datafile = await buildDatafile(config, datasource, "web", "nl", "test");
    const emitted = datafile.messages.hello.overrides!.map((override) => override.key);
    expect(emitted).toEqual(["always", "partial", "negated"]);
    const report = await reportProjectReadiness(config, datasource, { target: "web" });
    expect(report.entries.flatMap((entry) => entry.overrideKey ?? [])).toEqual(emitted);
    const preview = await previewTranslationReview(config, datasource, { target: "web" });
    expect(preview.entries.flatMap((entry) => entry.overrideKey ?? [])).toEqual(emitted);
  });

  it("previews review hashes, applies atomically and rejects source edits after preview", async () => {
    const preview = await previewTranslationReview(config, datasource, { locale: "nl" });
    expect(preview.entries).toHaveLength(1);
    expect(preview.entries[0].after?.targetHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await datasource.readMessage("hello")).translationStates).toBeUndefined();
    await applyTranslationReview(datasource, preview);
    expect(
      (await reportProjectReadiness(config, datasource, { target: "web", requireReviewed: true }))
        .passed,
    ).toBe(true);
    const next = await previewTranslationReview(config, datasource, {
      locale: "nl",
      status: "draft",
    });
    const current = await datasource.readMessage("hello");
    await datasource.writeMessage("hello", {
      ...current,
      translations: { ...current.translations, en: "Edited source" },
    });
    await expect(applyTranslationReview(datasource, next)).rejects.toThrow("Entity conflict");
    expect((await datasource.readMessage("hello")).translationStates?.nl?.status).toBe("reviewed");
  });

  it("uses the same default source exclusion for project review and readiness", async () => {
    await datasource.writeMessage("hello", { translations: { en: "Hi", nl: "Hoi" } });
    await datasource.writeTarget("both", { locales: ["en", "nl"] });
    await applyTranslationReview(
      datasource,
      await previewTranslationReview(config, datasource, { target: "both" }),
    );
    const report = await reportProjectReadiness(config, datasource, {
      target: "both",
      requireReviewed: true,
    });
    expect(report.passed).toBe(true);
    expect(report.entries.map((entry) => entry.locale)).toEqual(["nl"]);
    expect(
      (await reportProjectReadiness(config, datasource, { target: "both", locale: "en" })).entries,
    ).toMatchObject([{ locale: "en" }]);
  });

  it("reviews only retained override and locale pairs across multiple targets", async () => {
    const message = await datasource.readMessage("hello");
    message.overrides![0].translations.nl = "Pro NL";
    message.overrides![0].translations.ar = "Pro AR";
    await datasource.writeMessage("hello", message);
    await datasource.writeTarget("paid", { locales: ["ar"], context: { plan: "pro" } });
    const preview = await previewTranslationReview(config, datasource, { target: ["web", "paid"] });
    expect(preview.entries.map((entry) => [entry.overrideKey, entry.locale])).toEqual([
      [undefined, "ar"],
      [undefined, "nl"],
      ["pro", "ar"],
    ]);
    await applyTranslationReview(datasource, preview);
    const result = await datasource.readMessage("hello");
    expect(result.overrides![0].translationStates?.nl).toBeUndefined();
    expect(result.overrides![0].translationStates?.ar?.status).toBe("reviewed");
    await expect(
      previewTranslationReview(config, datasource, { target: "web", override: "pro" }),
    ).rejects.toThrow("Unknown selected override");
  });

  it("runs set reports serially and honours a single set selection", async () => {
    const setRoot = path.join(root, "set-project");
    await fs.mkdir(setRoot);
    await fs.writeFile(
      path.join(setRoot, "messagevisor.config.js"),
      'module.exports = { sets: true, sourceLocale: "en" };\n',
    );
    const setConfig = getProjectConfig(setRoot);
    const setDatasource = new Datasource(setConfig, setRoot);
    for (const set of ["dev", "prod"]) {
      const ds = setDatasource.forSet(set);
      await ds.writeLocale("en", { description: "English" });
      await ds.writeMessage("hi", { description: "Hi", translations: { en: "Hi" } });
    }
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await readinessPlugin.handler({
      rootDirectoryPath: setRoot,
      projectConfig: setConfig,
      datasource: setDatasource,
      parsed: { _: [], json: true },
    });
    expect(
      JSON.parse(log.mock.calls.at(-1)![0]).map((report: { set: string }) => report.set),
    ).toEqual(["dev", "prod"]);
    await qualityPlugin.handler({
      rootDirectoryPath: setRoot,
      projectConfig: setConfig,
      datasource: setDatasource,
      parsed: { _: [], set: "dev", pseudo: "accent", json: true },
    });
    expect(JSON.parse(log.mock.calls.at(-1)![0]).set).toBe("dev");
  });

  it("emits usable JSON and returns failing gates and bidi checks to the CLI", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    expect(
      await readinessPlugin.handler({
        rootDirectoryPath: root,
        projectConfig: config,
        datasource,
        parsed: { _: [], target: "web", requireReviewed: true, json: true },
      }),
    ).toBe(false);
    expect(JSON.parse(log.mock.calls.at(-1)![0]).failures).toContain("unreviewed_translations");
    await reviewPlugin.handler({
      rootDirectoryPath: root,
      projectConfig: config,
      datasource,
      parsed: { _: [], locale: "nl", output: "review.json", json: true },
    });
    expect(
      await reviewPlugin.handler({
        rootDirectoryPath: root,
        projectConfig: config,
        datasource,
        parsed: { _: [], input: "review.json", apply: true, json: true },
      }),
    ).toBe(true);
    expect(JSON.parse(log.mock.calls.at(-1)![0]).apply).toBe(true);
    expect(
      await qualityPlugin.handler({
        rootDirectoryPath: root,
        projectConfig: config,
        datasource,
        parsed: { _: [], locale: "ar", bidi: true, json: true },
      }),
    ).toBe(false);
    expect(JSON.parse(log.mock.calls.at(-1)![0]).entries[0].issues[0].code).toBe(
      "bidi_unisolated_argument",
    );
    log.mockClear();
    await qualityPlugin.handler({
      rootDirectoryPath: root,
      projectConfig: config,
      datasource,
      parsed: { _: [], target: "web", pseudo: "accent" },
    });
    expect(log.mock.calls.flat().join("\n")).toContain("hello [nl]");
  });
});
