import type { Messagevisor } from "@messagevisor/sdk";
import { defineComponent, Fragment, h, provide, type PropType } from "vue";

import {
  MessagevisorInjectionKey,
  type MessagevisorProviderModule,
  type VueRichTextElementHandler,
} from "./MessagevisorContext";

export const MessagevisorProvider = defineComponent({
  name: "MessagevisorProvider",
  props: {
    instance: {
      type: Object as PropType<Messagevisor>,
      required: true,
    },
    defaultRichTextElements: {
      type: Object as PropType<Record<string, VueRichTextElementHandler>>,
      default: () => ({}),
    },
    wrapRichTextChunksInFragment: {
      type: Boolean,
      default: true,
    },
    modules: {
      type: Array as PropType<MessagevisorProviderModule[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    provide(MessagevisorInjectionKey, {
      get instance() {
        return props.instance;
      },
      get defaultRichTextElements() {
        return props.defaultRichTextElements;
      },
      get wrapRichTextChunksInFragment() {
        return props.wrapRichTextChunksInFragment;
      },
      get modules() {
        return props.modules;
      },
    });

    return () => h(Fragment, null, slots.default?.());
  },
});
