import * as React from "react";

import type { Messagevisor } from "@messagevisor/sdk";

import {
  MessagevisorContext,
  type MessagevisorProviderModule,
  type RichTextElementHandler,
} from "./MessagevisorContext";

export interface MessagevisorProviderProps {
  instance: Messagevisor;
  children: React.ReactNode;
  defaultRichTextElements?: Record<string, RichTextElementHandler>;
  wrapRichTextChunksInFragment?: boolean;
  modules?: MessagevisorProviderModule[];
  textComponent?: React.ElementType;
}

export function MessagevisorProvider(props: MessagevisorProviderProps) {
  const value = React.useMemo(
    () => ({
      instance: props.instance,
      defaultRichTextElements: props.defaultRichTextElements || {},
      wrapRichTextChunksInFragment: props.wrapRichTextChunksInFragment ?? true,
      modules: props.modules || [],
      textComponent: props.textComponent,
    }),
    [
      props.instance,
      props.defaultRichTextElements,
      props.wrapRichTextChunksInFragment,
      props.modules,
      props.textComponent,
    ],
  );

  return (
    <MessagevisorContext.Provider value={value}>{props.children}</MessagevisorContext.Provider>
  );
}
