import * as fs from "fs";
import * as path from "path";
import { createMessagevisor, type MessagevisorDiagnostic } from "@messagevisor/sdk";
import { createICUModule } from "./index";

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../conformance/sdk-v1.json"), "utf8"),
);

function instance(locale = "en-US") {
  const diagnostics: MessagevisorDiagnostic[] = [];
  const m = createMessagevisor({
    locale,
    timeZone: "UTC",
    logLevel: "debug",
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    modules: [createICUModule()],
  });
  return { m, diagnostics };
}

describe("portable ICU semantics", () => {
  test.each(contract.icuSemantics)("canonical ICU case: $id", (row) => {
    const { m, diagnostics } = instance(row.locale);
    if (row.error) {
      expect(() => m.formatMessage(row.message, row.values)).toThrow();
      expect(diagnostics.filter((d) => d.level === "error").map((d) => d.code)).toEqual([
        row.error,
      ]);
    } else {
      expect(m.formatMessage(row.message, row.values)).toBe(row.expected);
      expect(diagnostics.filter((d) => d.level === "error")).toEqual([]);
    }
  });

  test.each(["{d, date}", "{d, time}", "{n, number}", "{missing}"])(
    "does not evaluate an unselected branch containing %s",
    (unused) => {
      const { m, diagnostics } = instance();
      expect(
        m.formatMessage(`{kind, select, selected {Safe} other {${unused}}}`, { kind: "selected" }),
      ).toBe("Safe");
      expect(m.formatMessage(`{n, plural, one {Safe} other {${unused}}}`, { n: 1 })).toBe("Safe");
      expect(diagnostics.some((d) => d.code === "invalid_message")).toBe(false);
    },
  );

  test.each([
    ["'{quoted {d, date}}'", "{quoted {d, date}}"],
    ["'{x, select, yes {Yes} other {No}}'", "{x, select, yes {Yes} other {No}}"],
    ["You don''t have access", "You don't have access"],
    ["You don't have access", "You don't have access"],
  ])("preserves quoted literal semantics: %s", (message, expected) => {
    expect(instance().m.formatMessage(message)).toBe(expected);
  });

  test.each([
    "{x}",
    "{x, number}",
    "{x, date}",
    "{x, time}",
    "{x, select, yes {Yes} other {Other}}",
    "{x, plural, one {One} other {Other}}",
    "{kind, select, yes {{x}} other {Other}}",
  ])("rejects missing values on the evaluated path: %s", (message) => {
    const { m, diagnostics } = instance();
    expect(() => m.formatMessage(message, { kind: "yes" })).toThrow();
    const errors = diagnostics.filter((d) => d.code === "invalid_message");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ level: "error", originalError: { code: "MISSING_VALUE" } });
  });

  test.each([
    ["{n, plural, offset:1 =1 {exact} one {one:#} other {other:#}}", 1, "exact"],
    ["{n, plural, offset:1 =1 {exact} one {one:#} other {other:#}}", 2, "one:1"],
    ["{n, plural, offset:1 =1 {exact} one {one:#} other {other:#}}", 2.5, "other:1.5"],
    ["{n, plural, =1 {exact} other {fraction}}", 1.5, "fraction"],
    ["{n, plural, one {} other {fallback}}", 1, ""],
  ])("selects plural branches before formatting: %s (%s)", (message, n, expected) => {
    expect(instance().m.formatMessage(message, { n })).toBe(expected);
  });

  test.each([
    ["ru", 1.5, "other"],
    ["fr", 1.5, "one"],
    ["cy", 2, "two"],
    ["ru", NaN, "other"],
    ["ru", Infinity, "other"],
  ])("uses plural categories for %s and %s", (locale, n, expected) => {
    const { m } = instance(locale);
    expect(m.formatPlural(n)).toBe(expected);
    expect(m.formatMessage("{n, plural, one {one} two {two} other {other}}", { n })).toBe(expected);
  });

  it("distinguishes selected empty branches from absent branches", () => {
    const { m } = instance();
    expect(m.formatMessage("{x, select, yes {} other {fallback}}", { x: "yes" })).toBe("");
    expect(m.formatMessage("{x, select, yes {} other {fallback}}", { x: "no" })).toBe("fallback");
  });

  test.each([
    ["percent", 0.5, "50%"],
    ["integer", 0.5, "1"],
    ["::currency/USD", 0.5, "$0.50"],
  ])("honours built-in styles and skeletons: %s", (style, n, expected) => {
    expect(instance().m.formatMessage(`{n, number, ${style}}`, { n })).toBe(expected);
  });

  it("preserves date and time fields together in a named ICU preset", () => {
    const { m } = instance();
    const preset = { dateStyle: "short" as const, timeStyle: "short" as const };
    const options = { formats: { date: { combined: preset } } };
    const expected = new Intl.DateTimeFormat("en-US", { ...preset, timeZone: "UTC" }).format(0);
    expect(m.formatMessage("{d, date, combined}", { d: 0 }, options)).toBe(expected);
    expect(m.formatDate(0, preset)).toBe(expected);
    expect(m.formatPlural(1, { minimumFractionDigits: 2 })).toBe("other");
  });
});
