import { coerceExampleValuesIsoDates } from "./coerceExampleIsoDates";

describe("coerceExampleValuesIsoDates", function () {
  it("converts ISO 8601 date and datetime strings to Date", function () {
    const out = coerceExampleValuesIsoDates({
      d: "2026-11-26",
      when: "2026-11-26T15:05:00.000Z",
      deadline: "2026-12-24T23:59:00.000Z",
      event: "2026-06-01T14:00:00.000Z",
    });

    expect(out?.d).toBeInstanceOf(Date);
    expect((out?.d as Date).toISOString().slice(0, 10)).toEqual("2026-11-26");
    expect(out?.when).toBeInstanceOf(Date);
    expect((out?.when as Date).toISOString()).toEqual("2026-11-26T15:05:00.000Z");
    expect(out?.deadline).toBeInstanceOf(Date);
    expect(out?.event).toBeInstanceOf(Date);
  });

  it("accepts flexible ISO-like forms without fractional seconds and with space / lowercase", function () {
    const out = coerceExampleValuesIsoDates({
      noMsZ: "2026-07-04T12:30:00Z",
      noMsLowerZ: "2026-07-04T12:30:00z",
      hourMinuteZ: "2026-07-04T12:30Z",
      spaceSep: "2026-07-04 12:30:45",
      offsetNoMs: "2026-07-04T12:30:00+02:00",
      offsetShort: "2026-07-04T12:30:00+02",
      trimmed: "  2026-07-04T00:00:00Z  ",
    });

    expect(out?.noMsZ).toBeInstanceOf(Date);
    expect((out?.noMsZ as Date).toISOString()).toEqual("2026-07-04T12:30:00.000Z");
    expect(out?.noMsLowerZ).toBeInstanceOf(Date);
    expect((out?.noMsLowerZ as Date).toISOString()).toEqual("2026-07-04T12:30:00.000Z");
    expect(out?.hourMinuteZ).toBeInstanceOf(Date);
    expect(out?.spaceSep).toBeInstanceOf(Date);
    expect(out?.offsetNoMs).toBeInstanceOf(Date);
    expect(out?.offsetShort).toBeInstanceOf(Date);
    expect(out?.trimmed).toBeInstanceOf(Date);
    expect((out?.trimmed as Date).toISOString()).toEqual("2026-07-04T00:00:00.000Z");
  });

  it("accepts comma as fractional-second separator", function () {
    const out = coerceExampleValuesIsoDates({
      t: "2026-01-02T03:04:05,678Z",
    });

    expect(out?.t).toBeInstanceOf(Date);
    expect((out?.t as Date).toISOString()).toEqual("2026-01-02T03:04:05.678Z");
  });

  it("does not convert non-ISO strings or numbers", function () {
    const out = coerceExampleValuesIsoDates({
      name: "Ada",
      amount: 10,
      loose: "12/25/2026",
      yearOnly: "2026",
    });

    expect(out?.name).toEqual("Ada");
    expect(out?.amount).toEqual(10);
    expect(out?.loose).toEqual("12/25/2026");
    expect(out?.yearOnly).toEqual("2026");
  });

  it("walks nested objects and arrays", function () {
    const out = coerceExampleValuesIsoDates({
      range: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-02T00:00:00.000Z" },
      slots: ["2026-06-01T10:00:00Z", "plain"],
    });

    expect((out?.range as Record<string, unknown>).start).toBeInstanceOf(Date);
    expect((out?.range as Record<string, unknown>).end).toBeInstanceOf(Date);
    expect((out?.slots as unknown[])[0]).toBeInstanceOf(Date);
    expect((out?.slots as unknown[])[1]).toEqual("plain");
  });

  it("returns undefined for undefined input", function () {
    expect(coerceExampleValuesIsoDates(undefined)).toBeUndefined();
  });
});
