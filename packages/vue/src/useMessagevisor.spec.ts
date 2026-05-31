import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { useMessagevisor } from "./useMessagevisor";
import { createTestInstance } from "./testUtils";

describe("useMessagevisor", function () {
  it("returns imperative translation, formatting, and state APIs", function () {
    const m = createTestInstance();
    const calls: string[] = [];
    const Child = defineComponent({
      setup() {
        const api = useMessagevisor();

        calls.push(api.t("greeting", { name: "Ada" }));
        calls.push(api.translate("greeting", { name: "Grace" }));
        calls.push(api.formatMessage("Raw {name}", { name: "Lin" }));
        calls.push(api.formatNumber(12, { style: "currency", currency: "EUR" }));
        api.setContext({ plan: "pro" });
        calls.push(api.t("greeting", { name: "Ada" }));

        return () => h("p", calls.join("|"));
      },
    });

    mount(MessagevisorProvider, {
      props: { instance: m },
      slots: { default: () => h(Child) },
    });

    expect(calls[0]).toEqual("Hello Ada");
    expect(calls[1]).toEqual("Hello Grace");
    expect(calls[2]).toEqual("Raw Lin");
    expect(calls[3]).toContain("€");
    expect(calls[4]).toEqual("Welcome back, pro Ada");
  });

  it("runs provider modules after SDK formatting", function () {
    const m = createTestInstance();
    const Child = defineComponent({
      setup() {
        const { t, formatMessage } = useMessagevisor();

        return () =>
          h("p", [
            h("span", { class: "t" }, t("greeting", { name: "Ada" })),
            h("span", { class: "format" }, formatMessage("Hi {name}", { name: "Ada" })),
          ]);
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: {
        instance: m,
        modules: [
          {
            transform({ translation, source }) {
              return typeof translation === "string" ? `${source}:${translation}` : undefined;
            },
          },
        ],
      },
      slots: { default: () => h(Child) },
    });

    expect(wrapper.find(".t").text()).toEqual("translation:Hello Ada");
    expect(wrapper.find(".format").text()).toEqual("formatMessage:Hi Ada");
  });
});
