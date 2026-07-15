import * as fs from "fs";
import * as path from "path";

import type { Condition, Context, DatafileContent } from "@messagevisor/types";

import { evaluateCondition } from "./conditions";
import { createMessagevisor } from "./instance";

interface Fixture {
  conditions: Array<{
    name: string;
    context: Context;
    condition: Condition;
    expected: boolean;
  }>;
  datafiles: {
    invalidDatafileDiagnostic: { code: string; message: string };
  };
  modules: {
    duplicateCode: string;
    setupFailureCode: string;
    closeOrder: "reverse";
  };
}

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../conformance/sdk-v1.json"), "utf8"),
) as Fixture;

describe("portable SDK conformance", function () {
  test.each(fixture.conditions)("$name", function ({ context, condition, expected }) {
    expect(evaluateCondition(condition, { context })).toBe(expected);
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
});
