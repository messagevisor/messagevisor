import type { MessagevisorSnapshot } from "@messagevisor/sdk";
import { computed, getCurrentScope, onScopeDispose, shallowRef, type ComputedRef } from "vue";

import { useSdk } from "./useSdk";

export function useMessagevisorSnapshot(): ComputedRef<MessagevisorSnapshot> {
  const sdk = useSdk();
  const snapshot = shallowRef(sdk.getSnapshot());
  const unsubscribe = sdk.subscribe(() => {
    snapshot.value = sdk.getSnapshot();
  });

  snapshot.value = sdk.getSnapshot();

  if (getCurrentScope()) {
    onScopeDispose(unsubscribe);
  }

  return computed(() => snapshot.value);
}
