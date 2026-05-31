import { computed } from "vue";

import { createMessagevisorApi } from "./api";
import { useMessagevisorContextValue } from "./useSdk";

export function useMessagevisor() {
  const context = useMessagevisorContextValue();

  return computed(() => createMessagevisorApi(context)).value;
}
