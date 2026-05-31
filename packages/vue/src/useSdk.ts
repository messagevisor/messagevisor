import { inject } from "vue";

import { MessagevisorInjectionKey } from "./MessagevisorContext";

export function useMessagevisorContextValue() {
  const context = inject(MessagevisorInjectionKey);

  if (!context) {
    throw new Error(
      "useSdk must be used within MessagevisorProvider or createMessagevisorProvider().",
    );
  }

  return context;
}

export function useSdk() {
  return useMessagevisorContextValue().instance;
}
