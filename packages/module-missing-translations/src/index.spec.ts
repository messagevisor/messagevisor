import { createMessagevisor } from "@messagevisor/sdk";
import type { DatafileContent } from "@messagevisor/types";

import { createMissingTranslationsModule, type MissingTranslationPayload } from "./index";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "rev-1",
  target: "web",
  locale: "en-US",
  segments: {},
  messages: {
    greeting: {},
  },
  translations: {
    greeting: "Hello",
  },
};

describe("@messagevisor/module-missing-translations", function () {
  it("calls the handler when a translation is missing", function () {
    const calls: MissingTranslationPayload[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        createMissingTranslationsModule({
          handler(payload) {
            calls.push(payload);
          },
        }),
      ],
    });

    expect(m.translate("missing.key")).toEqual("missing.key");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      messageKey: "missing.key",
      locale: "en-US",
      revision: "rev-1",
      source: "translation",
      diagnostic: {
        code: "missing_translation",
        level: "error",
        details: {
          messageKey: "missing.key",
          locale: "en-US",
          source: "translation",
        },
      },
    });
  });

  it("does not call the handler for non-missing diagnostics or successful translations", function () {
    const calls: MissingTranslationPayload[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        createMissingTranslationsModule({
          handler(payload) {
            calls.push(payload);
          },
        }),
      ],
    });

    expect(m.translate("greeting")).toEqual("Hello");
    expect(calls).toEqual([]);
  });

  it("calls the handler every time by default", function () {
    const calls: MissingTranslationPayload[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        createMissingTranslationsModule({
          handler(payload) {
            calls.push(payload);
          },
        }),
      ],
    });

    m.translate("missing.key");
    m.translate("missing.key");

    expect(calls.map((call) => call.messageKey)).toEqual(["missing.key", "missing.key"]);
  });

  it("dedupes repeated missing translations when enabled", function () {
    const calls: MissingTranslationPayload[] = [];
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [
        createMissingTranslationsModule({
          dedupe: true,
          handler(payload) {
            calls.push(payload);
          },
        }),
      ],
    });

    m.translate("missing.key");
    m.translate("missing.key");
    m.getRawTranslation("missing.key");
    m.translate("another.missing");

    expect(calls.map((call) => call.messageKey)).toEqual(["missing.key", "another.missing"]);
  });

  it("requires a handler", function () {
    expect(() =>
      createMessagevisor({
        datafile,
        logLevel: "fatal",
        modules: [createMissingTranslationsModule({} as any)],
      }),
    ).toThrow("Missing translations module requires a handler.");
  });

  it("uses a stable default module name and supports custom names", function () {
    expect(createMissingTranslationsModule({ handler() {} }).name).toEqual("missing-translations");
    expect(createMissingTranslationsModule({ name: "tracker", handler() {} }).name).toEqual(
      "tracker",
    );
  });
});
