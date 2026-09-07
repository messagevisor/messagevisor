import * as React from "react";
import { render } from "@testing-library/react";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import {
  MessagevisorProvider,
  useMessagevisor,
  useSdk,
  useTranslation,
  useFormatMessage,
} from "./index";

describe.each([false, true])("provider consumer child=%s", (child) => {
  test.each(["imperative translation", "imperative raw", "reactive translation", "reactive raw"])(
    "%s reports the per call locale without mutating consumer state",
    async (mode) => {
      const root = createMessagevisor({
        locale: "en",
        onDiagnostic: () => {},
        modules: [createICUModule({ ignoreTags: false })],
        defaultTranslations: {
          en: { hi: "<strong>Hello {name}</strong>" },
          nl: { hi: "<strong>Hallo {name}</strong>" },
        },
      });
      const instance = child ? root.spawn() : root;
      const transform = jest.fn(({ translation }) => translation);
      const values = { name: "Ada" };
      const options = { locale: "nl" };
      function Imperative() {
        const api = useMessagevisor();
        expect(api).not.toHaveProperty("setDatafile");
        expect(useSdk()).toBe(instance);
        return (
          <>
            {mode.endsWith("raw")
              ? api.formatMessage("<strong>Hallo {name}</strong>", values, options)
              : api.t("hi", values, options)}
          </>
        );
      }
      function ReactiveTranslation() {
        return <>{useTranslation("hi", values, options)}</>;
      }
      function ReactiveRaw() {
        return <>{useFormatMessage("<strong>Hallo {name}</strong>", values, options)}</>;
      }
      const view = render(
        <MessagevisorProvider
          instance={instance}
          modules={[{ transform }]}
          defaultRichTextElements={{ strong: (chunks) => <strong>{chunks}</strong> }}
        >
          {mode.startsWith("imperative") ? (
            <Imperative />
          ) : mode.endsWith("raw") ? (
            <ReactiveRaw />
          ) : (
            <ReactiveTranslation />
          )}
        </MessagevisorProvider>,
      );
      expect(view.container.querySelector("strong")?.textContent).toBe("Hallo Ada");
      expect(transform).toHaveBeenCalledTimes(1);
      expect(transform.mock.calls[0][0]).toMatchObject({
        locale: "nl",
        source: mode.endsWith("raw") ? "formatMessage" : "translation",
        ...(mode.endsWith("raw") ? {} : { messageKey: "hi" }),
      });
      expect(instance.getLocale()).toBe("en");
      expect(root.getLocale()).toBe("en");
      view.unmount();
      await instance.close();
      await root.close();
    },
  );
});

test.each([undefined, ""])(
  "provider transforms use the child's locale when call locale is %s",
  async (locale) => {
    const root = createMessagevisor({ locale: "en", onDiagnostic: () => {} });
    const child = root.spawn({}, { locale: "nl" });
    const transform = jest.fn(({ translation }) => translation);
    function Consumer() {
      return <>{useMessagevisor().formatMessage("Hallo", {}, { locale })}</>;
    }
    const view = render(
      <MessagevisorProvider instance={child} modules={[{ transform }]}>
        <Consumer />
      </MessagevisorProvider>,
    );
    expect(transform.mock.calls[0][0]).toMatchObject({ locale: "nl" });
    expect(root.getLocale()).toBe("en");
    view.unmount();
    await child.close();
    await root.close();
  },
);

it("runs transforms for an explicit locale even without an active instance locale", async () => {
  const m = createMessagevisor({ onDiagnostic: () => {} });
  const transform = jest.fn(({ translation }) => translation);
  function Consumer() {
    return <>{useMessagevisor().formatMessage("Hallo", {}, { locale: "nl" })}</>;
  }
  const view = render(
    <MessagevisorProvider instance={m} modules={[{ transform }]}>
      <Consumer />
    </MessagevisorProvider>,
  );
  expect(transform.mock.calls[0][0]).toMatchObject({ locale: "nl" });
  expect(m.getLocale()).toBeNull();
  view.unmount();
  await m.close();
});

it("captures the evaluation locale before SDK transforms can change instance state", async () => {
  const m = createMessagevisor({ locale: "en", onDiagnostic: () => {} });
  m.setDatafile({
    schemaVersion: "1",
    messagevisorVersion: "test",
    revision: "1",
    target: "web",
    locale: "nl",
    segments: {},
    messages: {},
    translations: {},
  });
  m.addModule({
    transform() {
      m.setLocale("nl");
    },
  });
  const transform = jest.fn(({ translation }) => translation);
  function Consumer() {
    return <>{useMessagevisor().formatMessage("Hello")}</>;
  }
  const view = render(
    <MessagevisorProvider instance={m} modules={[{ transform }]}>
      <Consumer />
    </MessagevisorProvider>,
  );
  expect(m.getLocale()).toBe("nl");
  expect(transform.mock.calls[0][0]).toMatchObject({ locale: "en" });
  view.unmount();
  await m.close();
});
