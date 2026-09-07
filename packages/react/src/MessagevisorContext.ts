import * as React from "react";

import type { MessagevisorConsumer, MessagevisorTranslationSource } from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";

export type RichTextElementHandler = (chunks: React.ReactNode[]) => React.ReactNode;

export interface MessagevisorProviderModule {
  name?: string;
  transform?: (payload: {
    translation: React.ReactNode;
    locale: string;
    source: MessagevisorTranslationSource;
    messageKey?: MessageKey;
  }) => React.ReactNode | void;
}

export interface MessagevisorReactContextValue {
  instance: MessagevisorConsumer;
  defaultRichTextElements: Record<string, RichTextElementHandler>;
  wrapRichTextChunksInFragment: boolean;
  modules: MessagevisorProviderModule[];
  textComponent?: React.ElementType;
}

export const MessagevisorContext = React.createContext<MessagevisorReactContextValue | undefined>(
  undefined,
);
