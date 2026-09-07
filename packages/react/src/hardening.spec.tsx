import * as React from "react";
import { render } from "@testing-library/react";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import { MessagevisorProvider } from "./MessagevisorProvider";
import { useMessagevisor } from "./useMessagevisor";
import { useTranslation } from "./useReactiveMessagevisor";
import { datafile } from "./testUtils";

test.each(["imperative", "reactive"])("%s rich translation selects and diagnoses once", (mode) => {
  const diagnostics: any[] = [];
  const resolveFlag = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const instance = createMessagevisor({
    datafile: {
      ...datafile,
      translations: { selected: "<em>base</em>" },
      messages: {
        selected: {
          deprecated: true,
          overrides: [
            {
              key: "flag",
              conditions: { feature: "flag", operator: "isEnabled" },
              translation: "<strong>selected</strong>",
            },
          ],
        },
      },
    },
    resolveFlag,
    logLevel: "debug",
    onDiagnostic: (d) => diagnostics.push(d),
    modules: [createICUModule({ ignoreTags: false })],
  });
  function Imperative() {
    return <>{useMessagevisor().t("selected", {})}</>;
  }
  function Reactive() {
    return <>{useTranslation("selected", {})}</>;
  }
  const view = render(
    <MessagevisorProvider
      instance={instance}
      defaultRichTextElements={{
        strong: (chunks) => <strong>{chunks}</strong>,
        em: (chunks) => <em>{chunks}</em>,
      }}
    >
      {mode === "imperative" ? <Imperative /> : <Reactive />}
    </MessagevisorProvider>,
  );
  expect(view.container.querySelector("strong")?.textContent).toBe("selected");
  expect(resolveFlag).toHaveBeenCalledTimes(1);
  expect(diagnostics.filter((d) => d.code === "message_override_matched")).toHaveLength(1);
  expect(diagnostics.filter((d) => d.code === "deprecated_message")).toHaveLength(1);
});
