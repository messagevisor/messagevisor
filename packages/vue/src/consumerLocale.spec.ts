import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, nextTick, toRaw } from "vue";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import { createMessagevisorApi } from "./api";
import {
  MessagevisorProvider,
  createMessagevisorProvider,
  useMessagevisor,
  useSdk,
  useTranslation,
  useFormatMessage,
  MessageTranslation,
  FormatMessage,
} from "./index";

describe.each([false, true])("provider consumer child=%s", (child) => {
  test.each([
    "imperative translation",
    "imperative raw",
    "reactive translation",
    "reactive raw",
    "component translation",
    "component raw",
  ])("%s reports the effective locale without mutating consumer state", async (mode) => {
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
    const locale = ref("nl");
    const Consumer = defineComponent({
      setup() {
        const api = useMessagevisor();
        expect(api).not.toHaveProperty("setDatafile");
        expect(toRaw(useSdk())).toBe(instance);
        const values = { name: "Ada" };
        const message = "<strong>Hallo {name}</strong>";
        const reactive =
          mode === "reactive translation"
            ? useTranslation("hi", values, () => ({ locale: locale.value }))
            : mode === "reactive raw"
              ? useFormatMessage(message, values, () => ({ locale: locale.value }))
              : undefined;
        return () => {
          const options = { locale: locale.value };
          if (mode === "component translation")
            return h(MessageTranslation, { messageKey: "hi", values, options });
          if (mode === "component raw") return h(FormatMessage, { message, values, options });
          return h(
            "div",
            (reactive
              ? reactive.value
              : mode.endsWith("raw")
                ? api.formatMessage(message, values, options)
                : api.t("hi", values, options)) as any,
          );
        };
      },
    });
    const view = mount(MessagevisorProvider, {
      props: {
        instance,
        modules: [{ transform }],
        defaultRichTextElements: { strong: (chunks) => h("strong", chunks) },
      },
      slots: { default: () => h(Consumer) },
    });
    expect(view.find("strong").text()).toBe("Hallo Ada");
    expect(transform.mock.calls[0][0]).toMatchObject({
      locale: "nl",
      source: mode.endsWith("raw") ? "formatMessage" : "translation",
    });
    transform.mockClear();
    locale.value = "en";
    await nextTick();
    expect(transform.mock.calls.length).toBeGreaterThan(0);
    for (const [payload] of transform.mock.calls) expect(payload).toMatchObject({ locale: "en" });
    expect(instance.getLocale()).toBe("en");
    expect(root.getLocale()).toBe("en");
    view.unmount();
    await instance.close();
    await root.close();
  });
});

test.each([undefined, ""])(
  "plugin provider uses the child's locale when call locale is %s",
  async (locale) => {
    const root = createMessagevisor({ locale: "en", onDiagnostic: () => {} });
    const child = root.spawn({}, { locale: "nl" });
    const transform = jest.fn(({ translation }) => translation);
    const Consumer = defineComponent({
      setup() {
        const api = useMessagevisor();
        return () => h("div", api.formatMessage("Hallo", {}, { locale }));
      },
    });
    const view = mount(Consumer, {
      global: {
        plugins: [createMessagevisorProvider({ instance: child, modules: [{ transform }] })],
      },
    });
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
  const Consumer = defineComponent({
    setup() {
      const api = useMessagevisor();
      return () => h("div", api.formatMessage("Hallo", {}, { locale: "nl" }));
    },
  });
  const view = mount(Consumer, {
    global: { plugins: [createMessagevisorProvider({ instance: m, modules: [{ transform }] })] },
  });
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
  const api = createMessagevisorApi({
    instance: m,
    defaultRichTextElements: {},
    wrapRichTextChunksInFragment: true,
    modules: [{ transform }],
  });
  expect(api.formatMessage("Hello")).toBe("Hello");
  expect(m.getLocale()).toBe("nl");
  expect(transform.mock.calls[0][0]).toMatchObject({ locale: "en" });
  await m.close();
});
