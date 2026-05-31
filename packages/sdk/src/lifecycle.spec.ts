import type { DatafileContent } from "@messagevisor/types";

import { createMessagevisor } from "./index";
import type { MessagevisorModule } from "./instance";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  direction: "ltr",
  formats: {},
  segments: {},
  messages: {
    hello: {},
  },
  translations: {
    hello: "Hello",
  },
};

describe("SDK lifecycle invariants", function () {
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

  it("deduplicates listener registrations and unsubscribe is idempotent", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const events: string[] = [];
    const callback = () => events.push("change");

    const unsubscribeA = m.subscribe(callback);
    const unsubscribeB = m.subscribe(callback);

    m.setContext({ plan: "pro" });
    unsubscribeA();
    unsubscribeA();
    m.setCurrency("EUR");
    unsubscribeB();
    m.setTimeZone("UTC");

    expect(events).toEqual(["change"]);
  });

  it("emits error events only for error-level diagnostics", function () {
    const diagnostics: any[] = [];
    const errors: any[] = [];
    const m = createMessagevisor({
      datafile: {
        ...datafile,
        messages: {
          hello: { deprecated: true, deprecationWarning: "Use greeting." },
        },
      },
      logLevel: "warn",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    m.on("error", (event) => errors.push(event));

    expect(m.translate("hello")).toEqual("Hello");
    expect(errors).toEqual([]);

    expect(m.translate("missing")).toEqual("missing");
    expect(errors).toHaveLength(1);
    expect(errors[0].diagnostic).toEqual(
      expect.objectContaining({ code: "missing_translation", level: "error" }),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "deprecated_message",
      "missing_translation",
    ]);
  });

  it("ignores state mutations and module registration after close", async function () {
    const calls: string[] = [];
    const module: MessagevisorModule = {
      name: "closer",
      transform() {
        calls.push("transform");
      },
      close() {
        calls.push("close");
      },
    };
    const m = createMessagevisor({ datafile, modules: [module], logLevel: "fatal" });

    expect(m.translate("hello")).toEqual("Hello");
    expect(calls).toEqual(["transform"]);

    await m.close();
    m.addModule({
      name: "late",
      transform() {
        calls.push("late-transform");
      },
    });
    m.removeModule("closer");
    const unsubscribe = m.subscribe(() => calls.push("change"));
    unsubscribe();

    m.setContext({ plan: "pro" });
    expect(m.translate("hello")).toEqual("Hello");
    expect(calls).toEqual(["transform", "close"]);
  });

  it("does not mutate caller-provided context objects when setting or snapshotting context", function () {
    const context = { account: { plan: "free" }, roles: ["viewer"] };
    const m = createMessagevisor({ datafile, context, logLevel: "fatal" });

    const firstContext = m.getContext();
    firstContext.account = { plan: "pro" } as any;
    expect(m.getContext()).toEqual(context);

    const nextContext = { account: { plan: "enterprise" }, roles: ["admin"] };
    m.setContext(nextContext);
    const snapshot = m.getSnapshot();
    snapshot.context.account = { plan: "mutated" } as any;

    expect(m.getContext()).toEqual(nextContext);
    expect(context).toEqual({ account: { plan: "free" }, roles: ["viewer"] });
  });

  it("reports invalid object and string datafiles without emitting state events", function () {
    const diagnostics: any[] = [];
    const events: string[] = [];
    const m = createMessagevisor({
      logLevel: "error",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    m.on("datafile_set", () => events.push("datafile"));
    m.setDatafile({ schemaVersion: "1" } as any);
    m.setDatafile("{not json");

    expect(m.getLocale()).toEqual(null);
    expect(events).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "invalid_datafile", level: "error" }),
      expect.objectContaining({ code: "invalid_datafile", level: "error" }),
    ]);
  });

  it("does not switch the active locale when setDatafile receives another locale later", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const events: any[] = [];

    m.on("datafile_set", (event) => events.push(event));
    m.setDatafile({
      ...datafile,
      revision: "2",
      locale: "nl-NL",
      translations: { hello: "Hallo" },
    });

    expect(m.getLocale()).toEqual("en-US");
    expect(m.translate("hello")).toEqual("Hello");
    expect(m.getDatafile("nl-NL").translations.hello).toEqual("Hallo");
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: "datafile_set",
        locale: "en-US",
        previousLocale: "en-US",
      }),
    );
  });

  it("emits ordered change events for repeated state updates even when values are unchanged", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const changeEvents: any[] = [];
    const detailedEvents: any[] = [];

    m.on("change", (event) => changeEvents.push(event));
    m.on("currency_set", (event) => detailedEvents.push(event));
    m.on("timeZone_set", (event) => detailedEvents.push(event));
    m.on("context_set", (event) => detailedEvents.push(event));
    m.setCurrency("EUR");
    m.setCurrency("EUR");
    m.setTimeZone("UTC");
    m.setContext({ plan: "pro" });

    expect(changeEvents.map((event) => event.type)).toEqual([
      "change",
      "change",
      "change",
      "change",
    ]);
    expect(changeEvents.map((event) => event.version)).toEqual([2, 3, 4, 5]);
    expect(detailedEvents.map((event) => event.type)).toEqual([
      "currency_set",
      "currency_set",
      "timeZone_set",
      "context_set",
    ]);
    expect(detailedEvents.map((event) => event.version)).toEqual([2, 3, 4, 5]);
    expect(detailedEvents[1].previousCurrency).toEqual("EUR");
    expect(detailedEvents[3].previousSnapshot.context).toEqual({});
    expect(detailedEvents[3].snapshot.context).toEqual({ plan: "pro" });
  });

  it("keeps constructor locale usable with defaults before a datafile arrives", function () {
    const m = createMessagevisor({
      locale: "en-US",
      defaultTranslations: {
        "en-US": {
          hello: "Fallback hello",
        },
      },
      defaultFormats: {
        "en-US": {
          number: {
            precise: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
          },
        },
      },
      logLevel: "fatal",
    });

    expect(m.getLocale()).toEqual("en-US");
    expect(m.getDefaultTranslations()).toEqual({ hello: "Fallback hello" });
    expect(m.getDefaultFormats()).toEqual({
      number: { precise: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    });
    expect(m.translate("hello")).toEqual("Fallback hello");
    expect(m.formatNumber(12, "precise")).toEqual("12.00");
    expect(() => m.getDatafile()).toThrow("Datafile not found for locale: en-US");
    expect(() => m.setLocale("nl-NL")).toThrow("Datafile not found for locale: nl-NL");

    m.setDatafile({
      ...datafile,
      formats: {
        number: {
          precise: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
        },
      },
    });

    expect(m.getDatafile().locale).toEqual("en-US");
    expect(m.translate("hello")).toEqual("Hello");
    expect(m.formatNumber(12.34, "precise")).toEqual("12");
  });

  it("documents that context accessors isolate only top-level properties", function () {
    const m = createMessagevisor({
      datafile,
      context: { account: { plan: "free" }, flags: ["a"] },
      logLevel: "fatal",
    });

    const context = m.getContext();
    context.account = { plan: "pro" } as any;
    expect(m.getContext()).toEqual({ account: { plan: "free" }, flags: ["a"] });

    const nested = m.getContext();
    (nested.account as any).plan = "enterprise";
    expect(m.getContext()).toEqual({ account: { plan: "enterprise" }, flags: ["a"] });
  });
});
