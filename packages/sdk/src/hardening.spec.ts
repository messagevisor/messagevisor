import * as fs from "fs";
import * as path from "path";
import { createMessagevisor, type MessagevisorModule } from "./instance";
import { evaluateCondition, evaluateSegment } from "./conditions";
import type { DatafileContent } from "@messagevisor/types";

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../conformance/sdk-v1.json"), "utf8"),
).hardening;
const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "test",
  revision: "ready",
  target: "web",
  locale: "en-GB",
  segments: {},
  messages: {},
  translations: {},
};
const quiet = { logLevel: "debug" as const, onDiagnostic: () => {} };

describe("portable runtime hardening", () => {
  test.each(contract.dictionaryKeys as string[])(
    "uses only own dictionary entries for %s",
    (key) => {
      const diagnostics: any[] = [];
      const sdk = createMessagevisor({
        datafile,
        ...quiet,
        onDiagnostic: (d) => diagnostics.push(d),
      });
      expect(sdk.translate(key)).toBe(key);
      expect(diagnostics.at(-1).code).toBe("missing_translation");
      expect(() => sdk.getDatafile(key)).toThrow();
      expect(evaluateSegment(key, { segments: {} })).toBe(false);
      expect(evaluateCondition({ attribute: key, operator: "exists" }, { context: {} })).toBe(
        false,
      );
      expect(
        evaluateCondition(
          { attribute: `nested.${key}`, operator: "exists" },
          { context: { nested: {} } },
        ),
      ).toBe(false);
      expect(
        evaluateCondition(
          { attribute: `nested.${key}`, operator: "equals", value: "own" },
          { context: { nested: { [key]: "own" } } },
        ),
      ).toBe(true);
      expect(evaluateSegment(key, { segments: { [key]: { conditions: "*" } } })).toBe(true);
      sdk.setDatafile({
        ...datafile,
        translations: { [key]: "own" },
        messages: { [key]: {} },
        formats: { number: { [key]: { style: "percent" } } },
      });
      expect(sdk.translate(key)).toBe("own");
      expect(sdk.formatNumber(0.5, key)).toBe("50%");
      sdk.setDatafile({ ...datafile, locale: key });
      expect(
        Object.prototype.hasOwnProperty.call(sdk.getSnapshot().datafileRevisionsByLocale, key),
      ).toBe(true);
      const defaults = createMessagevisor({
        locale: key,
        ...quiet,
        defaultTranslations: { [key]: { [key]: "default" } },
        defaultFormats: { [key]: { number: { [key]: { style: "percent" } } } },
      });
      expect(defaults.translate(key)).toBe("default");
      expect(defaults.getDefaultFormats()!.number![key]).toEqual({ style: "percent" });
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    },
  );

  it("ignores inherited context, segment, translation and preset entries", () => {
    const sdk = createMessagevisor({
      ...quiet,
      datafile: {
        ...datafile,
        translations: Object.create({ hidden: "bad" }),
        messages: Object.create({ hidden: { overrides: [{ translation: "bad" }] } }),
      },
    });
    expect(sdk.translate("hidden")).toBe("hidden");
    expect(evaluateSegment("hidden", { segments: Object.create({ hidden: {} }) })).toBe(false);
    expect(
      evaluateCondition(
        { attribute: "nested.hidden", operator: "exists" },
        { context: { nested: Object.create({ hidden: true }) } },
      ),
    ).toBe(false);
    expect(sdk.formatNumber(2, "toString")).toBe("2");
  });

  it("merges families and presets but replaces a conflicting preset atomically", () => {
    const c = contract.formatMerge;
    const sdk = createMessagevisor({ datafile: { ...datafile, formats: c.initial }, ...quiet });
    const child = sdk.spawn();
    sdk.setDatafile({ ...datafile, formats: c.incoming });
    expect(sdk.getDatafile().formats).toEqual(c.expected);
    expect(child.formatNumber(0.5, "money")).toBe("50%");
    sdk.setDatafile({ ...datafile, revision: "next" });
    expect(sdk.getDatafile().formats).toEqual(c.expected);
    sdk.setDatafile(datafile, true);
    expect(sdk.getDatafile().formats).toBeUndefined();
  });

  const validation = contract.datafileValidation;
  const invalid = [
    ...validation.invalidInputs,
    ...validation.invalidFields.map(({ field, value }: any) => ({ ...datafile, [field]: value })),
    ...[...validation.requiredStrings, ...validation.requiredMaps].map((field) =>
      Object.fromEntries(Object.entries(datafile).filter(([key]) => key !== field)),
    ),
  ];
  test.each(invalid.map((input, index) => ({ input, index })))(
    "rejects invalid datafile $index without changing state",
    ({ input }) => {
      const diagnostics: any[] = [];
      const sdk = createMessagevisor({
        datafile,
        ...quiet,
        onDiagnostic: (d) => diagnostics.push(d),
      });
      const errors: any[] = [];
      sdk.on("error", (e) => errors.push(e));
      const snapshot = sdk.getSnapshot();
      const change = jest.fn();
      sdk.subscribe(change);
      expect(() => sdk.setDatafile(input as any)).not.toThrow();
      expect(sdk.getSnapshot()).toEqual(snapshot);
      expect(change).not.toHaveBeenCalled();
      expect(errors).toHaveLength(1);
      expect(diagnostics.at(-1)).toMatchObject({
        code: validation.code,
        message: validation.message,
      });
    },
  );

  it("accepts empty maps, empty non-locale identities and records without prototypes", () => {
    const sdk = createMessagevisor({ ...quiet });
    sdk.setDatafile(
      Object.assign(Object.create(null), datafile, {
        revision: "",
        target: "",
        messagevisorVersion: "",
        translations: Object.create(null),
      }),
    );
    expect(sdk.getLocale()).toBe(datafile.locale);
    expect(sdk.getRevision()).toBe("");
  });

  it("prepares constructor state before setup and reports initialization afterwards", () => {
    const trace: string[] = [];
    const sdk = createMessagevisor({
      datafile,
      ...quiet,
      defaultTranslations: { "en-GB": { ready: "Ready" } },
      modules: [
        {
          setup(api) {
            trace.push(api.getRevision());
            api.onDiagnostic((d) => trace.push(d.code));
          },
        },
      ],
    });
    expect(trace).toEqual([contract.moduleSetup.initialRevision, "sdk_initialized"]);
    expect(sdk.translate("ready")).toBe("Ready");
  });

  test.each(["format", "transform"] as const)(
    "reports one diagnostic and preserves the original %s exception",
    (hook) => {
      const error = new Error("module failed");
      const diagnostics: any[] = [];
      const sdk = createMessagevisor({
        datafile,
        ...quiet,
        onDiagnostic: (d) => diagnostics.push(d),
        modules: [
          {
            name: "broken",
            [hook]: () => {
              throw error;
            },
          } as MessagevisorModule,
        ],
      });
      const events: any[] = [];
      sdk.on("error", (e) => events.push(e));
      expect(() => sdk.formatMessage("message")).toThrow(error);
      expect(events).toHaveLength(contract.errors.errorEventsPerDiagnostic);
      expect(diagnostics.at(-1)).toMatchObject({
        code: contract.moduleSetup[`${hook}FailureCode`],
        originalError: error,
        moduleName: "broken",
        details: { locale: datafile.locale, source: "formatMessage", hook },
      });
    },
  );

  it("reports missing setLocale and invalid formatter values once without masking errors", () => {
    const diagnostics: any[] = [];
    const sdk = createMessagevisor({
      datafile,
      ...quiet,
      onDiagnostic: (d) => diagnostics.push(d),
    });
    const errors: any[] = [];
    sdk.on("error", (e) => errors.push(e));
    const invalidCalls = [
      () => sdk.setLocale("missing"),
      () => sdk.formatDate("invalid"),
      () => sdk.formatDateToParts("invalid"),
      () => sdk.formatTime("invalid"),
      () => sdk.formatTimeToParts("invalid"),
      () => sdk.formatDateTimeRange("invalid", 0),
      () => sdk.formatRelativeTime(Infinity, "day"),
      () => sdk.formatRelativeTime(1, "wrong" as any),
      () => sdk.formatList([1 as any]),
      () => sdk.formatDisplayName("!", { type: "region" }),
    ];
    invalidCalls.forEach((run, index) => {
      let caught: unknown;
      try {
        run();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(errors).toHaveLength(index + 1);
      expect(diagnostics.at(-1).code).toBe(
        index ? contract.errors.invalidFormatterValueCode : contract.errors.missingSetLocaleCode,
      );
      if (index) expect(diagnostics.at(-1).originalError).toBe(caught);
    });
    expect(sdk.getLocale()).toBe(datafile.locale);
  });

  it("prepares rich values from one selected source and retains translation metadata", () => {
    const resolveFlag = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const payloads: any[] = [];
    const sdk = createMessagevisor({
      ...quiet,
      resolveFlag,
      datafile: {
        ...datafile,
        messages: {
          rich: {
            meta: { owner: "test" },
            overrides: [
              {
                key: "flag",
                conditions: { feature: "enabled", operator: "isEnabled" },
                translation: "selected",
              },
            ],
          },
        },
        translations: { rich: "base" },
      },
      modules: [
        {
          format: (payload) => {
            payloads.push(payload);
            return payload.values!.value;
          },
        },
      ],
    });
    const prepare = jest.fn((source: string) => ({ value: source }));
    expect(sdk.translateWithValues("rich", prepare)).toBe("selected");
    expect(resolveFlag).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(payloads[0]).toMatchObject({
      source: "translation",
      messageKey: "rich",
      meta: { owner: "test" },
    });
  });

  it("only prepares the selected direct preset and shares one lazy host zone", () => {
    const unused = jest.fn(() => ({ year: "numeric" }));
    const date = Object.defineProperty({}, "unused", { enumerable: true, get: unused });
    const sdk = createMessagevisor({
      ...quiet,
      locale: "en-GB",
      defaultFormats: { "en-GB": { date, number: { whole: { maximumFractionDigits: 0 } } } },
    });
    sdk.formatNumber(2, "whole");
    sdk.formatNumber(2);
    expect(unused).not.toHaveBeenCalled();
    const native = Intl.DateTimeFormat;
    const spy = jest
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation((...args) => new native(...args));
    try {
      sdk.formatDate(0);
      sdk.spawn().formatDate(0);
      expect(spy.mock.calls.filter((args) => args.length === 0)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps fallback shapes and reports each degraded capability", () => {
    const c = contract.fallbacks;
    const diagnostics: any[] = [];
    const sdk = createMessagevisor({
      ...quiet,
      locale: "en-GB",
      timeZone: "UTC",
      onDiagnostic: (d) => diagnostics.push(d),
    });
    const nativeList = Intl.ListFormat;
    const range = Intl.DateTimeFormat.prototype.formatRange;
    const parts = Intl.ListFormat.prototype.formatToParts;
    try {
      (Intl as any).ListFormat = undefined;
      expect(sdk.formatList(c.listInput)).toBe(c.listInput.join(c.listSeparator));
      expect(sdk.formatListToParts(c.listInput)).toEqual(c.listParts);
      expect(sdk.formatListToParts([])).toEqual([]);
      (Intl as any).ListFormat = nativeList;
      (Intl.ListFormat.prototype as any).formatToParts = undefined;
      const formatted = sdk.formatList(c.listInput);
      expect(sdk.formatListToParts(c.listInput)).toEqual([{ type: "literal", value: formatted }]);
      (Intl.DateTimeFormat.prototype as any).formatRange = undefined;
      expect(sdk.formatDateTimeRange(0, 86400000)).toBe(
        [sdk.formatDate(0), sdk.formatDate(86400000)].join(c.dateRangeSeparator),
      );
      expect(diagnostics.filter((d) => d.code === c.diagnosticCode)).toHaveLength(5);
    } finally {
      (Intl as any).ListFormat = nativeList;
      Intl.ListFormat.prototype.formatToParts = parts;
      Intl.DateTimeFormat.prototype.formatRange = range;
    }
  });
});
