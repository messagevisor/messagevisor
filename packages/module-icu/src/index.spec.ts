import type { DatafileContent } from "@messagevisor/types";
import { createMessagevisor } from "@messagevisor/sdk";

import { createICUModule } from "./index";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  formats: {
    number: {
      money: { style: "currency", currency: "USD", currencyDisplay: "code" },
      moneySymbol: { style: "currency", currency: "USD", currencyDisplay: "symbol" },
      moneyCode: { style: "currency", currency: "USD", currencyDisplay: "code" },
      moneyAccounting: { style: "currency", currency: "USD", currencySign: "accounting" },
      runtimeMoney: { style: "currency", currencyDisplay: "code" },
      decimalFixed: { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 },
      compactShort: { notation: "compact", compactDisplay: "short" },
      unitDistance: { style: "unit", unit: "kilometer", unitDisplay: "short" },
      scientific: { notation: "scientific" },
      noCurrency: { style: "currency", currencyDisplay: "code" } as any,
    },
    date: {
      numeric: { year: "numeric", month: "2-digit", day: "2-digit" },
      weekday: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
      fullStyle: { dateStyle: "full" },
    },
    time: {
      short: { hour: "numeric", minute: "2-digit" },
      seconds: { hour: "numeric", minute: "2-digit", second: "2-digit" },
      event: { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
      fullStyle: { timeStyle: "full", timeZone: "UTC" },
    },
  },
  segments: {
    "platform-web": {
      conditions: [{ attribute: "platform", operator: "equals", value: "web" }],
    },
  },
  messages: {
    greeting: {
      overrides: [
        {
          key: "platform-web",
          segments: "platform-web",
          translation: "Hello web {name}",
        },
      ],
    },
    namedTotal: {},
    skeletonTotal: {},
    fallbackTotal: {},
    symbolTotal: {},
    codeTotal: {},
    accountingTotal: {},
    runtimeTotal: {},
    compactTotal: {},
    compactAudience: {},
    scientificTotal: {},
    distance: {},
    eventTime: {},
    fullDate: {},
    fullTime: {},
    dateFormats: {},
    timeFormats: {},
    richTerms: {},
    richPromo: {
      overrides: [
        {
          key: "promo-web",
          segments: "platform-web",
          translation:
            "Web <strong>{product}</strong> costs <price>{amount, number, money}</price> today.",
        },
      ],
    },
  },
  translations: {
    greeting: "Hello {name}",
    namedTotal: "Total: {amount, number, money}",
    skeletonTotal: "Total: {amount, number, ::currency/GBP}",
    fallbackTotal: "Total: {amount, number, noCurrency}",
    symbolTotal: "Total: {amount, number, moneySymbol}",
    codeTotal: "Total: {amount, number, moneyCode}",
    accountingTotal: "Total: {amount, number, moneyAccounting}",
    runtimeTotal: "Total: {amount, number, runtimeMoney}",
    compactTotal: "Total: {currency}{amount, number, decimalFixed}",
    compactAudience: "Audience: {count, number, compactShort}",
    scientificTotal: "Scientific: {amount, number, scientific}",
    distance: "Distance: {distance, number, unitDistance}",
    eventTime: "Starts at {startsAt, time, event}",
    fullDate: "Full date: {startsAt, date, fullStyle}",
    fullTime: "Full time: {startsAt, time, fullStyle}",
    dateFormats: "Numeric: {startsAt, date, numeric}; weekday: {startsAt, date, weekday}",
    timeFormats: "Short: {startsAt, time, short}; seconds: {startsAt, time, seconds}",
    richTerms: "Read our <link>terms</link> for <strong>{product}</strong>.",
    richPromo: "Default <strong>{product}</strong> costs <price>{amount, number, money}</price>.",
  },
};

