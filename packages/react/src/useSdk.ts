import * as React from "react";

import type { MessagevisorConsumer } from "@messagevisor/sdk";

import { MessagevisorContext } from "./MessagevisorContext";

export function useSdk(): MessagevisorConsumer {
  const context = React.useContext(MessagevisorContext);

  if (!context) {
    throw new Error("useSdk must be used within MessagevisorProvider.");
  }

  return context.instance;
}
