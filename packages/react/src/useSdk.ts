import * as React from "react";

import type { Messagevisor } from "@messagevisor/sdk";

import { MessagevisorContext } from "./MessagevisorContext";

export function useSdk(): Messagevisor {
  const context = React.useContext(MessagevisorContext);

  if (!context) {
    throw new Error("useSdk must be used within MessagevisorProvider.");
  }

  return context.instance;
}