describe("@messagevisor/module-icu", function () {
  it("formats ICU interpolations when installed", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createICUModule()],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello Ada");
    expect(m.formatMessage("Hi {name}", { name: "Lin" })).toEqual("Hi Lin");
  });

  it("formats ICU placeholders in per-call default translations for missing keys", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createICUModule()],
    });

    expect(
      m.translate("missing.icu.fallback", { name: "Ada" }, { defaultTranslation: "Hi, {name}" }),
    ).toEqual("Hi, Ada");
  });

  it("supports rich tags and rich output arrays", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createICUModule({ ignoreTags: false })],
    });

    expect(
      m.translate("richTerms", {
        product: "Messagevisor",
        link: (chunks: string[]) => `[${chunks.join("")}]`,
        strong: (chunks: string[]) => chunks.join("").toUpperCase(),
      }),
    ).toEqual("Read our [terms] for MESSAGEVISOR.");

    expect(
      m.formatMessage("Read <link>terms</link>.", {
        link: (chunks) => ({ type: "link", children: chunks }),
      }),
    ).toEqual(["Read ", { type: "link", children: ["terms"] }, "."]);
  });

  it("supports per-call ignoreTags overrides", function () {
    const richEnabled = createMessagevisor({
      datafile,
      modules: [createICUModule({ ignoreTags: false })],
    });
    const richDisabled = createMessagevisor({
      datafile,
      modules: [createICUModule()],
    });

    expect(
      richEnabled.formatMessage(
        "Read <link>terms</link>.",
        {
          link: (chunks) => `[${chunks.join("")}]`,
        },
        {
          moduleOptions: {
            icu: {
              ignoreTags: true,
            },
          },
        },
      ),
    ).toEqual("Read <link>terms</link>.");

    expect(
      richDisabled.formatMessage(
        "Read <link>terms</link>.",
        {
          link: (chunks) => `[${chunks.join("")}]`,
        },
        {
          moduleOptions: {
            icu: {
              ignoreTags: false,
            },
          },
        },
      ),
    ).toEqual("Read [terms].");
  });

  it("honors currency and time zone precedence through resolved formats", function () {
    const startsAt = new Date("2025-01-01T12:00:00Z");
    const m = createMessagevisor({
      datafile,
      currency: "CHF",
      timeZone: "Asia/Tokyo",
      modules: [createICUModule()],
    });

    expect(m.translate("namedTotal", { amount: 12 }, { currency: "EUR" })).toContain("EUR");
    expect(m.translate("namedTotal", { amount: 12 })).toContain("USD");
    expect(m.translate("fallbackTotal", { amount: 12 })).toContain("CHF");
    expect(m.translate("runtimeTotal", { amount: 12 })).toContain("CHF");
    expect(m.translate("eventTime", { startsAt }, { timeZone: "America/New_York" })).toContain(
      "7:00",
    );
    expect(m.translate("eventTime", { startsAt })).toContain("12:00");
    expect(m.translate("skeletonTotal", { amount: 12 })).toContain("£");
  });

  it("supports override-selected translations and named format variants", function () {
    const m = createMessagevisor({
      datafile,
      context: { platform: "web" },
      currency: "EUR",
      modules: [createICUModule({ ignoreTags: false })],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello web Ada");
    expect(m.translate("symbolTotal", { amount: 12 })).toEqual("Total: $12.00");
    expect(m.translate("codeTotal", { amount: 12 })).toEqual("Total: USD 12.00");
    expect(m.translate("accountingTotal", { amount: -12 })).toEqual("Total: ($12.00)");
    expect(m.translate("compactAudience", { count: 1200 })).toContain("1.2K");
    expect(m.translate("scientificTotal", { amount: 1200 })).toContain("1.2E3");
    expect(m.translate("distance", { distance: 5 })).toMatch(/5\s?km/);
    expect(
      m.translate("richPromo", {
        product: "Messagevisor",
        amount: 12,
        strong: (chunks: string[]) => `**${chunks.join("")}**`,
        price: (chunks: string[]) => `<${chunks.join("")}>`,
      }),
    ).toEqual("Web **Messagevisor** costs <USD 12.00> today.");
  });

  it("supports Intl date/time style presets in ICU messages", function () {
    const m = createMessagevisor({
      datafile,
      timeZone: "UTC",
      modules: [createICUModule()],
    });
    const startsAt = new Date("2025-01-01T12:00:00Z");

    expect(m.translate("fullDate", { startsAt })).toContain("Wednesday, January 1, 2025");
    expect(m.translate("fullTime", { startsAt })).toContain("12:00:00 PM");
  });

  it("can be removed by its default name", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createICUModule()],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello Ada");

    m.removeModule("icu");

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
  });
});
