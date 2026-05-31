import type { EvaluationOptions, MessageValues, TranslateOptions } from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";
import { defineComponent, h, type PropType } from "vue";

import type { VueMessageChunk } from "./MessagevisorContext";
import { createRichTextTools, resolveRecord, type VueMessageValues } from "./richText";
import { useMessagevisorContextValue } from "./useSdk";

function getSlotValues(slots: Record<string, any>) {
  return Object.fromEntries(
    Object.keys(slots)
      .filter((key) => key !== "default")
      .map((key) => [key, (chunks: Array<string | VueMessageChunk>) => slots[key]?.({ chunks })]),
  ) as VueMessageValues;
}

export const MessageTranslation = defineComponent({
  name: "MessageTranslation",
  inheritAttrs: false,
  props: {
    messageKey: {
      type: String as PropType<MessageKey>,
      required: true,
    },
    values: {
      type: Object as PropType<VueMessageValues>,
      default: undefined,
    },
    options: {
      type: Object as PropType<TranslateOptions>,
      default: undefined,
    },
    tag: {
      type: [String, Object] as PropType<string | object | false>,
      default: undefined,
    },
  },
  setup(props, { attrs, slots }) {
    const context = useMessagevisorContextValue();
    const richText = createRichTextTools(context);

    return () => {
      const message = context.instance.getRawTranslation(props.messageKey, props.options);
      const values = {
        ...(resolveRecord(props.values) || {}),
        ...getSlotValues(slots),
      };
      const translation = context.instance.translate<VueMessageChunk>(
        props.messageKey,
        richText.mergeValues(values, message) as MessageValues<VueMessageChunk>,
        props.options,
      );

      const result = richText.wrapResult(
        richText.runModules(translation, {
          source: "translation",
          messageKey: props.messageKey,
        }),
      );

      return props.tag ? h(props.tag as string, attrs, result as any) : result;
    };
  },
});

export const FormatMessage = defineComponent({
  name: "FormatMessage",
  inheritAttrs: false,
  props: {
    message: {
      type: String,
      required: true,
    },
    values: {
      type: Object as PropType<VueMessageValues>,
      default: undefined,
    },
    options: {
      type: Object as PropType<EvaluationOptions>,
      default: undefined,
    },
    tag: {
      type: [String, Object] as PropType<string | object | false>,
      default: undefined,
    },
  },
  setup(props, { attrs, slots }) {
    const context = useMessagevisorContextValue();
    const richText = createRichTextTools(context);

    return () => {
      const values = {
        ...(resolveRecord(props.values) || {}),
        ...getSlotValues(slots),
      };
      const translation = context.instance.formatMessage<VueMessageChunk>(
        props.message,
        richText.mergeValues(values, props.message) as MessageValues<VueMessageChunk>,
        props.options,
      );

      const result = richText.wrapResult(
        richText.runModules(translation, {
          source: "formatMessage",
        }),
      );

      return props.tag ? h(props.tag as string, attrs, result as any) : result;
    };
  },
});
