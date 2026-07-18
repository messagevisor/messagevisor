import type { DatafileContent } from "@messagevisor/types";

import { createMessagevisor } from "./index";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  direction: "ltr",
  formats: {
    number: {
      currencyCode: { style: "currency", currency: "USD", currencyDisplay: "code" },
      runtimeCurrency: { style: "currency", currencyDisplay: "code" },
      precise: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      significant3: { minimumSignificantDigits: 3, maximumSignificantDigits: 3 },
      signAlways: { signDisplay: "always", maximumFractionDigits: 0 },
      percent: { style: "percent", maximumFractionDigits: 1 },
      compactShort: { notation: "compact", compactDisplay: "short" },
      compactLong: { notation: "compact", compactDisplay: "long" },
      unitKilometerLong: { style: "unit", unit: "kilometer", unitDisplay: "long" },
      moneyGbp: { style: "currency", currency: "GBP" },
      moneyJpy: { style: "currency", currency: "JPY" },
    },
    date: {
      utcDate: { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" },
      runtimeDate: { year: "numeric", month: "2-digit", day: "2-digit" },
      long: { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
    },
    time: {
      utcTime: { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" },
      runtimeTime: { hour: "2-digit", minute: "2-digit", hour12: false },
      utc: { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
      zoneShort: { hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" },
      zoneShortGeneric: {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "shortGeneric",
      },
    },
    dateTimeRange: {
      utcRange: {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      },
    },
    relative: {
      longAuto: { numeric: "auto", style: "long" },
      narrowAlways: { numeric: "always", style: "narrow" },
    },
  },
  segments: {},
  messages: {},
  translations: {},
};

describe("Intl formatter helpers", function () {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(function () {
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(function () {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(function () {});
  });

  afterEach(function () {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("reuses internal formatter instances across helper methods and spawned children", function () {
    const NumberFormat = Intl.NumberFormat;
    const numberFormatSpy = jest.spyOn(Intl, "NumberFormat").mockImplementation(function (
      locale,
      options,
    ) {
      return new NumberFormat(locale, options);
    } as typeof Intl.NumberFormat);
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const child = m.spawn();
    const date = new Date("2026-05-12T08:30:00Z");

    expect(m.formatNumber(12, "precise")).toEqual("12.00");
    expect(child.formatNumberToParts(12, "precise").map((part) => part.type)).toContain("integer");
    expect(numberFormatSpy).toHaveBeenCalledTimes(1);

    expect(m.formatDate(date, "utcDate")).toEqual("05/12/2026");
    expect(m.formatTime(date, "utcTime")).toEqual("08:30");
    expect(m.formatDateToParts(date, "utcDate").map((part) => part.type)).toContain("year");
    expect(m.formatTimeToParts(date, "utcTime").map((part) => part.type)).toContain("hour");

    expect(m.formatRelativeTime(-1, "day", "longAuto")).toEqual("yesterday");
    expect(m.formatRelativeTime(3, "day", "narrowAlways")).toContain("3");

    expect(m.formatPlural(1)).toEqual("one");
    expect(m.formatPlural(2)).toEqual("other");
    numberFormatSpy.mockRestore();
  });

  it("partitions formatter caches by locale and resolved options", function () {
    const NumberFormat = Intl.NumberFormat;
    const numberFormatSpy = jest.spyOn(Intl, "NumberFormat").mockImplementation(function (
      locale,
      options,
    ) {
      return new NumberFormat(locale, options);
    } as typeof Intl.NumberFormat);
    const DateTimeFormat = Intl.DateTimeFormat;
    const dateTimeFormatSpy = jest.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      locale,
      options,
    ) {
      return new DateTimeFormat(locale, options);
    } as typeof Intl.DateTimeFormat);
    const m = createMessagevisor({ datafile, logLevel: "fatal" });

    m.formatNumber(12, "precise");
    m.formatNumber(12, "percent");
    expect(numberFormatSpy).toHaveBeenCalledTimes(2);

    m.setDatafile({ ...datafile, locale: "nl-NL", revision: "nl-1" });
    m.setLocale("nl-NL");
    m.formatNumber(12, "precise");
    expect(numberFormatSpy).toHaveBeenCalledTimes(3);

    const beforeDateFormats = dateTimeFormatSpy.mock.calls.length;
    m.formatDate("2026-05-12T00:00:00Z", "runtimeDate", { timeZone: "UTC" });
    const afterUtcFormat = dateTimeFormatSpy.mock.calls.length;
    expect(afterUtcFormat).toBeGreaterThan(beforeDateFormats);
    m.formatDate("2026-05-12T00:00:00Z", "runtimeDate", { timeZone: "UTC" });
    expect(dateTimeFormatSpy).toHaveBeenCalledTimes(afterUtcFormat);
    m.formatDate("2026-05-12T00:00:00Z", "runtimeDate", { timeZone: "Asia/Tokyo" });
    expect(dateTimeFormatSpy.mock.calls.length).toBeGreaterThan(afterUtcFormat);

    numberFormatSpy.mockRestore();
    dateTimeFormatSpy.mockRestore();
  });

  it("falls back to default Intl options for unknown presets", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });

    expect(m.formatNumber(1200, "missing")).toEqual("1,200");
    expect(m.formatNumberToParts(1200, "missing").map((part) => part.type)).toContain("integer");
    expect(m.formatDate("2026-05-12T00:00:00Z", "missing", { timeZone: "UTC" })).toEqual(
      "5/12/2026",
    );
    expect(m.formatTime("2026-05-12T08:30:00Z", "missing", { timeZone: "UTC" })).toEqual(
      "5/12/2026",
    );
    expect(m.formatRelativeTime(-1, "day", "missing")).toEqual("1 day ago");
  });

  it("supports locale-keyed default formats before any datafile is loaded", function () {
    const m = createMessagevisor({
      locale: "nl-NL",
      currency: "EUR",
      timeZone: "UTC",
      defaultFormats: {
        "nl-NL": {
          number: {
            money: { style: "currency", currencyDisplay: "symbol" },
          },
          date: {
            short: { year: "numeric", month: "2-digit", day: "2-digit" },
          },
          time: {
            short: { hour: "2-digit", minute: "2-digit", hour12: false },
          },
        },
      },
      logLevel: "fatal",
    });

    expect(m.formatNumber(12, "money")).toEqual("\u20ac\u00a012,00");
    expect(m.formatDate("2026-05-12T00:00:00Z", "short")).toEqual("12-05-2026");
    expect(m.formatTime("2026-05-12T08:30:00Z", "short")).toEqual("08:30");
  });

  it("applies currency precedence consistently across number helpers", function () {
    const m = createMessagevisor({ datafile, currency: "GBP", logLevel: "fatal" });

    expect(m.formatNumber(12, "currencyCode")).toContain("USD");
    expect(m.formatNumberToParts(12, "currencyCode").some((part) => part.value === "USD")).toEqual(
      true,
    );
    expect(m.formatNumber(12, "runtimeCurrency")).toContain("GBP");
    expect(m.formatNumber(12, "runtimeCurrency", { currency: "EUR" })).toContain("EUR");
    expect(m.formatNumber(12, "runtimeCurrency")).toContain("GBP");
    expect(m.formatNumber(12, "runtimeCurrency", { currency: "JPY" })).toContain("JPY");
  });

  it("applies time zone precedence consistently across date and time helpers", function () {
    const m = createMessagevisor({ datafile, timeZone: "Asia/Tokyo", logLevel: "fatal" });
    const value = "2026-05-12T23:30:00Z";

    expect(m.formatDate(value, "utcDate")).toEqual("05/12/2026");
    expect(m.formatDate(value, "runtimeDate")).toEqual("05/13/2026");
    expect(m.formatDate(value, "runtimeDate", { timeZone: "America/New_York" })).toEqual(
      "05/12/2026",
    );
    expect(m.formatTime(value, "utcTime")).toEqual("23:30");
    expect(m.formatTime(value, "runtimeTime")).toEqual("08:30");
    expect(m.formatTime(value, "runtimeTime", { timeZone: "America/New_York" })).toEqual("19:30");
  });

  it("formats range, list, list parts, display names, and plural categories", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const start = "2026-05-12T08:00:00Z";
    const end = "2026-05-12T09:30:00Z";

    expect(m.formatDateTimeRange(start, end, "utcRange")).toContain("May 12, 2026");
    expect(m.formatList(["A", "B", "C"], { type: "conjunction" })).toEqual("A, B, and C");
    expect(
      m.formatListToParts(["A", "B"], { type: "conjunction" }).map((part: any) => part.type),
    ).toContain("element");
    expect(m.formatDisplayName("NL", { type: "region" })).toEqual("Netherlands");
    expect(m.formatPlural(1, { type: "ordinal" })).toEqual("one");
    expect(m.formatPlural(2, { type: "ordinal" })).toEqual("two");
  });

  it("keeps the portable formatter contract stable across direct helpers", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const when = "2026-05-12T08:30:45.678Z";

    expect(m.formatNumber(1234567.891)).toEqual("1,234,567.891");
    expect(m.formatNumber(12, "precise")).toEqual("12.00");
    expect(m.formatNumber(12345.678, "significant3")).toEqual("12,300");
    expect(m.formatNumber(5, "signAlways")).toEqual("+5");
    expect(m.formatNumber(12500, "compactShort")).toEqual("13K");
    expect(m.formatNumber(12500, "compactLong")).toEqual("13 thousand");
    expect(m.formatNumber(42, "unitKilometerLong")).toEqual("42 kilometers");
    expect(m.formatNumber(99.5, "moneyGbp")).toEqual("\u00a399.50");
    expect(m.formatNumber(1999.99, "moneyJpy")).toEqual("\u00a52,000");
    expect(m.formatNumber(0.0575, "percent")).toEqual("5.8%");
    expect(m.formatDate(when, "utcDate")).toEqual("05/12/2026");
    expect(m.formatDate(when, "long")).toEqual("May 12, 2026");
    expect(m.formatTime(when, "utc")).toEqual("8:30 AM");
    expect(m.formatTime(when, "zoneShort")).toEqual("8:30 AM UTC");
    expect(m.formatTime(when, "zoneShortGeneric")).toEqual("4:30 AM ET");
    expect(m.formatList(["A", "B", "C"], { type: "conjunction" })).toEqual("A, B, and C");
    expect(m.formatDisplayName("NL", { type: "region" })).toEqual("Netherlands");
    expect(m.formatRelativeTime(-2, "day", "longAuto")).toEqual("2 days ago");
  });

  it("uses Intl for non-Latin locale formatter output", function () {
    const m = createMessagevisor({
      datafile: { ...datafile, locale: "bn-BD" },
      timeZone: "UTC",
      logLevel: "fatal",
    });
    const when = "2026-05-12T08:30:45.678Z";

    expect(m.formatNumber(1234567.891)).toEqual("১২,৩৪,৫৬৭.৮৯১");
    expect(m.formatNumber(12500, "compactShort")).toEqual("১৩\u00a0হা");
    expect(m.formatNumber(42, "unitKilometerLong")).toEqual("৪২ কিলোমিটার");
    expect(m.formatDate(when, "utcDate")).toEqual("১২/০৫/২০২৬");
    expect(m.formatTime(when, "zoneShort")).toEqual("৮:৩০ AM UTC");
  });

  it("falls back and reports diagnostics when optional Intl helpers are unavailable", function () {
    const originalListFormat = (Intl as any).ListFormat;
    const originalDisplayNames = (Intl as any).DisplayNames;
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "warn",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    try {
      (Intl as any).ListFormat = undefined;
      (Intl as any).DisplayNames = undefined;

      expect(m.formatList(["A", "B"])).toEqual("A, B");
      expect(m.formatListToParts(["A", "B"])).toEqual(["A", "B"]);
      expect(m.formatDisplayName("NL", { type: "region" })).toEqual("NL");
      expect(m.formatDisplayName("NL", { type: "region", fallback: "none" })).toEqual(undefined);
    } finally {
      (Intl as any).ListFormat = originalListFormat;
      (Intl as any).DisplayNames = originalDisplayNames;
    }

    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "unsupported_formatter", level: "warn" }),
      expect.objectContaining({ code: "unsupported_formatter", level: "warn" }),
      expect.objectContaining({ code: "unsupported_formatter", level: "warn" }),
      expect.objectContaining({ code: "unsupported_formatter", level: "warn" }),
    ]);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("uses console warnings for unsupported optional Intl helpers when no diagnostic handler exists", function () {
    const originalDisplayNames = (Intl as any).DisplayNames;
    const m = createMessagevisor({ datafile, logLevel: "warn" });

    try {
      (Intl as any).DisplayNames = undefined;
      consoleWarnSpy.mockClear();

      expect(m.formatDisplayName("NL", { type: "region" })).toEqual("NL");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Messagevisor]",
        "Intl.DisplayNames is not available in this environment.",
        expect.objectContaining({
          code: "unsupported_formatter",
          level: "warn",
          details: { locale: "en-US" },
        }),
      );
    } finally {
      (Intl as any).DisplayNames = originalDisplayNames;
    }
  });
});
