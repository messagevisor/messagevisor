import { createMessagevisor, type MessagevisorModuleApi } from "./index";

const quiet = { locale: "en", logLevel: "debug" as const, onDiagnostic: () => {} };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("module cleanup ownership", () => {
  test.each([false, true])(
    "a setup diagnostic observer can close while cleanup is pending, failure=%s",
    async (fails) => {
      const gate = deferred();
      const failure = new Error("cleanup failed");
      let observedClose: Promise<void> | undefined;
      let completed = false;
      const m = createMessagevisor({
        ...quiet,
        onDiagnostic(d) {
          if (d.code === "module_setup_error") {
            observedClose = m.close();
            void observedClose.then(
              () => {
                completed = true;
              },
              () => {
                completed = true;
              },
            );
          }
        },
      });
      m.addModule({
        name: "broken",
        setup() {
          throw new Error("setup failed");
        },
        async close() {
          await gate.promise;
          if (fails) throw failure;
        },
      });
      expect(observedClose).toBeDefined();
      await Promise.resolve();
      await Promise.resolve();
      expect(completed).toBe(false);
      gate.resolve();
      if (fails) await expect(observedClose).rejects.toMatchObject({ errors: [failure] });
      else await expect(observedClose).resolves.toBeUndefined();
    },
  );

  test.each([false, true])(
    "reentrant close observes the same cleanup result, failure=%s",
    async (fails) => {
      const gate = deferred();
      const failure = new Error("cleanup failed");
      const m = createMessagevisor(quiet);
      let reentrant: Promise<void> | undefined;
      let completed = false;
      m.addModule({
        name: "reentrant",
        async close() {
          reentrant = m.close();
          void reentrant.then(
            () => {
              completed = true;
            },
            () => {
              completed = true;
            },
          );
          await gate.promise;
          if (fails) throw failure;
        },
      });
      const closing = m.close();
      const results = Promise.allSettled([closing, reentrant!]);
      expect(reentrant).toBeDefined();
      await Promise.resolve();
      await Promise.resolve();
      expect(completed).toBe(false);
      gate.resolve();
      for (const result of await results) {
        expect(result.status).toBe(fails ? "rejected" : "fulfilled");
        if (result.status === "rejected") expect(result.reason.errors).toEqual([failure]);
      }
    },
  );

  test.each([false, true])(
    "close awaits failed setup cleanup, including failure=%s",
    async (fails) => {
      const gate = deferred();
      const failure = new Error("cleanup failed");
      const diagnostics: string[] = [];
      const cleanup = jest.fn(async () => {
        await gate.promise;
        if (fails) throw failure;
      });
      const m = createMessagevisor({
        ...quiet,
        onDiagnostic: (d) => diagnostics.push(d.code),
        modules: [
          {
            name: "broken",
            setup() {
              throw new Error("setup failed");
            },
            close: cleanup,
          },
        ],
      });
      const healthyCleanup = jest.fn();
      m.addModule({ name: "healthy", close: healthyCleanup });
      let completed = false;
      const first = m.close();
      const second = m.close();
      // Observe both rejections immediately, just as consumers awaiting shutdown would.
      const outcomes = Promise.allSettled([first, second]);
      void outcomes.then(() => {
        completed = true;
      });
      await Promise.resolve();
      expect(completed).toBe(false);
      expect(healthyCleanup).toHaveBeenCalledTimes(1);
      gate.resolve();
      const results = await outcomes;
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(diagnostics.filter((code) => code === "module_setup_error")).toHaveLength(1);
      for (const result of results) {
        expect(result.status).toBe(fails ? "rejected" : "fulfilled");
        if (result.status === "rejected") expect(result.reason.errors).toEqual([failure]);
      }
      if (fails) {
        expect(diagnostics.filter((code) => code === "module_close_error")).toHaveLength(1);
        await expect(m.close()).rejects.toMatchObject({ errors: [failure] });
      } else {
        await expect(m.close()).resolves.toBeUndefined();
      }
    },
  );

  it("retains already settled setup cleanup failures and still closes healthy modules", async () => {
    const failure = new Error("failed cleanup");
    const close = jest.fn();
    const m = createMessagevisor(quiet);
    m.addModule({
      name: "bad",
      setup() {
        throw new Error("bad setup");
      },
      async close() {
        throw failure;
      },
    });
    m.addModule({ name: "healthy", close });
    await Promise.resolve();
    await Promise.resolve();
    await expect(m.close()).rejects.toMatchObject({ errors: [failure] });
    expect(close).toHaveBeenCalledTimes(1);
  });

  test.each(["name", "unsubscribe", "close"])(
    "%s invalidates root and child evaluation APIs",
    async (method) => {
      const apis: MessagevisorModuleApi[] = [];
      const diagnostics = jest.fn();
      const close = jest.fn();
      const m = createMessagevisor(quiet);
      const remove = m.addModule({
        name: "observer",
        transform(_payload, api) {
          if (!api) throw new Error("Missing module API");
          if (!apis.includes(api)) {
            apis.push(api);
            api.onDiagnostic(diagnostics);
            api.setFlagResolver(() => true);
          }
        },
        close,
      });
      const children = [m.spawn(), m.spawn()];
      for (const instance of [m, ...children]) instance.formatMessage("hello");
      expect(apis).toHaveLength(3);
      children[0].translate("missing-before");
      expect(diagnostics).toHaveBeenCalled();
      if (method === "name") await m.removeModule("observer");
      else if (method === "unsubscribe") await remove();
      else await m.close();
      diagnostics.mockClear();
      for (const api of apis) {
        api.onDiagnostic(diagnostics);
        api.setFlagResolver(() => true);
        api.reportDiagnostic({ level: "error", code: "stale", message: "stale API" });
      }
      for (const child of children) child.translate("missing-after");
      expect(diagnostics).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
      await remove();
      expect(close).toHaveBeenCalledTimes(1);
      if (method !== "close") {
        const replacement = jest.fn();
        m.addModule({
          name: "observer",
          setup(api) {
            api.onDiagnostic(replacement);
          },
        });
        // The stale API must not replace or unsubscribe a new registration with the same name.
        for (const api of apis) api.onDiagnostic(diagnostics);
        m.translate("new-registration");
        expect(replacement).toHaveBeenCalled();
        expect(diagnostics).not.toHaveBeenCalled();
      }
      await Promise.all(children.map((child) => child.close()));
      await m.close();
    },
  );

  it("closing a child invalidates only its APIs and does not close shared modules", async () => {
    const apis: MessagevisorModuleApi[] = [];
    const callback = jest.fn();
    const close = jest.fn();
    const m = createMessagevisor({
      ...quiet,
      modules: [
        {
          name: "shared",
          close,
          transform(_payload, api) {
            if (!api) throw new Error("Missing module API");
            if (!apis.includes(api)) {
              apis.push(api);
              api.onDiagnostic(callback);
            }
          },
        },
      ],
    });
    const child = m.spawn();
    child.formatMessage("child");
    m.formatMessage("root");
    await child.close();
    apis[0].onDiagnostic(callback);
    apis[0].reportDiagnostic({ level: "error", code: "stale", message: "stale child" });
    expect(callback).not.toHaveBeenCalled();
    m.translate("root-still-active");
    expect(callback).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await m.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("removal clears child resolver registrations and prevents stale APIs restoring them", async () => {
    const apis: MessagevisorModuleApi[] = [];
    const m = createMessagevisor({
      ...quiet,
      resolveFlag: () => false,
      resolveVariation: () => "control",
      datafile: {
        schemaVersion: "1",
        messagevisorVersion: "test",
        revision: "1",
        locale: "en",
        target: "web",
        segments: {},
        translations: { flag: "base", variation: "base" },
        messages: {
          flag: {
            overrides: [
              {
                key: "enabled",
                conditions: { feature: "flag", operator: "isEnabled" },
                translation: "enabled",
              },
            ],
          },
          variation: {
            overrides: [
              {
                key: "variant",
                conditions: {
                  experiment: "experiment",
                  operator: "hasVariation",
                  value: "variant",
                },
                translation: "variant",
              },
            ],
          },
        },
      },
      modules: [
        {
          name: "resolvers",
          transform(_payload, api) {
            if (!api) throw new Error("Missing module API");
            if (!apis.includes(api)) {
              apis.push(api);
              api.setFlagResolver(() => true);
              api.setVariationResolver(() => "variant");
            }
          },
        },
      ],
    });
    const child = m.spawn();
    child.formatMessage("initialise evaluation API");
    expect(child.getRawTranslation("flag")).toBe("enabled");
    expect(child.getRawTranslation("variation")).toBe("variant");
    await m.removeModule("resolvers");
    apis[0].setFlagResolver(() => true);
    apis[0].setVariationResolver(() => "variant");
    expect(child.getRawTranslation("flag")).toBe("base");
    expect(child.getRawTranslation("variation")).toBe("base");
    await child.close();
    await m.close();
  });
});
