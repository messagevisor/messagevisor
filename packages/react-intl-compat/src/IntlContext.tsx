import * as React from "react";

import { MessagevisorContext, useMessagevisorSnapshot } from "@messagevisor/react";

import type { IntlShape } from "./intl";
import { createIntlFromMessagevisor } from "./intl";

export function useIntl() {
  const context = React.useContext(MessagevisorContext);

  if (!context) {
    throw new Error("useIntl must be used within MessagevisorProvider.");
  }

  const snapshot = useMessagevisorSnapshot();

  return React.useMemo(
    function getIntlShape(): IntlShape {
      return createIntlFromMessagevisor(context.instance);
    },
    [context.instance, snapshot.version],
  );
}
