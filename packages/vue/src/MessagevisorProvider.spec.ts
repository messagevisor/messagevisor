import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { createMessagevisorProvider } from "./createMessagevisorProvider";
import { useSdk } from "./useSdk";
import { createTestInstance, nlDatafile } from "./testUtils";

describe("MessagevisorProvider", function () {
  it("provides the SDK instance to descendants", function () {
    const m = createTestInstance();
    const Child = defineComponent({
      setup() {
        const sdk = useSdk();

        return () => h("p", sdk.translate("greeting", { name: "Ada" }));
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: { default: () => h(Child) },
    });

    expect(wrapper.text()).toEqual("Hello Ada");
  });

  it("throws a clear error when used without a provider or plugin", function () {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const Child = defineComponent({
      setup() {
        useSdk();

        return () => h("p", "never");
      },
    });

    expect(() => mount(Child)).toThrow(
      "useSdk must be used within MessagevisorProvider or createMessagevisorProvider().",
    );
    warn.mockRestore();
  });

  it("lets a subtree provider override the plugin instance", function () {
    const pluginInstance = createTestInstance();
    const providerInstance = createTestInstance();
    providerInstance.setDatafile(nlDatafile);
    providerInstance.setLocale("nl-NL");
    const Child = defineComponent({
      setup() {
        const sdk = useSdk();

        return () => h("p", sdk.translate("greeting", { name: "Ada" }));
      },
    });

    const wrapper = mount(
      defineComponent({
        render() {
          return h(MessagevisorProvider, { instance: providerInstance }, () => h(Child));
        },
      }),
      {
        global: {
          plugins: [createMessagevisorProvider({ instance: pluginInstance })],
        },
      },
    );

    expect(wrapper.text()).toEqual("Hallo Ada");
  });

  it("installs $messagevisor, $m, and $t globals", function () {
    const m = createTestInstance();
    const App = defineComponent({
      render() {
        return h("div", [
          h("p", { class: "long" }, this.$messagevisor.translate("greeting", { name: "Ada" })),
          h(
            "p",
            { class: "short" },
            this.$m.formatNumber(12, { style: "currency", currency: "EUR" }),
          ),
          h("p", { class: "t" }, this.$t("greeting", { name: "Grace" })),
        ]);
      },
    });

    const wrapper = mount(App, {
      global: {
        plugins: [createMessagevisorProvider({ instance: m })],
      },
    });

    expect(wrapper.find(".long").text()).toEqual("Hello Ada");
    expect(wrapper.find(".short").text()).toContain("€");
    expect(wrapper.find(".t").text()).toEqual("Hello Grace");
  });
});
