import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import { MessagevisorProvider } from "./MessagevisorProvider";
import { useMessagevisor } from "./useMessagevisor";
import { useTranslation } from "./useReactiveMessagevisor";
import { MessageTranslation } from "./components";
import { enDatafile as datafile } from "./testUtils";

test.each(["imperative", "reactive", "component"])(
  "%s rich translation selects and diagnoses once",
  (mode) => {
    const diagnostics: any[] = [];
    const resolveFlag = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const instance = createMessagevisor({
      datafile: {
        ...datafile,
        translations: { selected: "<em>base</em>" },
        messages: {
          selected: {
            deprecated: true,
            overrides: [
              {
                key: "flag",
                conditions: { feature: "flag", operator: "isEnabled" },
                translation: "<strong>selected</strong>",
              },
            ],
          },
        },
      },
      resolveFlag,
      logLevel: "debug",
      onDiagnostic: (d) => diagnostics.push(d),
      modules: [createICUModule({ ignoreTags: false })],
    });
    const Child = defineComponent({
      setup() {
        const api = useMessagevisor();
        const reactive = mode === "reactive" ? useTranslation("selected", {}) : undefined;
        return () =>
          mode === "component"
            ? h(MessageTranslation, { messageKey: "selected" })
            : h("div", (reactive ? reactive.value : api.t("selected", {})) as any);
      },
    });
    const view = mount(MessagevisorProvider, {
      props: {
        instance,
        defaultRichTextElements: {
          strong: (chunks) => h("strong", chunks),
          em: (chunks) => h("em", chunks),
        },
      },
      slots: { default: () => h(Child) },
    });
    expect(view.find("strong").text()).toBe("selected");
    expect(resolveFlag).toHaveBeenCalledTimes(1);
    expect(diagnostics.filter((d) => d.code === "message_override_matched")).toHaveLength(1);
    expect(diagnostics.filter((d) => d.code === "deprecated_message")).toHaveLength(1);
  },
);
