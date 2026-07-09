import type { DatafileContent } from "@messagevisor/types";

import { createMessagevisor } from "./index";
import type { MessagevisorModule } from "./instance";

const interpolationModule: MessagevisorModule = {
  name: "test-interpolation",
  format(payload) {
    if (typeof payload.translation !== "string") {
      return;
    }

    return payload.translation.replace(
      /\{([a-zA-Z0-9_.]+)(?:,\s*(number|date|time|relative),\s*([a-zA-Z0-9_.-]+))?\}/g,
      (match, name, formatter, preset) => {
        const value = payload.values?.[name];

        if (typeof value === "undefined" || value === null) {
          return match;
        }

        if (formatter === "number") {
          const options = preset ? payload.formats.number?.[preset] : undefined;
          return new Intl.NumberFormat(payload.locale, options as Intl.NumberFormatOptions).format(
            value as number,
          );
        }

        if (formatter === "date") {
          const options = preset ? payload.formats.date?.[preset] : undefined;
          return new Intl.DateTimeFormat(
            payload.locale,
            options as Intl.DateTimeFormatOptions,
          ).format(value as any);
        }

        if (formatter === "time") {
          const options = preset ? payload.formats.time?.[preset] : undefined;
          return new Intl.DateTimeFormat(
            payload.locale,
            options as Intl.DateTimeFormatOptions,
          ).format(value as any);
        }

        if (formatter === "relative") {
          const options = preset ? payload.formats.relative?.[preset] : undefined;
          return new Intl.RelativeTimeFormat(
            payload.locale,
            options as Intl.RelativeTimeFormatOptions,
          ).format(value as number, "day");
        }

        return String(value);
      },
    );
  },
};

const enDatafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "en-1",
  target: "web",
  locale: "en-US",
  direction: "ltr",
  formats: {
    number: {
      money: { style: "currency", currency: "USD", currencyDisplay: "symbol" },
      compact: { notation: "compact", compactDisplay: "short" },
      percentage: { style: "percent", maximumFractionDigits: 1 },
    },
    date: {
      short: { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" },
    },
    time: {
      short: { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
    },
    relative: {
      auto: { numeric: "auto" },
    },
  },
  segments: {
    "platform-web": {
      conditions: { attribute: "platform", operator: "equals", value: "web" },
    },
    "platform-mobile": {
      conditions: { attribute: "platform", operator: "in", value: ["ios", "android"] },
    },
    "plan-pro": {
      conditions: JSON.stringify({ attribute: "account.plan", operator: "equals", value: "pro" }),
    },
    "enterprise-eu": {
      conditions: {
        and: [
          { attribute: "account.plan", operator: "equals", value: "enterprise" },
          { attribute: "account.region", operator: "in", value: ["NL", "BE", "DE"] },
        ],
      },
    },
    adult: {
      conditions: { attribute: "age", operator: "greaterThanOrEquals", value: 18 },
    },
    "recent-signup": {
      conditions: { attribute: "signupDate", operator: "after", value: "2026-01-01T00:00:00Z" },
    },
    "beta-enabled": {
      conditions: { feature: "checkout-copy", operator: "isEnabled" },
    },
    "experiment-b": {
      conditions: { experiment: "checkout-banner", operator: "hasVariation", value: "b" },
    },
    "push-capable": {
      conditions: [
        { attribute: "permissions", operator: "includes", value: "push" },
        { attribute: "device.id", operator: "startsWith", value: "ios-" },
      ],
    },
    archived: {
      archived: true,
      conditions: "*",
    },
  },
  messages: {
    "common.welcome": {
      meta: { area: "common", owner: "growth" },
      overrides: [
        {
          key: "enterprise-eu",
          segments: { and: ["platform-web", "enterprise-eu"] },
          translation: "Enterprise review for {name}",
        },
        {
          key: "pro-web",
          segments: ["platform-web", "plan-pro"],
          translation: "Welcome back, pro {name}",
        },
        {
          key: "mobile",
          segments: "platform-mobile",
          translation: "Welcome from the app, {name}",
        },
      ],
    },
    "checkout.banner": {
      overrides: [
        {
          key: "beta-experiment",
          segments: { and: ["beta-enabled", "experiment-b"] },
          translation: "Try the faster checkout",
        },
        {
          key: "recent-adult",
          conditions: {
            and: [
              { attribute: "age", operator: "greaterThanOrEquals", value: 18 },
              { attribute: "signupDate", operator: "after", value: "2026-01-01T00:00:00Z" },
            ],
          },
          translation: "Welcome to checkout",
        },
      ],
    },
    "billing.total": {},
    "billing.usage": {},
    "billing.dueDate": {},
    "billing.startTime": {},
    "support.sla": {},
    "raw.prompt": {},
    "deprecated.old": {
      deprecated: true,
      deprecationWarning: "Use common.welcome instead.",
    },
    "archived.segment": {
      overrides: [
        {
          key: "archived",
          segments: "archived",
          translation: "Archived override",
        },
      ],
    },
    "push.install": {
      overrides: [
        {
          key: "push",
          segments: "push-capable",
          translation: "Enable rich push on {deviceName}",
        },
      ],
    },
    "stringified.group": {
      overrides: [
        {
          key: "stringified",
          segments: JSON.stringify({
            or: [
              { and: ["platform-web", "plan-pro"] },
              { and: ["platform-mobile", "push-capable"] },
            ],
          }),
          translation: "Stringified group matched",
        },
      ],
    },
  },
  translations: {
    "common.welcome": "Welcome, {name}",
    "checkout.banner": "Checkout your way",
    "billing.total": "Total: {amount, number, money}",
    "billing.usage": "Usage: {count, number, compact}",
    "billing.dueDate": "Due {date, date, short}",
    "billing.startTime": "Starts {date, time, short}",
    "support.sla": "Reply {days, relative, auto}",
    "raw.prompt": "{count, plural, one {# file} other {# files}}",
    "deprecated.old": "Old welcome",
    "archived.segment": "Visible fallback",
    "push.install": "Install the app",
    "stringified.group": "Default group",
  },
};

const nlDatafile: DatafileContent = {
  ...enDatafile,
  revision: "nl-1",
  locale: "nl-NL",
  formats: {
    number: {
      money: { style: "currency", currency: "EUR", currencyDisplay: "symbol" },
      compact: { notation: "compact", compactDisplay: "short" },
      percentage: { style: "percent", maximumFractionDigits: 0 },
    },
    date: {
      short: { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" },
    },
    time: {
      short: { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" },
    },
    relative: {
      auto: { numeric: "auto" },
    },
  },
  translations: {
    ...enDatafile.translations,
    "common.welcome": "Welkom, {name}",
    "checkout.banner": "Afrekenen zoals jij wilt",
    "billing.total": "Totaal: {amount, number, money}",
    "billing.usage": "Gebruik: {count, number, compact}",
    "billing.dueDate": "Verschuldigd op {date, date, short}",
    "billing.startTime": "Start om {date, time, short}",
    "support.sla": "Antwoord {days, relative, auto}",
    "deprecated.old": "Oude begroeting",
  },
};

const arDatafile: DatafileContent = {
  ...enDatafile,
  revision: "ar-1",
  locale: "ar-SA",
  direction: "rtl",
  formats: {
    number: {
      money: { style: "currency", currency: "SAR", currencyDisplay: "symbol" },
      compact: { notation: "compact", compactDisplay: "short" },
    },
    date: {
      short: { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" },
    },
    time: {
      short: { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
    },
    relative: {
      auto: { numeric: "auto" },
    },
  },
  translations: {
    ...enDatafile.translations,
    "common.welcome": "مرحبا، {name}",
    "billing.total": "الإجمالي: {amount, number, money}",
  },
};

function createConformanceMessagevisor(options: Record<string, unknown> = {}) {
  const diagnostics: any[] = [];
  const m = createMessagevisor({
    datafile: enDatafile,
    context: {
      platform: "web",
      account: { plan: "free", region: "US" },
      age: 17,
      signupDate: "2025-12-01T00:00:00Z",
      permissions: [],
      device: { id: "web-1" },
    },
    modules: [interpolationModule],
    logLevel: "debug",
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    ...options,
  });

  return { m, diagnostics };
}

describe("SDK conformance scenarios", function () {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(function () {
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(function () {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(function () {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(function () {});
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(function () {});
  });

  afterEach(function () {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  it("keeps raw datafile messages intact when no formatting module is registered", function () {
    const m = createMessagevisor({ datafile: enDatafile, logLevel: "fatal" });

    expect(m.translate("billing.total", { amount: 12 })).toEqual("Total: {amount, number, money}");
    expect(m.translate("raw.prompt", { count: 2 })).toEqual(
      "{count, plural, one {# file} other {# files}}",
    );
    expect(m.formatMessage("Hello {name}", { name: "Ada" })).toEqual("Hello {name}");
  });

  it("applies ordered overrides with instance context, per-call context, and fallback defaults", function () {
    const { m, diagnostics } = createConformanceMessagevisor();

    expect(m.translate("common.welcome", { name: "Ada" })).toEqual("Welcome, Ada");
    expect(
      m.translate("common.welcome", { name: "Ada" }, { context: { account: { plan: "pro" } } }),
    ).toEqual("Welcome back, pro Ada");
    expect(
      m.translate("common.welcome", { name: "Ada" }, { context: { platform: "ios" } }),
    ).toEqual("Welcome from the app, Ada");
    expect(
      m.translate(
        "common.welcome",
        { name: "Ada" },
        {
          context: { account: { plan: "enterprise", region: "NL" } },
        },
      ),
    ).toEqual("Enterprise review for Ada");

    expect(
      diagnostics
        .filter((diagnostic) => diagnostic.code === "message_override_matched")
        .map((diagnostic) => diagnostic.details.overrideKey),
    ).toEqual(["pro-web", "mobile", "enterprise-eu"]);
  });

  it("evaluates complex segment groups, archived segments, and stringified group segments", function () {
    const { m } = createConformanceMessagevisor({
      context: {
        platform: "ios",
        account: { plan: "free", region: "US" },
        age: 21,
        signupDate: "2026-02-01T00:00:00Z",
        permissions: ["push"],
        device: { id: "ios-abc" },
        deviceName: "iPhone",
      },
    });

    expect(m.translate("push.install", { deviceName: "iPhone" })).toEqual(
      "Enable rich push on iPhone",
    );
    expect(m.translate("archived.segment")).toEqual("Visible fallback");
    expect(m.translate("stringified.group")).toEqual("Stringified group matched");
  });

  it("passes merged context to feature and experiment resolvers", function () {
    const resolverContexts: any[] = [];
    const { m } = createConformanceMessagevisor({
      resolveFlag: (featureKey, context) => {
        resolverContexts.push({ type: "flag", featureKey, context });
        return featureKey === "checkout-copy" && context?.platform === "web";
      },
      resolveVariation: (experimentKey, context) => {
        resolverContexts.push({ type: "experiment", experimentKey, context });
        return context?.account && (context.account as any).plan === "pro" ? "b" : "a";
      },
    });

    expect(
      m.translate("checkout.banner", undefined, {
        context: { account: { plan: "pro" }, platform: "web" },
      }),
    ).toEqual("Try the faster checkout");
    expect(resolverContexts).toEqual([
      expect.objectContaining({
        type: "flag",
        featureKey: "checkout-copy",
        context: expect.objectContaining({ platform: "web", account: { plan: "pro" } }),
      }),
      expect.objectContaining({
        type: "experiment",
        experimentKey: "checkout-banner",
        context: expect.objectContaining({ platform: "web", account: { plan: "pro" } }),
      }),
    ]);
  });

  it("uses datafile, default, and per-call formats across locales", function () {
    const { m } = createConformanceMessagevisor({
      defaultFormats: {
        "en-US": {
          number: {
            money: { style: "currency", currency: "GBP", currencyDisplay: "code" },
            fallbackOnly: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
          },
        },
        "nl-NL": {
          number: {
            fallbackOnly: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
          },
        },
      },
    });

    expect(m.translate("billing.total", { amount: 12 })).toEqual("Total: $12.00");
    expect(m.formatNumber(12, "fallbackOnly")).toEqual("12.000");
    expect(
      m.translate(
        "billing.total",
        { amount: 12 },
        {
          formats: {
            number: { money: { style: "currency", currency: "CAD", currencyDisplay: "code" } },
          },
        },
      ),
    ).toEqual("Total: CAD\u00a012.00");

    m.setDatafile(nlDatafile);
    m.setLocale("nl-NL");

    expect(m.translate("billing.total", { amount: 12 })).toEqual("Totaal: \u20ac\u00a012,00");
    expect(m.formatNumber(12, "fallbackOnly")).toEqual("12,0");
  });

  it("switches locale datafiles while preserving locale-specific direction, revision, and formatting", function () {
    const { m } = createConformanceMessagevisor();

    m.setDatafile(nlDatafile);
    m.setDatafile(arDatafile);

    expect(m.getLocale()).toEqual("en-US");
    expect(m.getRevision()).toEqual("en-1");
    expect(m.getDirection()).toEqual("ltr");
    expect(m.translate("billing.total", { amount: 1234.5 })).toEqual("Total: $1,234.50");

    m.setLocale("nl-NL");
    expect(m.getRevision()).toEqual("nl-1");
    expect(m.getDirection()).toEqual("ltr");
    expect(m.translate("billing.total", { amount: 1234.5 })).toEqual(
      "Totaal: \u20ac\u00a01.234,50",
    );

    m.setLocale("ar-SA");
    expect(m.getRevision()).toEqual("ar-1");
    expect(m.getDirection()).toEqual("rtl");
    expect(m.translate("billing.total", { amount: 1234.5 })).toContain("ر.س");
  });

  it("keeps defaultTranslation as the last translation fallback and reports missing translations", function () {
    const { m, diagnostics } = createConformanceMessagevisor({
      defaultTranslations: {
        "en-US": {
          "fallback.only": "Fallback message for {name}",
        },
      },
    });

    expect(m.translate("fallback.only", { name: "Ada" })).toEqual("Fallback message for Ada");
    expect(
      m.translate(
        "missing.with.default",
        { name: "Ada" },
        {
          defaultTranslation: "Default message for {name}",
        },
      ),
    ).toEqual("Default message for Ada");
    expect(m.translate("missing.without.default")).toEqual("missing.without.default");

    expect(
      diagnostics
        .filter((diagnostic) => diagnostic.code === "missing_translation")
        .map((diagnostic) => diagnostic.details.messageKey),
    ).toEqual(["missing.with.default", "missing.without.default"]);
  });

  it("emits deprecated-message diagnostics without changing successful resolution", function () {
    const { m, diagnostics } = createConformanceMessagevisor({ logLevel: "warn" });

    expect(m.translate("deprecated.old")).toEqual("Old welcome");
    expect(m.translate("deprecated.old")).toEqual("Old welcome");
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "deprecated_message",
        details: expect.objectContaining({ messageKey: "deprecated.old" }),
      }),
      expect.objectContaining({
        code: "deprecated_message",
        details: expect.objectContaining({ messageKey: "deprecated.old" }),
      }),
    ]);
  });

  it("passes message metadata and module options through formatting and transform hooks", function () {
    const seenPayloads: any[] = [];
    const module: MessagevisorModule = {
      name: "observer",
      format(payload) {
        seenPayloads.push({ phase: "format", ...payload });
      },
      transform(payload) {
        seenPayloads.push({ phase: "transform", ...payload });
      },
    };
    const m = createMessagevisor({
      datafile: enDatafile,
      modules: [module],
      logLevel: "fatal",
    });

    expect(
      m.translate("common.welcome", undefined, {
        moduleOptions: { observer: { enabled: true } },
      }),
    ).toEqual("Welcome, {name}");
    expect(seenPayloads).toEqual([
      expect.objectContaining({
        phase: "format",
        locale: "en-US",
        source: "translation",
        messageKey: "common.welcome",
        meta: { area: "common", owner: "growth" },
        moduleOptions: { observer: { enabled: true } },
      }),
      expect.objectContaining({
        phase: "transform",
        locale: "en-US",
        source: "translation",
        messageKey: "common.welcome",
        meta: { area: "common", owner: "growth" },
      }),
    ]);
  });
});
