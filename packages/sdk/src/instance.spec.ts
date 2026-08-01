import type { DatafileContent } from "@messagevisor/types";

import { createMessagevisor } from "./index";

type RichNode = { type: string; children: Array<string | RichNode> };

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  direction: "ltr",
  formats: {
    number: {
      money: { style: "currency", currency: "USD", currencyDisplay: "code" },
      moneySymbol: { style: "currency", currency: "USD", currencyDisplay: "symbol" },
      moneyCode: { style: "currency", currency: "USD", currencyDisplay: "code" },
      moneyAccounting: { style: "currency", currency: "USD", currencySign: "accounting" },
      runtimeMoney: { style: "currency", currencyDisplay: "code" },
      decimalFixed: { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 },
      compactShort: { notation: "compact", compactDisplay: "short" },
      compactLong: { notation: "compact", compactDisplay: "long" },
      unitDistance: { style: "unit", unit: "kilometer", unitDisplay: "short" },
      signAlways: { signDisplay: "always", maximumFractionDigits: 0 },
      roundingStrip: {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        trailingZeroDisplay: "stripIfInteger",
      },
      engineering: { notation: "engineering" },
      scientific: { notation: "scientific" },
      noCurrency: { style: "currency", currencyDisplay: "code" } as any,
    },
    date: {
      short: { year: "2-digit", month: "numeric", day: "numeric" },
      numeric: { year: "numeric", month: "2-digit", day: "2-digit" },
      weekday: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
      fullStyle: { dateStyle: "full" },
      arabicNumeric: { year: "numeric", month: "2-digit", day: "2-digit", numberingSystem: "arab" },
    },
    time: {
      short: { hour: "numeric", minute: "2-digit" },
      seconds: { hour: "numeric", minute: "2-digit", second: "2-digit" },
      event: {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      },
      fullStyle: { timeStyle: "full", timeZone: "UTC" },
      period: { hour: "numeric", dayPeriod: "long", hour12: true, timeZone: "UTC" },
    },
    relative: {
      short: { numeric: "auto", style: "short" },
    },
    dateTimeRange: {
      event: {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
      fullStyle: {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "UTC",
      },
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
    total: {},
    namedTotal: {},
    skeletonTotal: {},
    fallbackTotal: {},
    symbolTotal: {},
    codeTotal: {},
    accountingTotal: {},
    compactTotal: {},
    eventTime: {},
    dateFormats: {},
    timeFormats: {},
    featureGate: {
      overrides: [
        {
          key: "feature-new-checkout",
          conditions: { feature: "new-checkout", operator: "isEnabled" } as any,
          translation: "Feature enabled",
        },
      ],
    },
    experimentGate: {
      overrides: [
        {
          key: "experiment-checkout-b",
          conditions: { experiment: "checkout-copy", operator: "hasVariation", value: "b" } as any,
          translation: "Experiment B",
        },
      ],
    },
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
    total: "Total: {amount, number, ::currency/USD}",
    namedTotal: "Total: {amount, number, money}",
    skeletonTotal: "Total: {amount, number, ::currency/GBP}",
    fallbackTotal: "Total: {amount, number, noCurrency}",
    symbolTotal: "Total: {amount, number, moneySymbol}",
    codeTotal: "Total: {amount, number, moneyCode}",
    accountingTotal: "Total: {amount, number, moneyAccounting}",
    compactTotal: "Total: {currency}{amount, number, decimalFixed}",
    eventTime: "Starts at {startsAt, time, event}",
    dateFormats: "Numeric: {startsAt, date, numeric}; weekday: {startsAt, date, weekday}",
    timeFormats: "Short: {startsAt, time, short}; seconds: {startsAt, time, seconds}",
    featureGate: "Feature disabled",
    experimentGate: "Experiment default",
    richTerms: "Read our <link>terms</link> for <strong>{product}</strong>.",
    richPromo: "Default <strong>{product}</strong> costs <price>{amount, number, money}</price>.",
  },
};

describe("createMessagevisor", function () {
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

  it("can be created without options and loaded with a datafile later", function () {
    const m = createMessagevisor();

    expect(m.getLocale()).toEqual(null);
    expect(() => m.getDatafile()).toThrow("Datafile not found: no locale is set");

    m.setDatafile(datafile);
    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
  });

  it("reports missing locale before a datafile or locale is available", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      logLevel: "error",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(() => m.translate("greeting")).toThrow("Locale not set");
    expect(() => m.formatNumber(12)).toThrow("Locale not set");

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_locale",
          message: "Locale not set",
          details: { locale: null },
        }),
      ]),
    );

    m.setDatafile(datafile);

    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(m.formatNumber(12, "decimalFixed")).toEqual("12.00");
  });

  it("uses per-call locale without mutating the active instance locale", function () {
    const diagnostics: any[] = [];
    const localeEvents: any[] = [];
    const changeEvents: any[] = [];
    const formatPayloads: any[] = [];
    const transformPayloads: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "debug",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      modules: [
        {
          name: "capture",
          format: (payload) => {
            formatPayloads.push(payload);
          },
          transform: (payload) => {
            transformPayloads.push(payload);
          },
        },
      ],
    });

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      messages: {
        greeting: {
          meta: { locale: "nl-NL" },
          deprecated: true,
          deprecationWarning: "Use greeting.new",
          overrides: [
            {
              key: "platform-web",
              segments: "platform-web",
              translation: "Hallo web {name}",
            },
          ],
        },
      },
      translations: {
        greeting: "Hallo {name}",
      },
    });
    m.on("locale_set", (event) => localeEvents.push(event));
    m.on("change", (event) => changeEvents.push(event));

    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("greeting", { name: "Ada" }, { locale: "nl-NL" })).toEqual("Hallo {name}");
    expect(
      m.translate("greeting", { name: "Ada" }, { locale: "nl-NL", context: { platform: "web" } }),
    ).toEqual("Hallo web {name}");
    expect(m.formatMessage("Los bericht", {}, { locale: "nl-NL" })).toEqual("Los bericht");
    expect(m.getRawTranslation("greeting", { locale: "nl-NL" })).toEqual("Hallo {name}");
    expect(m.translate("missing.key", undefined, { locale: "nl-NL" })).toEqual("missing.key");

    expect(m.getLocale()).toEqual("en-US");
    expect(m.getSnapshot().locale).toEqual("en-US");
    expect(localeEvents).toEqual([]);
    expect(changeEvents).toEqual([]);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "message_override_matched" && diagnostic.details.locale === "nl-NL",
      ),
    ).toEqual(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "missing_translation" && diagnostic.details.locale === "nl-NL",
      ),
    ).toEqual(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "deprecated_message" &&
          diagnostic.details.locale === "nl-NL" &&
          diagnostic.details.messageKey === "greeting",
      ),
    ).toEqual(true);
    expect(formatPayloads.some((payload) => payload.locale === "nl-NL")).toEqual(true);
    expect(
      formatPayloads.some(
        (payload) => payload.locale === "nl-NL" && payload.meta?.locale === "nl-NL",
      ),
    ).toEqual(true);
    expect(transformPayloads.some((payload) => payload.locale === "nl-NL")).toEqual(true);
  });

  it("uses per-call locale for defaults and direct formatters before datafiles arrive", function () {
    const m = createMessagevisor({
      locale: "en-US",
      defaultTranslations: {
        "nl-NL": {
          greeting: "Hallo uit defaults",
        },
      },
      defaultFormats: {
        "en-US": {
          number: {
            short: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
          },
        },
        "nl-NL": {
          number: {
            short: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
          },
          date: {
            short: { year: "numeric", month: "long", day: "numeric" },
          },
          time: {
            short: { hour: "2-digit", minute: "2-digit", hour12: false },
          },
          relative: {
            auto: { numeric: "auto", style: "long" },
          },
        },
      },
      logLevel: "fatal",
    });

    expect(m.translate("greeting", undefined, { locale: "nl-NL" })).toEqual("Hallo uit defaults");
    expect(m.formatNumber(1200, "short")).toEqual("1,200.0");
    expect(m.formatNumber(1200, "short", { locale: "nl-NL" })).toEqual("1.200,0");
    expect(m.formatDate("2026-05-12T08:30:00Z", "short", { locale: "nl-NL" })).toEqual(
      "12 mei 2026",
    );
    expect(
      m.formatTime("2026-05-12T08:30:00Z", "short", { locale: "nl-NL", timeZone: "UTC" }),
    ).toEqual("08:30");
    expect(m.formatRelativeTime(-1, "day", "auto", { locale: "nl-NL" })).toEqual("gisteren");
    expect(m.formatPlural(0, { locale: "ar" })).toEqual("zero");
    expect(m.formatList(["A", "B"], { locale: "nl-NL" })).toContain(" en ");
    expect(m.formatDisplayName("NL", { locale: "nl-NL", type: "region" })).toEqual("Nederland");
    expect(m.getLocale()).toEqual("en-US");
  });

  it("logs SDK initialization by default and supports log overrides", function () {
    consoleInfoSpy.mockClear();
    createMessagevisor();

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[Messagevisor]",
      "SDK initialized",
      expect.objectContaining({ code: "sdk_initialized", level: "info" }),
    );

    consoleInfoSpy.mockClear();
    createMessagevisor({ logLevel: "fatal" });
    expect(consoleInfoSpy).not.toHaveBeenCalled();

    const diagnostics: any[] = [];
    createMessagevisor({
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "sdk_initialized",
        level: "info",
        message: "SDK initialized",
      }),
    ]);
    expect(consoleInfoSpy).not.toHaveBeenCalled();
  });

  it("prints unhandled diagnostics with the Messagevisor prefix", function () {
    const m = createMessagevisor({ datafile });

    consoleErrorSpy.mockClear();
    m.getRawTranslation("missing.message");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[Messagevisor]",
      "Missing translation",
      expect.objectContaining({
        code: "missing_translation",
        level: "error",
        details: {
          locale: "en-US",
          messageKey: "missing.message",
          source: "translation",
        },
      }),
    );

    const handledDiagnostics: any[] = [];
    const handled = createMessagevisor({
      datafile,
      onDiagnostic: (diagnostic) => handledDiagnostics.push(diagnostic),
    });

    consoleErrorSpy.mockClear();
    handled.getRawTranslation("missing.message");

    expect(handledDiagnostics).toEqual([
      expect.objectContaining({ code: "sdk_initialized", level: "info" }),
      expect.objectContaining({
        code: "missing_translation",
        level: "error",
        message: "Missing translation",
        details: {
          locale: "en-US",
          messageKey: "missing.message",
          source: "translation",
        },
      }),
    ]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("prints unhandled warnings with the Messagevisor prefix", function () {
    const originalListFormat = (Intl as any).ListFormat;
    const m = createMessagevisor({ datafile });

    try {
      (Intl as any).ListFormat = undefined;
      consoleWarnSpy.mockClear();

      expect(m.formatList(["A", "B"])).toEqual("A, B");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Messagevisor]",
        "Intl.ListFormat is not available in this environment.",
        expect.objectContaining({ code: "unsupported_formatter", level: "warn" }),
      );

      const handledWarnings: any[] = [];
      const handled = createMessagevisor({
        datafile,
        onDiagnostic: (diagnostic) => handledWarnings.push(diagnostic),
      });

      consoleWarnSpy.mockClear();
      handled.formatList(["A", "B"]);

      expect(handledWarnings).toEqual([
        expect.objectContaining({ code: "sdk_initialized", level: "info" }),
        expect.objectContaining({ code: "unsupported_formatter", level: "warn" }),
      ]);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    } finally {
      (Intl as any).ListFormat = originalListFormat;
    }
  });

  it("emits warning diagnostics when deprecated messages are evaluated", function () {
    const deprecatedDatafile: DatafileContent = {
      ...datafile,
      messages: {
        ...datafile.messages,
        greeting: {
          ...datafile.messages.greeting,
          deprecated: true,
          deprecationWarning: "Use welcome.title instead.",
        },
      },
    };
    const m = createMessagevisor({ datafile: deprecatedDatafile });

    consoleWarnSpy.mockClear();
    expect(m.getRawTranslation("greeting")).toEqual("Hello {name}");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[Messagevisor]",
      "Deprecated message evaluated",
      expect.objectContaining({
        code: "deprecated_message",
        level: "warn",
        message: "Deprecated message evaluated",
        details: {
          locale: "en-US",
          messageKey: "greeting",
          deprecationWarning: "Use welcome.title instead.",
          source: "translation",
        },
      }),
    );

    const diagnostics: any[] = [];
    const handled = createMessagevisor({
      datafile: deprecatedDatafile,
      logLevel: "warn",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    consoleWarnSpy.mockClear();
    expect(handled.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "deprecated_message",
        level: "warn",
        message: "Deprecated message evaluated",
        details: {
          locale: "en-US",
          messageKey: "greeting",
          deprecationWarning: "Use welcome.title instead.",
          source: "translation",
        },
      }),
    ]);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("filters diagnostics by log level", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "warn",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(diagnostics).toEqual([]);

    m.getRawTranslation("missing.message");

    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "missing_translation", level: "error" }),
    ]);

    const quietDiagnostics: any[] = [];
    const quiet = createMessagevisor({
      datafile,
      logLevel: "fatal",
      onDiagnostic: (diagnostic) => quietDiagnostics.push(diagnostic),
    });

    quiet.getRawTranslation("missing.message");
    expect(quietDiagnostics).toEqual([]);
  });

  it("normalizes diagnostic details and supports changing the log level at runtime", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    m.getRawTranslation("missing.before");
    expect(diagnostics).toEqual([]);

    m.setLogLevel("error");
    m.getRawTranslation("missing.after");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        level: "error",
        code: "missing_translation",
        details: {
          locale: "en-US",
          messageKey: "missing.after",
          source: "translation",
        },
      }),
    ]);
  });

  it("lets modules subscribe to diagnostics with their own log level", function () {
    const moduleDiagnostics: any[] = [];
    const rootDiagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      onDiagnostic: (diagnostic) => rootDiagnostics.push(diagnostic),
      modules: [
        {
          name: "observer",
          setup({ onDiagnostic }) {
            onDiagnostic((diagnostic) => moduleDiagnostics.push(diagnostic), {
              logLevel: "error",
            });
          },
        },
      ],
    });

    m.getRawTranslation("missing.message");

    expect(rootDiagnostics).toEqual([]);
    expect(moduleDiagnostics).toEqual([
      expect.objectContaining({
        code: "missing_translation",
        level: "error",
        details: expect.objectContaining({ messageKey: "missing.message" }),
      }),
    ]);
  });

  it("lets modules read datafile revisions from the setup API", function () {
    const revisions: string[] = [];
    const m = createMessagevisor({ datafile });

    m.addModule({
      name: "revision-observer",
      setup({ getRevision }) {
        revisions.push(getRevision());
        revisions.push(getRevision("en-US"));
      },
    });

    expect(revisions).toEqual(["1", "1"]);
  });

  it("lets modules emit custom diagnostics without receiving their own events", function () {
    const observerDiagnostics: any[] = [];
    const emitterDiagnostics: any[] = [];
    const rootDiagnostics: any[] = [];

    createMessagevisor({
      onDiagnostic: (diagnostic) => rootDiagnostics.push(diagnostic),
      modules: [
        {
          name: "observer",
          setup({ onDiagnostic }) {
            onDiagnostic((diagnostic) => observerDiagnostics.push(diagnostic), {
              logLevel: "debug",
            });
          },
        },
        {
          name: "datadog",
          setup({ onDiagnostic, reportDiagnostic }) {
            onDiagnostic((diagnostic) => emitterDiagnostics.push(diagnostic), {
              logLevel: "debug",
            });
            reportDiagnostic({
              level: "warn",
              code: "datadog_transport_failed",
              message: "Datadog transport failed",
            });
          },
        },
      ],
    });

    expect(observerDiagnostics).toEqual([
      expect.objectContaining({
        level: "warn",
        code: "datadog_transport_failed",
        module: "datadog",
      }),
      expect.objectContaining({ code: "sdk_initialized", level: "info" }),
    ]);
    expect(emitterDiagnostics).toEqual([
      expect.objectContaining({ code: "sdk_initialized", level: "info" }),
    ]);
    expect(rootDiagnostics).toEqual([
      expect.objectContaining({
        level: "warn",
        code: "datadog_transport_failed",
        module: "datadog",
      }),
      expect.objectContaining({ code: "sdk_initialized", level: "info" }),
    ]);
  });

  it("clears module diagnostic subscriptions when modules are removed", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        {
          name: "observer",
          setup({ onDiagnostic }) {
            onDiagnostic((diagnostic) => diagnostics.push(diagnostic), {
              logLevel: "error",
            });
          },
        },
      ],
    });

    m.getRawTranslation("first.missing");
    m.removeModule("observer");
    m.getRawTranslation("second.missing");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "missing_translation",
        details: expect.objectContaining({ messageKey: "first.missing" }),
      }),
    ]);
  });

  it("supports manually unsubscribing module diagnostic subscriptions", function () {
    const diagnostics: any[] = [];
    let unsubscribe: (() => void) | undefined;
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        {
          name: "observer",
          setup({ onDiagnostic }) {
            unsubscribe = onDiagnostic((diagnostic) => diagnostics.push(diagnostic), {
              logLevel: "error",
            });
          },
        },
      ],
    });

    unsubscribe?.();
    unsubscribe?.();
    m.getRawTranslation("missing.message");

    expect(diagnostics).toEqual([]);
  });

  it("clears module diagnostic subscriptions after close", async function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        {
          name: "observer",
          setup({ onDiagnostic }) {
            onDiagnostic((diagnostic) => diagnostics.push(diagnostic), {
              logLevel: "error",
            });
          },
        },
      ],
    });

    await m.close();
    m.getRawTranslation("missing.after.close");

    expect(diagnostics).toEqual([]);
  });

  it("emits error events for module diagnostics", function () {
    const errors: any[] = [];
    const m = createMessagevisor({ logLevel: "fatal" });

    m.on("error", (event) => errors.push(event));
    m.addModule({
      name: "datadog",
      setup({ reportDiagnostic }) {
        reportDiagnostic({
          level: "error",
          code: "datadog_transport_failed",
          message: "Datadog transport failed",
        });
      },
    });

    expect(errors).toEqual([
      expect.objectContaining({
        type: "error",
        diagnostic: expect.objectContaining({
          level: "error",
          code: "datadog_transport_failed",
          module: "datadog",
        }),
      }),
    ]);
  });

  it("returns context, currency, and timeZone", function () {
    const m = createMessagevisor({
      context: { platform: "web" },
      currency: "EUR",
      timeZone: "Europe/Amsterdam",
    });

    expect(m.getContext()).toEqual({ platform: "web" });
    expect(m.getCurrency()).toEqual("EUR");
    expect(m.getTimeZone()).toEqual("Europe/Amsterdam");

    m.setContext({ plan: "pro" });
    m.setCurrency("USD");
    m.setTimeZone("UTC");

    expect(m.getContext()).toEqual({ platform: "web", plan: "pro" });
    expect(m.getCurrency()).toEqual("USD");
    expect(m.getTimeZone()).toEqual("UTC");
  });

  it("replaces context when requested", function () {
    const m = createMessagevisor({
      context: { platform: "web" },
    });

    m.setContext({ plan: "pro" }, true);

    expect(m.getContext()).toEqual({ plan: "pro" });
  });

  it("shallow merges context without deep merging nested values", function () {
    const m = createMessagevisor({
      context: {
        account: {
          plan: "free",
          region: "eu",
        },
        platform: "web",
      },
    });

    m.setContext({
      account: {
        plan: "pro",
      },
    });

    expect(m.getContext()).toEqual({
      account: {
        plan: "pro",
      },
      platform: "web",
    });
  });

  it("returns isolated snapshots of observable SDK state", function () {
    const m = createMessagevisor({
      datafile,
      context: { platform: "web" },
      currency: "EUR",
      timeZone: "Europe/Amsterdam",
    });

    const snapshot = m.getSnapshot();
    snapshot.context.platform = "mobile";
    snapshot.datafileLocales.push("nl-NL");
    snapshot.datafileRevisionsByLocale["nl-NL"] = "2";

    expect(snapshot).toEqual({
      version: 1,
      locale: "en-US",
      direction: "ltr",
      context: { platform: "mobile" },
      currency: "EUR",
      timeZone: "Europe/Amsterdam",
      datafileLocales: ["en-US", "nl-NL"],
      datafileRevisionsByLocale: { "en-US": "1", "nl-NL": "2" },
    });
    expect(m.getSnapshot()).toEqual({
      version: 1,
      locale: "en-US",
      direction: "ltr",
      context: { platform: "web" },
      currency: "EUR",
      timeZone: "Europe/Amsterdam",
      datafileLocales: ["en-US"],
      datafileRevisionsByLocale: { "en-US": "1" },
    });
  });

  it("notifies subscribers when SDK state changes", function () {
    const m = createMessagevisor({ datafile });
    const changes: string[] = [];

    const unsubscribe = m.subscribe(() => {
      changes.push(`${m.getSnapshot().version}:${m.getLocale()}`);
    });

    m.setContext({ platform: "web" });
    m.setCurrency("EUR");
    m.setTimeZone("UTC");
    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      translations: { greeting: "Hallo {name}" },
      messages: { greeting: {} },
    });
    m.setLocale("nl-NL");
    unsubscribe();
    m.setCurrency("USD");

    expect(changes).toEqual(["2:en-US", "3:en-US", "4:en-US", "5:en-US", "6:nl-NL"]);
  });

  it("accepts JSON string datafiles in constructor and setDatafile", function () {
    const m = createMessagevisor({ datafile: JSON.stringify(datafile) });

    expect(m.getLocale()).toEqual("en-US");
    expect(m.getRevision()).toEqual("1");

    const datafileEvents: any[] = [];
    m.on("datafile_set", (event) => datafileEvents.push(event));

    m.setDatafile(
      JSON.stringify({
        ...datafile,
        locale: "nl-NL",
        revision: "2",
        translations: { greeting: "Hallo {name}" },
        messages: { greeting: {} },
      }),
    );

    expect(m.getDatafile("nl-NL").revision).toEqual("2");
    expect(datafileEvents[0].datafile.locale).toEqual("nl-NL");

    m.setDatafile(
      JSON.stringify({
        ...datafile,
        locale: "nl-NL",
        revision: "3",
        translations: { mergedOnly: "Merged only" },
        messages: { mergedOnly: {} },
      }),
    );

    expect(m.getDatafile("nl-NL").revision).toEqual("3");
    expect(m.getDatafile("nl-NL").translations.greeting).toEqual("Hallo {name}");
    expect(m.getDatafile("nl-NL").translations.mergedOnly).toEqual("Merged only");
  });

  it("reports invalid string datafiles without changing SDK state", function () {
    const m = createMessagevisor({ datafile });
    const events: any[] = [];
    const errors: any[] = [];

    m.on("change", (event) => events.push(event));
    m.on("datafile_set", (event) => events.push(event));
    m.on("error", (event) => errors.push(event));

    consoleErrorSpy.mockClear();
    m.setDatafile("{not json");

    expect(m.getLocale()).toEqual("en-US");
    expect(m.getRevision()).toEqual("1");
    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].version).toEqual(m.getSnapshot().version);
    expect(errors[0].diagnostic).toEqual(
      expect.objectContaining({ code: "invalid_datafile", level: "error" }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[Messagevisor]",
      "could not parse datafile",
      expect.objectContaining({ code: "invalid_datafile", level: "error" }),
    );

    m.setDatafile(JSON.stringify({ revision: "2" }));

    expect(m.getRevision()).toEqual("1");
    expect(events).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[1].diagnostic).toEqual(
      expect.objectContaining({ code: "invalid_datafile", level: "error" }),
    );
  });

  it("exposes locale direction from the active or requested datafile", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile({
      ...datafile,
      locale: "ar-SA",
      direction: "rtl",
      revision: "2",
      translations: { greeting: "مرحبا {name}" },
      messages: { greeting: {} },
    });

    expect(m.getDirection()).toEqual("ltr");
    expect(m.getDirection("ar-SA")).toEqual("rtl");

    m.setLocale("ar-SA");

    expect(m.getDirection()).toEqual("rtl");
    expect(m.getSnapshot().direction).toEqual("rtl");
  });

  it("emits detailed events with previous and next snapshots", function () {
    const m = createMessagevisor({ datafile });
    const localeEvents: any[] = [];
    const changeEvents: any[] = [];

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      translations: { greeting: "Hallo {name}" },
      messages: { greeting: {} },
    });
    m.on("locale_set", (event) => localeEvents.push(event));
    m.on("change", (event) => changeEvents.push(event));

    m.setLocale("nl-NL");

    expect(localeEvents).toHaveLength(1);
    expect(changeEvents).toHaveLength(1);
    expect(localeEvents[0].type).toEqual("locale_set");
    expect(changeEvents[0].type).toEqual("change");
    expect(localeEvents[0].version).toEqual(changeEvents[0].version);
    expect(localeEvents[0].previousLocale).toEqual("en-US");
    expect(localeEvents[0].locale).toEqual("nl-NL");
    expect(localeEvents[0].previousSnapshot.locale).toEqual("en-US");
    expect(localeEvents[0].snapshot.locale).toEqual("nl-NL");
  });

  it("emits lightweight lifecycle events for every observable state change", function () {
    const m = createMessagevisor({ datafile });
    const events: string[] = [];

    (
      ["datafile_set", "locale_set", "context_set", "currency_set", "timeZone_set"] as const
    ).forEach((eventName) => {
      m.on(eventName, () => events.push(eventName));
    });

    m.setContext({ plan: "pro" });
    m.setCurrency("EUR");
    m.setTimeZone("UTC");
    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      translations: { greeting: "Hallo {name}" },
      messages: { greeting: {} },
    });
    m.setLocale("nl-NL");

    expect(events).toEqual([
      "context_set",
      "currency_set",
      "timeZone_set",
      "datafile_set",
      "locale_set",
    ]);
  });

  it("supports unsubscribing from detailed events", function () {
    const m = createMessagevisor();
    const events: string[] = [];
    const unsubscribe = m.on("datafile_set", (event) => {
      events.push(`${event.datafile?.locale}:${event.snapshot.version}`);
    });

    m.setDatafile(datafile);
    unsubscribe();
    m.setDatafile({ ...datafile, revision: "2" });

    expect(events).toEqual(["en-US:1"]);
  });

  it("setDatafile stores a new locale when none exists yet", function () {
    const m = createMessagevisor();

    m.setDatafile(datafile);

    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(m.getRevision()).toEqual("1");
  });

  it("setDatafile merges segments, messages, and translations while replacing top-level fields", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile({
      ...datafile,
      revision: "2",
      target: "mobile",
      formats: {
        number: {
          scientific: { notation: "scientific" },
        },
      },
      segments: {
        "platform-ios": {
          conditions: [{ attribute: "platform", operator: "equals", value: "ios" }],
        },
        "platform-web": {
          conditions: [{ attribute: "platform", operator: "equals", value: "browser" }],
        },
      },
      messages: {
        greeting: {},
        mergedOnly: {
          meta: {
            source: "merged",
          },
        },
      },
      translations: {
        greeting: "Merged hello {name}",
        mergedOnly: "Merged only",
      },
    });

    expect(m.getRevision()).toEqual("2");
    expect(m.getDatafile().target).toEqual("mobile");
    expect(m.getDatafile().formats).toEqual({
      number: {
        scientific: { notation: "scientific" },
      },
    });
    expect(m.getDatafile().segments["platform-ios"]).toEqual({
      conditions: [{ attribute: "platform", operator: "equals", value: "ios" }],
    });
    expect(m.getDatafile().segments["platform-web"]).toEqual({
      conditions: [{ attribute: "platform", operator: "equals", value: "browser" }],
    });
    expect(m.getDatafile().messages["mergedOnly"]).toEqual({
      meta: {
        source: "merged",
      },
    });
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Merged hello {name}");
    expect(m.translate("mergedOnly")).toEqual("Merged only");
    expect(m.translate("total", { amount: 12 })).toEqual("Total: {amount, number, ::currency/USD}");
  });

  it("setDatafile preserves keys that are absent from the incoming locale datafile", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile({
      schemaVersion: "1",
      messagevisorVersion: "0.0.1",
      revision: "2",
      target: "web",
      locale: "en-US",
      formats: undefined,
      segments: {},
      messages: {
        mergedOnly: {},
      },
      translations: {
        mergedOnly: "Merged only",
      },
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(m.translate("mergedOnly")).toEqual("Merged only");
    expect(m.getDatafile().segments["platform-web"]).toEqual({
      conditions: [{ attribute: "platform", operator: "equals", value: "web" }],
    });
  });

  it("setDatafile replaces an existing locale datafile when requested", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile(
      {
        schemaVersion: "1",
        messagevisorVersion: "0.0.1",
        revision: "2",
        target: "web",
        locale: "en-US",
        formats: undefined,
        segments: {},
        messages: {
          replacementOnly: {},
        },
        translations: {
          replacementOnly: "Replacement only",
        },
      },
      true,
    );

    expect(m.getRevision()).toEqual("2");
    expect(m.getDatafile().translations.greeting).toBeUndefined();
    expect(m.getDatafile().segments["platform-web"]).toBeUndefined();
    expect(m.translate("replacementOnly")).toEqual("Replacement only");
  });

  it("setDatafile supports loading a segment after a message override already exists", function () {
    const m = createMessagevisor({
      datafile: {
        ...datafile,
        segments: {},
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
        },
        translations: {
          greeting: "Hello {name}",
        },
      },
      context: { platform: "web" },
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");

    m.setDatafile({
      schemaVersion: "1",
      messagevisorVersion: "0.0.1",
      revision: "2",
      target: "web",
      locale: "en-US",
      formats: m.getDatafile().formats,
      segments: {
        "platform-web": {
          conditions: [{ attribute: "platform", operator: "equals", value: "web" }],
        },
      },
      messages: {},
      translations: {},
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello web {name}");
  });

  it("setDatafile reuses datafile_set and change events with the merged payload", function () {
    const m = createMessagevisor({ datafile });
    const datafileEvents: any[] = [];
    const changeEvents: any[] = [];

    m.on("datafile_set", (event) => datafileEvents.push(event));
    m.on("change", (event) => changeEvents.push(event));

    m.setDatafile({
      schemaVersion: "1",
      messagevisorVersion: "0.0.1",
      revision: "2",
      target: "mobile",
      locale: "en-US",
      formats: undefined,
      segments: {},
      messages: {
        mergedOnly: {},
      },
      translations: {
        mergedOnly: "Merged only",
      },
    });

    expect(datafileEvents).toHaveLength(1);
    expect(changeEvents).toHaveLength(1);
    expect(datafileEvents[0].type).toEqual("datafile_set");
    expect(changeEvents[0].type).toEqual("change");
    expect(datafileEvents[0].datafile.revision).toEqual("2");
    expect(datafileEvents[0].datafile.target).toEqual("mobile");
    expect(datafileEvents[0].datafile.translations["greeting"]).toEqual("Hello {name}");
    expect(datafileEvents[0].datafile.translations["mergedOnly"]).toEqual("Merged only");
    expect(datafileEvents[0].snapshot.datafileRevisionsByLocale["en-US"]).toEqual("2");
  });

  it("closes modules in reverse registration order and awaits async cleanup", async function () {
    const calls: string[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "first",
          close() {
            calls.push("first");
          },
        },
        {
          name: "second",
          async close() {
            await Promise.resolve();
            calls.push("second");
          },
        },
        {
          name: "third",
          close() {
            calls.push("third");
          },
        },
      ],
    });

    await m.close();

    expect(calls).toEqual(["third", "second", "first"]);
  });

  it("shares the same in-flight close promise and only closes modules once", async function () {
    const calls: string[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "only",
          async close() {
            await Promise.resolve();
            calls.push("only");
          },
        },
      ],
    });

    await Promise.all([m.close(), m.close(), m.close()]);

    expect(calls).toEqual(["only"]);

    await expect(m.close()).resolves.toBeUndefined();
    expect(calls).toEqual(["only"]);
  });

  it("closes modules when removed and does not close them again with the instance", async function () {
    const calls: string[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "stay",
          close() {
            calls.push("stay");
          },
        },
        {
          name: "remove",
          close() {
            calls.push("remove");
          },
        },
      ],
    });

    await m.removeModule("remove");
    await m.close();

    expect(calls).toEqual(["remove", "stay"]);
  });

  it("reports module close failures, closes remaining modules, and rejects with an aggregate error", async function () {
    const calls: string[] = [];
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "error",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      modules: [
        {
          name: "first",
          close() {
            calls.push("first");
          },
        },
        {
          name: "broken",
          close() {
            calls.push("broken");
            throw new Error("boom");
          },
        },
        {
          name: "last",
          close() {
            calls.push("last");
          },
        },
      ],
    });

    await expect(m.close()).rejects.toThrow("One or more Messagevisor modules failed to close.");
    expect(calls).toEqual(["last", "broken", "first"]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        level: "error",
        code: "module_close_error",
        message: "Module close failed",
        moduleName: "broken",
        details: {},
      }),
    ]);
  });

  it("clears listeners and modules after close", async function () {
    const changes: string[] = [];
    const events: string[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "suffix",
          transform({ translation }) {
            return typeof translation === "string" ? `${translation}!` : undefined;
          },
        },
      ],
    });

    const unsubscribe = m.subscribe(() => {
      changes.push("change");
    });
    const unsubscribeEvent = m.on("currency_set", () => {
      events.push("currency");
    });

    await m.close();

    unsubscribe();
    unsubscribeEvent();

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(m.formatMessage("Hi {name}", { name: "Ada" })).toEqual("Hi {name}");

    m.setContext({ platform: "web" });
    m.setCurrency("EUR");
    m.setTimeZone("UTC");
    m.setDatafile({ ...datafile, revision: "2" });
    m.setLocale("en-US");
    m.addModule({
      name: "noop",
      transform() {
        return "changed";
      },
    });
    m.removeModule("noop");

    expect(changes).toEqual([]);
    expect(events).toEqual([]);

    const lateUnsubscribe = m.subscribe(() => {
      changes.push("late");
    });
    const lateEventUnsubscribe = m.on("change", () => {
      events.push("late");
    });
    lateUnsubscribe();
    lateEventUnsubscribe();

    expect(changes).toEqual([]);
    expect(events).toEqual([]);
  });

  it("uses the datafile locale as the current locale", function () {
    const m = createMessagevisor({
      datafile,
      locale: "nl-NL",
    });

    expect(m.getLocale()).toEqual("en-US");
  });

  it("returns the revision for the active or requested locale datafile", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      translations: { greeting: "Hallo {name}" },
      messages: { greeting: {} },
    });

    expect(m.getRevision()).toEqual("1");
    expect(m.getRevision("en-US")).toEqual("1");
    expect(m.getRevision("nl-NL")).toEqual("2");

    m.setLocale("nl-NL");

    expect(m.getRevision()).toEqual("2");
  });

  it("throws when getting revision without a locale datafile", function () {
    const m = createMessagevisor();

    expect(() => m.getRevision()).toThrow("Datafile not found: no locale is set");
    expect(() => m.getRevision("nl-NL")).toThrow("Datafile not found for locale: nl-NL");
  });

  it("returns raw translations by default", function () {
    const m = createMessagevisor({ datafile });
    const translation: string = m.translate("greeting", { name: "Ada" });
    const aliasTranslation: string = m.t("greeting", { name: "Ada" });
    const rawTranslation: string = m.getRawTranslation("greeting");
    const richTranslation: string | RichNode | Array<string | RichNode> = m.translate<RichNode>(
      "richTerms",
      {
        link: (chunks) => ({ type: "link", children: chunks }),
      },
    );

    expect(translation).toEqual("Hello {name}");
    expect(aliasTranslation).toEqual("Hello {name}");
    expect(rawTranslation).toEqual("Hello {name}");
    expect(richTranslation).toEqual("Read our <link>terms</link> for <strong>{product}</strong>.");
    expect((m as any).getTranslation).toEqual(undefined);
    expect((m as any).getTranslationMessage).toEqual(undefined);
  });

  it("runs constructor modules for translations after formatting fallback", function () {
    const payloads: any[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "suffix",
          transform(payload) {
            payloads.push(payload);

            return `${payload.translation}!`;
          },
        },
      ],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}!");
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      translation: "Hello {name}",
      locale: "en-US",
      source: "translation",
      messageKey: "greeting",
    });
  });

  it("runs modules for formatMessage without a message key", function () {
    const payloads: any[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          transform(payload) {
            payloads.push(payload);

            return `${payload.translation} done`;
          },
        },
      ],
    });

    expect(m.formatMessage("Hello {name}", { name: "Ada" })).toEqual("Hello {name} done");
    expect(payloads[0]).toMatchObject({
      translation: "Hello {name}",
      locale: "en-US",
      source: "formatMessage",
    });
    expect(payloads[0].messageKey).toBeUndefined();
  });

  it("adds and removes modules by name after creation", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      modules: [
        {
          name: "wrap",
          transform: ({ translation }) => `[${translation}]`,
        },
      ],
    });

    m.addModule({
      name: "shout",
      transform: ({ translation }) => String(translation).toUpperCase(),
    });
    m.addModule({
      name: "shout",
      transform: ({ translation }) => `${translation}!`,
    });
    m.addModule({
      transform: ({ translation }) => `${translation}?`,
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("[HELLO {NAME}]?");
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          code: "duplicate_module",
          message: "Duplicate module name",
          moduleName: "shout",
        }),
      ]),
    );

    m.removeModule("shout");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("[Hello {name}]?");

    m.removeModule("missing");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("[Hello {name}]?");
  });

  it("does not register duplicate module names during initialization", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      modules: [
        {
          name: "wrap",
          transform: ({ translation }) => `[${translation}]`,
        },
        {
          name: "wrap",
          transform: ({ translation }) => `${translation}!`,
        },
      ],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("[Hello {name}]");
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          code: "duplicate_module",
          moduleName: "wrap",
        }),
      ]),
    );
  });

  it("preserves the previous translation when modules return undefined", function () {
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          transform: () => undefined,
        },
        {
          transform: ({ translation }) => `${translation}!`,
        },
      ],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}!");
  });

  it("lets formatting modules run before transform modules", function () {
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "interpolate",
          format({ translation, values }) {
            return String(translation).replace("{name}", String(values && values.name));
          },
        },
        {
          name: "uppercase",
          format({ translation }) {
            return String(translation).toUpperCase();
          },
        },
        {
          transform(payload) {
            return `${payload.translation}!`;
          },
        },
      ],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("HELLO ADA!");
    expect(m.formatMessage("Hi {name}", { name: "Lin" })).toEqual("HI LIN!");
  });

  it("runs setup for constructor and added modules, and last resolver registration wins", function () {
    const m = createMessagevisor({
      datafile,
      resolveFlag: () => false,
      resolveVariation: () => "a",
      modules: [
        {
          setup({ setFlagResolver, setVariationResolver }) {
            setFlagResolver(() => false);
            setVariationResolver(() => "a");
          },
        },
        {
          setup({ setFlagResolver, setVariationResolver }) {
            setFlagResolver((featureKey, context) => {
              return featureKey === "new-checkout" && context?.platform === "web";
            });
            setVariationResolver((experimentKey, context) => {
              return experimentKey === "checkout-copy" && context?.platform === "web" ? "b" : "a";
            });
          },
        },
      ],
      context: { platform: "web" },
    });

    expect(m.translate("featureGate")).toEqual("Feature enabled");
    expect(m.translate("experimentGate")).toEqual("Experiment B");

    const raw = createMessagevisor({
      datafile,
      context: { platform: "web" },
    });

    raw.addModule({
      setup({ setFlagResolver, setVariationResolver }) {
        setFlagResolver(() => true);
        setVariationResolver(() => "b");
      },
    });

    expect(raw.translate("featureGate")).toEqual("Feature enabled");
    expect(raw.translate("experimentGate")).toEqual("Experiment B");
  });

  it("runs modules for overrides and missing key fallbacks without double-running", function () {
    const calls: any[] = [];
    const m = createMessagevisor({
      datafile,
      context: { platform: "web" },
      modules: [
        {
          transform(payload) {
            calls.push(payload);

            return payload.translation;
          },
        },
      ],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello web {name}");
    expect(m.translate("richTerms", { product: "Messagevisor" })).toEqual(
      "Read our <link>terms</link> for <strong>{product}</strong>.",
    );
    expect(m.translate("missing.key")).toEqual("missing.key");

    expect(calls.map((call) => call.messageKey)).toEqual(["greeting", "richTerms", "missing.key"]);
    expect(calls).toHaveLength(3);
  });

  it("returns selected raw translation messages before formatting", function () {
    const m = createMessagevisor({ datafile });

    expect(m.getRawTranslation("greeting")).toEqual("Hello {name}");
    expect(
      m.getRawTranslation("greeting", {
        context: { platform: "web" },
      }),
    ).toEqual("Hello web {name}");
    expect(m.getRawTranslation("missing.key")).toEqual("missing.key");
  });

  it("reports missing translation messages and keeps the message key fallback by default", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      context: { platform: "web", plan: "free" },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.translate("missing.key", undefined, { context: { plan: "pro" } })).toEqual(
      "missing.key",
    );
    expect(m.getRawTranslation("missing.raw")).toEqual("missing.raw");

    const missingMessages = diagnostics.filter(
      (diagnostic) => diagnostic.code === "missing_translation",
    );
    expect(missingMessages).toHaveLength(2);
    expect(missingMessages[0]).toMatchObject({
      level: "error",
      message: "Missing translation",
      details: {
        messageKey: "missing.key",
        locale: "en-US",
        source: "translation",
      },
    });
    expect(missingMessages[1]).toMatchObject({
      level: "error",
      message: "Missing translation",
      details: {
        messageKey: "missing.raw",
        locale: "en-US",
        source: "translation",
      },
    });
  });

  it("keeps message key fallback when onDiagnostic observes a missing translation", function () {
    const m = createMessagevisor({
      datafile,
      onDiagnostic: () => "ignored" as any,
    });

    expect(m.translate("missing.greeting", { name: "Ada" })).toEqual("missing.greeting");
  });

  it("uses per-call default translations after datafile and locale defaults", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      defaultTranslations: {
        "en-US": {
          fallbackOnly: "Fallback only {name}",
        },
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(
      m.translate("greeting", { name: "Ada" }, { defaultTranslation: "Default {name}" }),
    ).toEqual("Hello {name}");
    expect(
      m.translate("fallbackOnly", { name: "Ada" }, { defaultTranslation: "Default {name}" }),
    ).toEqual("Fallback only {name}");
    expect(
      m.translate("missing.default", { name: "Ada" }, { defaultTranslation: "Default {name}" }),
    ).toEqual("Default {name}");
    expect(m.getRawTranslation("missing.raw", { defaultTranslation: "Default raw" })).toEqual(
      "Default raw",
    );
    expect(
      diagnostics
        .filter((diagnostic) => diagnostic.code === "missing_translation")
        .map((diagnostic) => ({
          messageKey: diagnostic.details.messageKey,
          message: diagnostic.message,
        })),
    ).toEqual([
      { messageKey: "missing.default", message: "Missing translation" },
      { messageKey: "missing.raw", message: "Missing translation" },
    ]);
  });

  it("uses empty defaultTranslations entries as explicit values", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      defaultTranslations: {
        "en-US": {
          emptyDefault: "",
        },
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.translate("emptyDefault", undefined, { defaultTranslation: "Default" })).toEqual("");
    expect(diagnostics.some((diagnostic) => diagnostic.code === "missing_translation")).toEqual(
      false,
    );
  });

  it("uses empty defaultTranslation when explicitly provided", function () {
    const m = createMessagevisor({
      datafile,
    });

    expect(m.getRawTranslation("missing.empty", { defaultTranslation: "" })).toEqual("");
  });

  it("does not report existing translation messages as missing", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(diagnostics.some((diagnostic) => diagnostic.code === "missing_translation")).toEqual(
      false,
    );
  });

  it("returns raw translation messages selected by feature and experiment conditions", function () {
    const m = createMessagevisor({
      datafile,
      resolveFlag: (featureKey) => featureKey === "new-checkout",
      resolveVariation: (experimentKey) => (experimentKey === "checkout-copy" ? "b" : "control"),
    });

    expect(m.getRawTranslation("featureGate")).toEqual("Feature enabled");
    expect(m.getRawTranslation("experimentGate")).toEqual("Experiment B");
  });

  it("keeps rich text tags and ICU placeholders untouched by default", function () {
    const m = createMessagevisor({ datafile });

    expect(
      m.translate("richTerms", {
        product: "Messagevisor",
        link: (chunks) => `[${chunks.join("")}]`,
        strong: (chunks) => chunks.join("").toUpperCase(),
      }),
    ).toEqual("Read our <link>terms</link> for <strong>{product}</strong>.");
  });

  it("supports sparse message metadata in datafiles", function () {
    const m = createMessagevisor({
      datafile: {
        ...datafile,
        messages: {},
        translations: {
          greeting: "Hello {name}",
        },
      },
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
  });

  it("passes message meta to modules for keyed translations only", function () {
    const formatPayloads: Array<{ messageKey?: string; meta?: Record<string, unknown> }> = [];
    const transformPayloads: Array<{ messageKey?: string; meta?: Record<string, unknown> }> = [];
    const m = createMessagevisor({
      datafile: {
        ...datafile,
        messages: {
          ...datafile.messages,
          greeting: {
            ...datafile.messages.greeting,
            meta: {
              tags: ["auth", "entry"],
              analytics: {
                event: "signin_impression",
              },
            },
          },
        },
      },
      modules: [
        {
          format(payload) {
            formatPayloads.push({
              messageKey: payload.messageKey,
              meta: payload.meta as Record<string, unknown> | undefined,
            });
          },
          transform(payload) {
            transformPayloads.push({
              messageKey: payload.messageKey,
              meta: payload.meta as Record<string, unknown> | undefined,
            });
          },
        },
      ],
    });

    m.translate("greeting", { name: "Ada" });
    m.formatMessage("Hello {name}", { name: "Ada" });

    expect(formatPayloads).toEqual([
      {
        messageKey: "greeting",
        meta: {
          tags: ["auth", "entry"],
          analytics: {
            event: "signin_impression",
          },
        },
      },
      {
        messageKey: undefined,
        meta: undefined,
      },
    ]);
    expect(transformPayloads).toEqual([
      {
        messageKey: "greeting",
        meta: {
          tags: ["auth", "entry"],
          analytics: {
            event: "signin_impression",
          },
        },
      },
      {
        messageKey: undefined,
        meta: undefined,
      },
    ]);
  });

  it("passes a destructurable module API to format and transform hooks", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      modules: [
        {
          name: "runtime",
          format(payload, api) {
            api!.reportDiagnostic({
              level: "warn",
              code: "runtime_format_seen",
              message: "Runtime format seen",
              details: {
                locale: payload.locale,
                messageKey: payload.messageKey,
                source: payload.source,
              },
            });
          },
          transform(payload, api) {
            api!.reportDiagnostic({
              level: "warn",
              code: "runtime_transform_seen",
              message: "Runtime transform seen",
              details: {
                locale: payload.locale,
                messageKey: payload.messageKey,
                source: payload.source,
              },
            });
          },
        },
      ],
    });

    m.translate("greeting", { name: "Ada" });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "runtime_format_seen",
          module: "runtime",
          details: expect.objectContaining({ messageKey: "greeting" }),
        }),
        expect.objectContaining({
          code: "runtime_transform_seen",
          module: "runtime",
          details: expect.objectContaining({ messageKey: "greeting" }),
        }),
      ]),
    );
  });

  it("emits error events for diagnostics reported from runtime hooks", function () {
    const events: any[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        {
          name: "runtime",
          transform(payload, api) {
            api!.reportDiagnostic({
              level: "error",
              code: "runtime_transform_failed",
              message: "Runtime transform failed",
              details: {
                locale: payload.locale,
                messageKey: payload.messageKey,
                source: payload.source,
              },
            });
          },
        },
      ],
    });

    m.on("error", (event) => events.push(event));
    m.translate("greeting", { name: "Ada" });

    expect(events).toEqual([
      expect.objectContaining({
        diagnostic: expect.objectContaining({
          code: "runtime_transform_failed",
          module: "runtime",
          details: expect.objectContaining({ messageKey: "greeting" }),
        }),
      }),
    ]);
  });

  it("reuses one module API instance for setup and runtime hooks", function () {
    const apis: any[] = [];
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "runtime",
          setup(api) {
            apis.push(api);
          },
          format(_payload, api) {
            apis.push(api);
          },
          transform(_payload, api) {
            apis.push(api);
          },
        },
      ],
    });

    m.translate("greeting", { name: "Ada" });
    m.translate("greeting", { name: "Ada" });

    expect(apis).toHaveLength(5);
    expect(apis.every((api) => api === apis[0])).toEqual(true);
  });

  it("applies overrides using segments and context", function () {
    const m = createMessagevisor({
      datafile,
      context: { platform: "web" },
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello web {name}");
  });

  it("emits debug diagnostics for message override evaluation", function () {
    const diagnostics: any[] = [];
    const keyedDatafile = {
      ...datafile,
      messages: {
        ...datafile.messages,
        greeting: {
          ...datafile.messages.greeting,
          overrides: datafile.messages.greeting.overrides?.map((override, index) => ({
            ...override,
            key: `override-${index}`,
          })) as any,
        },
      },
    };
    const m = createMessagevisor({
      datafile: keyedDatafile,
      context: { platform: "web" },
      logLevel: "debug",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello web {name}");

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "debug",
          code: "message_override_matched",
          message: "Message override matched",
          details: {
            locale: "en-US",
            messageKey: "greeting",
            overrideKey: "override-0",
          },
        }),
      ]),
    );
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === "message_override_matched"),
    ).toHaveLength(1);
    expect(diagnostics.every((diagnostic) => diagnostic.details)).toEqual(true);
  });

  it("does not emit override debug diagnostics when no message override matches", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      datafile,
      context: { platform: "mobile" },
      logLevel: "debug",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");

    expect(
      diagnostics.filter((diagnostic) => diagnostic.code.startsWith("message_override_")),
    ).toEqual([]);
  });

  it("applies overrides with stringified conditions and group segments from datafiles", function () {
    const stringifiedDatafile: DatafileContent = {
      ...datafile,
      segments: {
        ...datafile.segments,
        "plan-pro": {
          conditions: JSON.stringify({
            attribute: "plan",
            operator: "equals",
            value: "pro",
          }),
        },
        "region-eu": {
          conditions: JSON.stringify([
            {
              attribute: "region",
              operator: "equals",
              value: "EU",
            },
          ]),
        },
        everyone: {
          conditions: "*",
        },
      },
      messages: {
        ...datafile.messages,
        stringifiedCondition: {
          overrides: [
            {
              key: "plan-pro",
              conditions: JSON.stringify({
                attribute: "plan",
                operator: "equals",
                value: "pro",
              }),
              translation: "Condition match",
            },
          ],
        },
        stringifiedConditionArray: {
          overrides: [
            {
              key: "plan-pro-region-eu",
              conditions: JSON.stringify([
                { attribute: "plan", operator: "equals", value: "pro" },
                { attribute: "region", operator: "equals", value: "EU" },
              ]),
              translation: "Condition array match",
            },
          ],
        },
        stringifiedGroupSegment: {
          overrides: [
            {
              key: "group-and",
              segments: JSON.stringify({ and: ["plan-pro", "region-eu"] }),
              translation: "Group segment match",
            },
          ],
        },
        stringifiedGroupSegmentArray: {
          overrides: [
            {
              key: "group-array",
              segments: JSON.stringify(["plan-pro", "region-eu"]),
              translation: "Group segment array match",
            },
          ],
        },
        segmentWithEveryoneCondition: {
          overrides: [
            {
              key: "everyone",
              segments: "everyone",
              translation: "Everyone segment match",
            },
          ],
        },
      },
      translations: {
        ...datafile.translations,
        stringifiedCondition: "Condition default",
        stringifiedConditionArray: "Condition array default",
        stringifiedGroupSegment: "Group segment default",
        stringifiedGroupSegmentArray: "Group segment array default",
        segmentWithEveryoneCondition: "Everyone segment default",
      },
    };
    const m = createMessagevisor({
      datafile: stringifiedDatafile,
      context: { platform: "web", plan: "pro", region: "EU" },
    });

    expect(m.translate("stringifiedCondition")).toEqual("Condition match");
    expect(m.translate("stringifiedConditionArray")).toEqual("Condition array match");
    expect(m.translate("stringifiedGroupSegment")).toEqual("Group segment match");
    expect(m.translate("stringifiedGroupSegmentArray")).toEqual("Group segment array match");
    expect(m.translate("segmentWithEveryoneCondition")).toEqual("Everyone segment match");
  });

  it("accepts evaluation options as the third argument", function () {
    const m = createMessagevisor({ datafile });

    expect(
      m.translate(
        "greeting",
        { name: "Ada" },
        {
          context: { platform: "web" },
        },
      ),
    ).toEqual("Hello web {name}");
  });

  it("merges per-call context with instance context and lets per-call context win", function () {
    const m = createMessagevisor({
      datafile: {
        ...datafile,
        messages: {
          ...datafile.messages,
          mergedContext: {
            overrides: [
              {
                key: "enterprise-web",
                conditions: [
                  { attribute: "platform", operator: "equals", value: "web" },
                  { attribute: "plan", operator: "equals", value: "enterprise" },
                ] as any,
                translation: "Merged context",
              },
            ],
          },
        },
        translations: {
          ...datafile.translations,
          mergedContext: "Default context",
        },
      },
      context: { platform: "web", plan: "pro" },
    });

    expect(
      m.translate(
        "mergedContext",
        {},
        {
          context: { plan: "enterprise" },
        },
      ),
    ).toEqual("Merged context");
  });

  it("stores and switches locale datafiles", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      translations: { greeting: "Hallo {name}", total: "Totaal" },
      messages: { greeting: {}, total: {} },
    });

    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");

    m.setLocale("nl-NL");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hallo {name}");
  });

  it("setDatafile does not switch the active locale when another locale is stored later", function () {
    const m = createMessagevisor({ datafile });

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      translations: { greeting: "Hallo {name}", total: "Totaal" },
      messages: { greeting: {}, total: {} },
    });

    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");

    m.setLocale("nl-NL");
    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hallo {name}");
  });

  it("formats numbers and dates with presets", function () {
    const m = createMessagevisor({ datafile, timeZone: "UTC" });

    expect(m.formatNumber(12, { style: "currency", currency: "USD" })).toContain("12");
    expect(m.formatNumber(12, "money")).toContain("12");
    expect(m.formatDate("2025-01-02T00:00:00Z", "short")).toContain("1/2/25");
    expect(m.formatRelativeTime(-1, "day", "short")).toEqual("yesterday");
  });

  it("uses call, format style, instance, and fallback precedence for currency", function () {
    const m = createMessagevisor({ datafile, currency: "CHF" });

    expect(m.formatNumber(12, "money")).toContain("USD");
    expect(m.formatNumber(12, "money", { currency: "EUR" })).toContain("EUR");
    expect(
      m.formatNumber(12, { style: "currency", currency: "GBP", currencyDisplay: "code" }),
    ).toContain("GBP");
    expect(m.formatNumber(12, { style: "currency" } as any)).toContain("CHF");
    expect(m.formatNumber(12, "runtimeMoney")).toContain("CHF");
    expect(m.formatNumber(12, "runtimeMoney", { currency: "EUR" })).toContain("EUR");
    expect(m.formatNumber(12, "money", { currency: "EUR" })).toContain("EUR");
    expect(m.formatNumber(12, "money")).toContain("USD");

    const fallbackOnly = createMessagevisor({ datafile });
    expect(fallbackOnly.formatNumber(12, { style: "currency", currencyDisplay: "code" })).toContain(
      "USD",
    );
  });

  it("uses call, format style, instance, and fallback precedence for time zones", function () {
    const startsAt = new Date("2025-01-01T12:00:00Z");
    const endsAt = new Date("2025-01-01T14:30:00Z");
    const m = createMessagevisor({ datafile, timeZone: "Asia/Tokyo" });

    expect(m.formatTime(startsAt, "event")).toEqual("12:00 PM");
    expect(m.formatTime(startsAt, "event", { timeZone: "America/New_York" })).toEqual("7:00 AM");
    expect(m.formatTime(startsAt, { hour: "numeric", minute: "2-digit" })).toEqual("9:00 PM");
    expect(
      m.formatTime(startsAt, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Europe/Amsterdam",
      }),
    ).toEqual("1:00 PM");
    expect(m.formatDateTimeRange(startsAt, endsAt, "fullStyle")).toContain(
      "Wednesday, January 1, 2025",
    );
    expect(
      m.formatDateTimeRange(startsAt, endsAt, "fullStyle", {
        timeZone: "America/Los_Angeles",
      }),
    ).toContain("4:00");
  });

  it("formats date/time helper variants", function () {
    const startsAt = new Date("2025-01-01T12:00:00Z");
    const endsAt = new Date("2025-01-01T14:30:00Z");
    const m = createMessagevisor({ datafile, timeZone: "UTC" });

    expect(m.formatDate(startsAt, "numeric")).toEqual("01/01/2025");
    expect(m.formatDate(startsAt, "weekday")).toEqual("Wednesday, January 1, 2025");
    expect(m.formatTime(startsAt, "short")).toEqual("12:00 PM");
    expect(m.formatTime(startsAt, "short", { timeZone: "America/New_York" })).toEqual("7:00 AM");
    expect(m.formatDateTimeRange(startsAt, endsAt, "event")).toEqual(
      "Jan 1, 2025, 12:00 – 2:30 PM",
    );
    expect(m.formatRelativeTime(-1, "day", "short")).toEqual("yesterday");
  });

  it("supports expanded Intl-backed number and date/time preset options", function () {
    const startsAt = new Date("2025-01-01T12:00:00Z");
    const endsAt = new Date("2025-01-01T14:30:00Z");
    const m = createMessagevisor({ datafile, timeZone: "UTC" });

    expect(m.formatNumber(1200, "compactShort")).toContain("1.2K");
    expect(m.formatNumber(1200, "compactLong")).toContain("1.2 thousand");
    expect(m.formatNumber(5, "unitDistance")).toMatch(/5\s?km/);
    expect(m.formatNumber(5, "signAlways")).toEqual("+5");
    expect(m.formatNumber(12, "roundingStrip")).toEqual("12");
    expect(m.formatNumber(1200, "engineering")).toContain("1.2E3");
    expect(m.formatNumber(1200, "scientific")).toContain("1.2E3");

    expect(m.formatDate(startsAt, "fullStyle")).toContain("Wednesday, January 1, 2025");
    expect(m.formatDate(startsAt, "arabicNumeric")).not.toEqual("01/01/2025");
    expect(m.formatTime(startsAt, "fullStyle")).toContain("12:00:00 PM");
    expect(m.formatTime(startsAt, "period").toLowerCase()).toContain("noon");
    expect(m.formatDateTimeRange(startsAt, endsAt, "fullStyle")).toContain(
      "Wednesday, January 1, 2025",
    );
  });

  it("uses resolveFlag and resolveVariation for feature and experiment conditions", function () {
    const m = createMessagevisor({
      datafile,
      resolveFlag: (key) => key === "new-checkout",
      resolveVariation: (key) => (key === "checkout-copy" ? "b" : "a"),
    });

    expect(m.translate("featureGate")).toEqual("Feature enabled");
    expect(m.translate("experimentGate")).toEqual("Experiment B");
  });

  it("supports message catalogs, diagnostics, and formatter parity helpers", function () {
    const diagnostics: any[] = [];
    const m = createMessagevisor({
      locale: "en-US",
      defaultTranslations: {
        "en-US": {
          total: "Total: {amount, number}",
        },
      },
      defaultFormats: {
        "en-US": {
          number: {
            short: { notation: "scientific" },
          },
          date: {
            short: { year: "numeric", month: "short", day: "numeric" },
          },
          time: {
            short: { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
          },
        },
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(m.formatMessage(m.getRawTranslation("total"), { amount: 1200 })).toEqual(
      "Total: {amount, number}",
    );
    expect(m.formatNumberToParts(1200, "short").length).toBeGreaterThan(0);
    expect(m.formatDateToParts(new Date("2025-01-01T12:00:00Z"), "short").length).toBeGreaterThan(
      0,
    );
    expect(m.formatTimeToParts(new Date("2025-01-01T12:00:00Z"), "short").length).toBeGreaterThan(
      0,
    );
    expect(m.formatPlural(1)).toEqual("one");
    expect(m.formatList(["A", "B", "C"])).toContain("A");
    expect(m.formatListToParts(["A", "B"]).length).toBeGreaterThan(0);
    expect(typeof m.formatDisplayName("USD", { type: "currency" })).toBeTruthy();
    expect(m.getRawTranslation("missing.message")).toEqual("missing.message");
    expect(diagnostics.some((diagnostic) => diagnostic.code === "missing_datafile")).toEqual(true);
  });

  it("uses locale-keyed default translations only when the active locale datafile misses the key", function () {
    const m = createMessagevisor({
      datafile,
      defaultTranslations: {
        "en-US": {
          greeting: "Fallback hello {name}",
          fallbackOnly: "Fallback only {name}",
        },
        "nl-NL": {
          greeting: "Hallo fallback {name}",
        },
      },
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
    expect(m.translate("fallbackOnly", { name: "Ada" })).toEqual("Fallback only {name}");

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      translations: {
        greeting: "Hallo {name}",
      },
      messages: {
        greeting: {},
      },
    });
    m.setLocale("nl-NL");

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hallo {name}");
  });

  it("uses locale-keyed default formats as defaults for the active locale", function () {
    const m = createMessagevisor({
      locale: "en-US",
      defaultFormats: {
        "en-US": {
          number: {
            short: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
            shared: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
          },
        },
        "nl-NL": {
          number: {
            short: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
            nlOnly: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
          },
        },
      },
    });

    expect(m.formatNumber(1200, "short")).toEqual("1,200.0");

    m.setDatafile({
      ...datafile,
      locale: "nl-NL",
      revision: "2",
      formats: {
        number: {
          shared: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
        },
      },
      messages: {
        greeting: {},
      },
      translations: {
        greeting: "Hallo {name}",
      },
    });
    m.setLocale("nl-NL");

    expect(m.formatNumber(1200, "short")).toContain("1.200,0");
    expect(m.formatNumber(1200, "shared")).toEqual("1.200");
    expect(m.formatNumber(1200, "nlOnly")).toEqual("1.200,00");
    expect(
      m.formatNumber(1200, "shared", {
        formats: {
          number: {
            shared: { minimumFractionDigits: 4, maximumFractionDigits: 4 },
          },
        },
      }),
    ).toEqual("1.200,0000");
  });
});
