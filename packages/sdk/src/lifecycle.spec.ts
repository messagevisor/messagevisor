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

  it("rejects failed module setup, reports it, and closes partial module resources", async function () {
    const diagnostics: any[] = [];
    const calls: string[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "error",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    m.addModule({
      name: "broken",
      setup() {
        calls.push("setup");
        throw new Error("boom");
      },
      transform() {
        calls.push("transform");
      },
      close() {
        calls.push("close");
      },
    });

    await Promise.resolve();
    expect(m.translate("hello")).toEqual("Hello");
    expect(calls).toEqual(["setup", "close"]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "module_setup_error", moduleName: "broken" }),
    ]);
  });

  it("isolates throwing event and diagnostic handlers", function () {
    const m = createMessagevisor({
      datafile,
      logLevel: "error",
      onDiagnostic() {
        throw new Error("diagnostic observer");
      },
    });
    const calls: string[] = [];
    m.on("context_set", () => {
      calls.push("first");
      throw new Error("listener");
    });
    m.on("context_set", () => calls.push("second"));

    expect(() => m.setContext({ plan: "pro" })).not.toThrow();
    expect(calls).toEqual(["first", "second"]);
    expect(() => m.translate("missing")).not.toThrow();
  });

  it("spawns request-local state while sharing parent datafiles and modules", function () {
    const parent = createMessagevisor({
      datafile,
      context: { tenant: "parent", shared: "parent" },
      modules: [{ transform: ({ translation }) => `${translation}!` }],
      logLevel: "fatal",
    });
    const child = parent.spawn({ tenant: "child" }, { currency: "EUR" });

    expect(child.getContext()).toEqual({ tenant: "child", shared: "parent" });
    expect(child.getCurrency()).toEqual("EUR");
    expect(child.translate("hello")).toEqual("Hello!");

    parent.setDatafile({ ...datafile, revision: "2", translations: { hello: "Updated" } }, true);
    expect(child.translate("hello")).toEqual("Updated!");
    expect(parent.getContext()).toEqual({ tenant: "parent", shared: "parent" });
  });

  it("lets children observe shared parent datafiles and removes delegated subscriptions on close", async function () {
    const parent = createMessagevisor({ datafile, logLevel: "fatal" });
    const child = parent.spawn();
    const datafileEvents: string[] = [];
    const changeEvents: string[] = [];

    child.on("datafile_set", (event) => {
      datafileEvents.push(event.datafile.revision);
      expect(event.snapshot.context).toEqual({ plan: "pro" });
      expect(event.snapshot.version).toBe(2);
      expect(event.previousSnapshot.version).toBe(1);
    });
    child.on("change", (event) => changeEvents.push(event.source));

    child.setContext({ plan: "pro" });
    parent.setDatafile({ ...datafile, revision: "2" }, true);
    expect(datafileEvents).toEqual(["2"]);
    expect(changeEvents).toEqual(["context_set", "datafile_set"]);

    await child.close();
    parent.setDatafile({ ...datafile, revision: "3" }, true);
    expect(datafileEvents).toEqual(["2"]);
    expect(changeEvents).toEqual(["context_set", "datafile_set"]);
  });

  it("keeps child delegated unsubscriptions idempotent", function () {
    const parent = createMessagevisor({ datafile, logLevel: "fatal" });
    const child = parent.spawn();
    const revisions: string[] = [];
    const unsubscribe = child.on("datafile_set", (event) =>
      revisions.push(event.datafile.revision),
    );

    unsubscribe();
    unsubscribe();
    parent.setDatafile({ ...datafile, revision: "2" }, true);

    expect(revisions).toEqual([]);
  });

  it("closes a dynamically registered module only once when unsubscribe is repeated", async function () {
    const calls: string[] = [];
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const unsubscribe = m.addModule({
      name: "dynamic",
      close() {
        calls.push("close");
      },
    });

    await unsubscribe();
    await unsubscribe();

    expect(calls).toEqual(["close"]);
  });

  it("closes registered modules only once", async function () {
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
    await m.close();
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
        locale: "nl-NL",
        activeLocale: "en-US",
        previousLocale: "en-US",
      }),
    );
  });

  it("emits typed replacement details for datafile and context updates", function () {
    const m = createMessagevisor({ datafile, logLevel: "fatal" });
    const datafileEvents: boolean[] = [];
    const contextEvents: boolean[] = [];

    m.on("datafile_set", (event) => datafileEvents.push(event.replaced));
    m.on("context_set", (event) => contextEvents.push(event.replaced));
    m.setDatafile({ ...datafile, revision: "2" });
    m.setDatafile({ ...datafile, revision: "3" }, true);
    m.setContext({ plan: "free" });
    m.setContext({ plan: "pro" }, true);

    expect(datafileEvents).toEqual([false, true]);
    expect(contextEvents).toEqual([false, true]);
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
    expect(changeEvents.map((event) => event.source)).toEqual([
      "currency_set",
      "currency_set",
      "timeZone_set",
      "context_set",
    ]);
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
