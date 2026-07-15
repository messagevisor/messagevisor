import type { Context, DatafileContent, Segment } from "@messagevisor/types";

import { evaluateCondition, evaluateGroupSegment } from "./conditions";
import { createMessagevisor } from "./index";

const edgeContext: Context = {
  zero: 0,
  falseValue: false,
  emptyString: "",
  nested: {
    zero: {
      value: 0,
    },
    falseValue: {
      value: false,
    },
    emptyString: {
      value: "",
    },
  },
  numericString: "42",
  nonNumericString: "forty-two",
  list: ["alpha", "beta"],
};

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  formats: {},
  segments: {
    "zero-segment": {
      conditions: { attribute: "zero", operator: "equals", value: 0 },
    },
    "false-segment": {
      conditions: { attribute: "falseValue", operator: "equals", value: false },
    },
    "empty-string-segment": {
      conditions: { attribute: "emptyString", operator: "equals", value: "" },
    },
  },
  messages: {
    "empty.translation": {},
    "zero.override": {
      overrides: [
        {
          key: "zero",
          segments: "zero-segment",
          translation: "Zero matched",
        },
      ],
    },
    "false.override": {
      overrides: [
        {
          key: "false",
          segments: "false-segment",
          translation: "False matched",
        },
      ],
    },
    "empty.override": {
      overrides: [
        {
          key: "empty",
          segments: "empty-string-segment",
          translation: "Empty matched",
        },
      ],
    },
    "empty.override.withFallback": {
      overrides: [
        {
          key: "empty",
          segments: "empty-string-segment",
          translation: "",
        },
      ],
    },
    "deprecated.override": {
      deprecated: true,
      deprecationWarning: "Use replacement.override.",
      overrides: [
        {
          key: "zero",
          segments: "zero-segment",
          translation: "Deprecated override",
        },
      ],
    },
  },
  translations: {
    "empty.translation": "",
    "zero.override": "Zero default",
    "false.override": "False default",
    "empty.override": "Empty default",
    "empty.override.withFallback": "Empty override default",
    "deprecated.override": "Deprecated default",
  },
};

describe("condition and evaluation edge cases", function () {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(function () {
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(function () {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(function () {});
  });

  afterEach(function () {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("treats top-level falsy values as valid condition values", function () {
    expect(
      evaluateCondition(
        { attribute: "zero", operator: "equals", value: 0 },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { attribute: "falseValue", operator: "equals", value: false },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { attribute: "emptyString", operator: "equals", value: "" },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition({ attribute: "zero", operator: "exists" }, { context: edgeContext }),
    ).toEqual(true);
    expect(
      evaluateCondition({ attribute: "falseValue", operator: "exists" }, { context: edgeContext }),
    ).toEqual(true);
    expect(
      evaluateCondition({ attribute: "emptyString", operator: "exists" }, { context: edgeContext }),
    ).toEqual(true);
  });

  it("documents nested falsy traversal behavior for future SDK ports", function () {
    expect(
      evaluateCondition(
        { attribute: "nested.zero.value", operator: "equals", value: 0 },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { attribute: "nested.falseValue.value", operator: "equals", value: false },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { attribute: "nested.emptyString.value", operator: "equals", value: "" },
        { context: edgeContext },
      ),
    ).toEqual(true);
  });

  it("requires numeric context values for numeric comparisons", function () {
    expect(
      evaluateCondition(
        { attribute: "numericString", operator: "greaterThan", value: 41 },
        { context: edgeContext },
      ),
    ).toEqual(false);
    expect(
      evaluateCondition(
        { attribute: "numericString", operator: "lessThanOrEquals", value: 42 },
        { context: edgeContext },
      ),
    ).toEqual(false);
    expect(
      evaluateCondition(
        { attribute: "nonNumericString", operator: "greaterThan", value: 1 },
        { context: edgeContext },
      ),
    ).toEqual(false);
  });

  it("evaluates array conditions as all-of and group segment arrays as all-of", function () {
    const segments: Record<string, Segment> = {
      a: { conditions: { attribute: "zero", operator: "equals", value: 0 } },
      b: { conditions: { attribute: "falseValue", operator: "equals", value: false } },
      c: { conditions: { attribute: "emptyString", operator: "equals", value: "not-empty" } },
    };

    expect(
      evaluateCondition(
        [
          { attribute: "zero", operator: "equals", value: 0 },
          { attribute: "falseValue", operator: "equals", value: false },
        ],
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(evaluateGroupSegment(["a", "b"], { context: edgeContext, segments })).toEqual(true);
    expect(evaluateGroupSegment(["a", "c"], { context: edgeContext, segments })).toEqual(false);
  });

  it("returns empty datafile translations as explicit values", function () {
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
    });

    expect(m.translate("empty.translation")).toEqual("");
    expect(
      m.translate("empty.translation", undefined, {
        defaultTranslation: "Default",
      }),
    ).toEqual("");
  });

  it("uses falsy context values when evaluating message overrides", function () {
    const m = createMessagevisor({
      datafile,
      context: {
        zero: 0,
        falseValue: false,
        emptyString: "",
      },
      logLevel: "fatal",
    });

    expect(m.translate("zero.override")).toEqual("Zero matched");
    expect(m.translate("false.override")).toEqual("False matched");
    expect(m.translate("empty.override")).toEqual("Empty matched");
  });

  it("returns empty matching overrides as explicit values", function () {
    const m = createMessagevisor({
      datafile,
      context: { emptyString: "" },
      defaultTranslations: {
        "en-US": {
          "empty.override.withFallback": "Fallback override",
        },
      },
      logLevel: "fatal",
    });

    expect(m.translate("empty.override.withFallback")).toEqual("");
  });

  it("emits deprecated diagnostics when a deprecated message resolves through an override", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      context: { zero: 0 },
      logLevel: "warn",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.translate("deprecated.override")).toEqual("Deprecated override");
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "deprecated_message",
        details: expect.objectContaining({
          messageKey: "deprecated.override",
          deprecationWarning: "Use replacement.override.",
        }),
      }),
    ]);
  });

  it("documents nested traversal through primitive falsy parents", function () {
    expect(
      evaluateCondition(
        { attribute: "zero.value", operator: "notExists" },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { attribute: "falseValue.value", operator: "notExists" },
        { context: edgeContext },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { attribute: "emptyString.value", operator: "notExists" },
        { context: edgeContext },
      ),
    ).toEqual(true);
  });
});
