import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { FormatMessage, MessageTranslation } from "./components";
import { createRichTestInstance } from "./testUtils";

describe("Vue components", function () {
  it("renders translations and raw formatted messages", function () {
    const m = createRichTestInstance();
    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: {
        default: () =>
          h("div", [
            h(MessageTranslation, {
              class: "translation",
              messageKey: "greeting",
              tag: "span",
              values: { name: "Ada" },
            }),
            h(FormatMessage, {
              class: "format",
              message: "Hi {name}",
              tag: "span",
              values: { name: "Grace" },
            }),
          ]),
      },
    });

    expect(wrapper.find(".translation").text()).toEqual("Hello Ada");
    expect(wrapper.find(".format").text()).toEqual("Hi Grace");
  });

  it("renders rich text with provider defaults", function () {
    const m = createRichTestInstance();
    const wrapper = mount(MessagevisorProvider, {
      props: {
        instance: m,
        defaultRichTextElements: {
          strong: (chunks) => h("strong", chunks),
          link: (chunks) => h("a", { href: "/terms" }, chunks),
        },
      },
      slots: {
        default: () =>
          h(MessageTranslation, {
            messageKey: "richTerms",
            values: { product: "Messagevisor" },
          }),
      },
    });

    expect(wrapper.find("a").attributes("href")).toEqual("/terms");
    expect(wrapper.find("a").text()).toEqual("terms");
    expect(wrapper.find("strong").text()).toEqual("Messagevisor");
    expect(wrapper.text()).toContain("Read our");
  });

  it("lets local rich text slots override provider defaults", function () {
    const m = createRichTestInstance();
    const Host = defineComponent({
      render() {
        return h(
          MessageTranslation,
          {
            messageKey: "richTerms",
            values: { product: "Messagevisor" },
          },
          {
            link: ({ chunks }: { chunks: any[] }) => h("button", { type: "button" }, chunks),
          },
        );
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: {
        instance: m,
        defaultRichTextElements: {
          strong: (chunks) => h("strong", chunks),
          link: (chunks) => h("a", { href: "/terms" }, chunks),
        },
      },
      slots: { default: () => h(Host) },
    });

    expect(wrapper.find("button").text()).toEqual("terms");
    expect(wrapper.find("a").exists()).toEqual(false);
    expect(wrapper.find("strong").text()).toEqual("Messagevisor");
  });

  it("runs provider modules for component output", function () {
    const m = createRichTestInstance();
    const wrapper = mount(MessagevisorProvider, {
      props: {
        instance: m,
        modules: [
          {
            transform({ translation }) {
              return typeof translation === "string" ? h("mark", translation) : undefined;
            },
          },
        ],
      },
      slots: {
        default: () =>
          h(FormatMessage, {
            message: "Hello {name}",
            values: { name: "Ada" },
          }),
      },
    });

    expect(wrapper.find("mark").text()).toEqual("Hello Ada");
  });

  it("can render without a wrapper when no tag is provided", function () {
    const m = createRichTestInstance();
    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: {
        default: () =>
          h(MessageTranslation, {
            messageKey: "greeting",
            values: { name: "Ada" },
          }),
      },
    });

    expect(wrapper.text()).toEqual("Hello Ada");
  });
});
