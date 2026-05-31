import type { Messagevisor } from "@messagevisor/sdk";
import type { App, Plugin } from "vue";

import {
  MessagevisorInjectionKey,
  type MessagevisorProviderModule,
  type VueRichTextElementHandler,
} from "./MessagevisorContext";
import { createMessagevisorApi, type MessagevisorApi } from "./api";

export interface MessagevisorProviderOptions {
  instance: Messagevisor;
  defaultRichTextElements?: Record<string, VueRichTextElementHandler>;
  wrapRichTextChunksInFragment?: boolean;
  modules?: MessagevisorProviderModule[];
}

export function createMessagevisorProvider(options: MessagevisorProviderOptions): Plugin {
  return {
    install(app: App) {
      const context = {
        instance: options.instance,
        defaultRichTextElements: options.defaultRichTextElements || {},
        wrapRichTextChunksInFragment: options.wrapRichTextChunksInFragment ?? true,
        modules: options.modules || [],
      };
      const api = createMessagevisorApi(context);

      app.provide(MessagevisorInjectionKey, context);
      app.config.globalProperties.$messagevisor = api;
      app.config.globalProperties.$m = api;
      app.config.globalProperties.$t = api.t;
    },
  };
}

declare module "vue" {
  interface ComponentCustomProperties {
    $messagevisor: MessagevisorApi;
    $m: MessagevisorApi;
    $t: MessagevisorApi["t"];
  }
}
