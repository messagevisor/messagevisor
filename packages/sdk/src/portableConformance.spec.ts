import * as fs from "fs";
import * as path from "path";

import type {
  Condition,
  Context,
  DatafileContent,
  GroupSegment,
  Segment,
} from "@messagevisor/types";

import { evaluateCondition, evaluateGroupSegment, evaluateSegment } from "./conditions";
import { createMessagevisor } from "./instance";

interface Fixture {
  conditions: Array<{
    name: string;
    context: Context;
    condition: Condition;
    expected: boolean;
  }>;
  segments: Array<{
    name: string;
    segment?: string;
    group?: GroupSegment;
    context: Context;
    segments: Record<string, Segment>;
    expected: boolean;
  }>;
  translations: Array<{
    name: string;
    message: string;
    context: Context;
    expected: string;
    datafile: DatafileContent;
  }>;
  datafiles: {
    invalidDatafileDiagnostic: { code: string; message: string };
  };
  modules: {
    duplicateCode: string;
    setupFailureCode: string;
    closeOrder: "reverse";
    removalRestoresPreviousResolvers: boolean;
    failedSetupRestoresPreviousResolvers: boolean;
    removalIsIdempotent: boolean;
  };
  diagnostics: {
    detailsAlwaysPresent: boolean;
    missingLocaleDatafileCode: string;
    missingFormatCode: string;
    invalidFormatCode: string;
  };
}

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../conformance/sdk-v1.json"), "utf8"),
) as Fixture;

describe("portable SDK conformance", function () {
  test.each(fixture.conditions)("$name", function ({ context, condition, expected }) {
    expect(evaluateCondition(condition, { context })).toBe(expected);
  });

  test.each(fixture.segments)("$name", function ({ segment, group, context, segments, expected }) {
    const options = { context, segments };
    expect(
      typeof group !== "undefined"
        ? evaluateGroupSegment(group, options)
        : evaluateSegment(segment as string, options),
    ).toBe(expected);
  });

  test.each(fixture.translations)("$name", function ({ message, context, expected, datafile }) {
    expect(createMessagevisor({ datafile, context, logLevel: "fatal" }).translate(message)).toBe(
      expected,
    );
  });

  it("executes the portable datafile storage contract", function () {
    const diagnostics: any[] = [];
    const datafile: DatafileContent = {
      schemaVersion: "1",
      messagevisorVersion: "test",
      revision: "1",
      target: "web",
      locale: "en",
      segments: {},
      messages: { first: {} },
      translations: { first: "First" },
    };
    const m = createMessagevisor({
      datafile,
      logLevel: "error",
      onDiagnostic: (d) => diagnostics.push(d),
    });

    m.setDatafile({
      ...datafile,
      revision: "2",
      target: "mobile",
      messages: { second: {} },
      translations: { second: "Second" },
    });
    expect(m.getDatafile().translations).toEqual({ first: "First", second: "Second" });

    m.setDatafile({ ...datafile, locale: "nl", revision: "nl-1" });
    expect(m.getLocale()).toBe("en");

    m.setDatafile({ ...datafile, revision: "3" }, true);
    expect(m.getDatafile().translations).toEqual({ first: "First" });

    m.setDatafile("{invalid");
    expect(diagnostics[diagnostics.length - 1]).toEqual(
      expect.objectContaining(fixture.datafiles.invalidDatafileDiagnostic),
    );
  });

  it("executes the portable module lifecycle contract", async function () {
    const diagnostics: any[] = [];
    const calls: string[] = [];
    const m = createMessagevisor({ logLevel: "error", onDiagnostic: (d) => diagnostics.push(d) });

    m.addModule({ name: "duplicate" });
    m.addModule({ name: "duplicate" });
    m.addModule({
      name: "broken",
      setup() {
        throw new Error("setup");
      },
      close() {
        calls.push("broken");
      },
    });
    const remove = m.addModule({
      name: "dynamic",
      close() {
        calls.push("dynamic");
      },
    });
    await remove();
    if (fixture.modules.removalIsIdempotent) await remove();
    m.addModule({
      name: "first",
      close() {
        calls.push("first");
      },
    });
    m.addModule({
      name: "last",
      close() {
        calls.push("last");
      },
    });
    await Promise.resolve();
    await m.close();

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([fixture.modules.duplicateCode, fixture.modules.setupFailureCode]),
    );
    expect(calls).toEqual(["broken", "dynamic", "last", "first"]);
  });

  it("restores resolver precedence after removal and failed setup", async function () {
    const datafile: DatafileContent = {
      schemaVersion: "1",
      messagevisorVersion: "test",
      revision: "1",
      target: "web",
      locale: "en",
      segments: {
        enabled: { conditions: { feature: "flag", operator: "isEnabled" } },
      },
      messages: {
        value: {
          overrides: [{ key: "enabled", segments: "enabled", translation: "enabled" }],
        },
      },
      translations: { value: "disabled" },
    };
    const m = createMessagevisor({ datafile, resolveFlag: () => false, logLevel: "fatal" });
    const child = m.spawn();
    const first = m.addModule({
      name: "first-resolver",
      setup(api) {
        api.setFlagResolver(() => true);
      },
    });
    expect(child.translate("value")).toBe("enabled");

    m.addModule({
      name: "failed-resolver",
      setup(api) {
        api.setFlagResolver(() => false);
        throw new Error("setup failed");
      },
    });
    expect(m.translate("value")).toBe("enabled");
    await first();
    expect(m.translate("value")).toBe("disabled");
    expect(child.translate("value")).toBe("disabled");
  });

  it("uses the portable diagnostic envelope and format codes", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      locale: "en",
      logLevel: "debug",
      onDiagnostic: (d) => diagnostics.push(d),
    });
    expect(m.translate("missing")).toBe("missing");
    expect(m.formatNumber(1, "missing")).toBeTruthy();
    expect(() => m.formatNumber(1, { style: "currency", currency: "INVALID" })).toThrow();

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        fixture.diagnostics.missingLocaleDatafileCode,
        fixture.diagnostics.missingFormatCode,
        fixture.diagnostics.invalidFormatCode,
      ]),
    );
    if (fixture.diagnostics.detailsAlwaysPresent) {
      expect(
        diagnostics.every(
          (diagnostic) => diagnostic.details && typeof diagnostic.details === "object",
        ),
      ).toBe(true);
    }
  });
});
