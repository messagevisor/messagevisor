import { extractIcuFormatStyleReferences, getRelevantIcuFormats } from "./relevantIcuFormats";

describe("relevant ICU formats", function () {
  const computedFormats = {
    number: {
      decimal: { maximumFractionDigits: 2 },
      roundingExpand: { maximumFractionDigits: 2, roundingMode: "expand" },
    },
    date: {
      fullStyle: { dateStyle: "full" },
    },
    time: {
      seconds: { hour: "numeric", minute: "2-digit", second: "2-digit" },
    },
  };

  it("finds a named number style in a raw message", function () {
    expect(
      getRelevantIcuFormats("Value: {value, number, roundingExpand}", computedFormats),
    ).toEqual({
      number: {
        roundingExpand: { maximumFractionDigits: 2, roundingMode: "expand" },
      },
    });
  });

  it("can use the original translation from a message-key example", function () {
    expect(getRelevantIcuFormats("Amount: {amount, number, decimal}", computedFormats)).toEqual({
      number: {
        decimal: { maximumFractionDigits: 2 },
      },
    });
  });

  it("includes date and time styles", function () {
    expect(
      getRelevantIcuFormats(
        "When: {when, date, fullStyle} at {when, time, seconds}",
        computedFormats,
      ),
    ).toEqual({
      date: {
        fullStyle: { dateStyle: "full" },
      },
      time: {
        seconds: { hour: "numeric", minute: "2-digit", second: "2-digit" },
      },
    });
  });

  it("deduplicates repeated styles while preserving first-seen type order", function () {
    expect(
      extractIcuFormatStyleReferences(
        "{amount, number, decimal} then {otherAmount, number, decimal}",
      ),
    ).toEqual({
      number: ["decimal"],
    });
  });

  it("finds style references nested in ICU plural and select branches", function () {
    expect(
      getRelevantIcuFormats(
        "{count, plural, one {{amount, number, decimal}} other {{when, date, fullStyle}}}",
        computedFormats,
      ),
    ).toEqual({
      number: {
        decimal: { maximumFractionDigits: 2 },
      },
      date: {
        fullStyle: { dateStyle: "full" },
      },
    });
  });

  it("ignores unknown styles, skeletons, and non-format ICU constructs", function () {
    expect(
      getRelevantIcuFormats(
        "{amount, number, missing} {when, date, ::yyyyMMdd} {status, select, open {Open} other {Other}}",
        computedFormats,
      ),
    ).toBeUndefined();
  });

  it("applies inline example formats as style-level overrides", function () {
    expect(
      getRelevantIcuFormats("{amount, number, decimal}", computedFormats, {
        number: {
          decimal: { maximumFractionDigits: 4 },
        },
      }),
    ).toEqual({
      number: {
        decimal: { maximumFractionDigits: 4 },
      },
    });
  });
});
