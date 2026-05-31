import type { Messagevisor, MessagevisorTranslationSource } from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";
import type { InjectionKey, VNodeChild } from "vue";

export type VueMessageChunk = VNodeChild;
export type VueRichTextElementHandler = (
  chunks: Array<string | VueMessageChunk>,
) => VueMessageChunk;

export interface MessagevisorProviderModule {
  name?: string;
  transform?: (payload: {
    translation: VueMessageChunk;
    locale: string;
    source: MessagevisorTranslationSource;
    messageKey?: MessageKey;
  }) => VueMessageChunk | void;
}

export interface MessagevisorVueContextValue {
  instance: Messagevisor;
  defaultRichTextElements: Record<string, VueRichTextElementHandler>;
  wrapRichTextChunksInFragment: boolean;
  modules: MessagevisorProviderModule[];
}

export const MessagevisorInjectionKey: InjectionKey<MessagevisorVueContextValue> =
  Symbol("Messagevisor");
