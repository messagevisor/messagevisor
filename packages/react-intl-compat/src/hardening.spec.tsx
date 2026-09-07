import * as React from "react";
import { act, render } from "@testing-library/react";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import { MessagevisorProvider } from "@messagevisor/react";
import { createIntlFromMessagevisor } from "./intl";
import { FormattedMessage, FormattedPlural } from "./components";

const quiet = { logLevel: "debug" as const, onDiagnostic: () => {} };

it("accepts a request scoped child in the factory and provider and observes parent datafile updates", async () => {
  const root = createMessagevisor({
    ...quiet,
    locale: "en",
    modules: [createICUModule()],
    defaultTranslations: { en: { hello: "Hello {name}" }, nl: { hello: "Hallo {name}" } },
  });
  const child = root.spawn({}, { locale: "nl" });
  const intl = createIntlFromMessagevisor(child);
  expect(intl.locale).toBe("nl");
  expect(intl.formatMessage({ id: "hello" }, { name: "Ada" })).toBe("Hallo Ada");
  const view = render(
    <MessagevisorProvider instance={child}>
      <FormattedMessage id="hello" values={{ name: "Ada" }} />
    </MessagevisorProvider>,
  );
  expect(view.container.textContent).toBe("Hallo Ada");
  act(() =>
    root.setDatafile({
      schemaVersion: "1",
      messagevisorVersion: "test",
      revision: "1",
      target: "web",
      locale: "nl",
      segments: {},
      messages: {},
      translations: { hello: "Dag {name}" },
    }),
  );
  expect(view.container.textContent).toBe("Dag Ada");
  expect(root.getLocale()).toBe("en");
  view.unmount();
  await child.close();
  await root.close();
});

it("makes compatibility configuration operational without mutating the SDK", () => {
  const sdk = createMessagevisor({ ...quiet, modules: [createICUModule()] });
  const snapshot = sdk.getSnapshot();
  const intl = createIntlFromMessagevisor(sdk, {
    locale: "en-GB",
    timeZone: "Pacific/Honolulu",
    messages: { hello: "Hello {name}", empty: "", constructor: "Own" },
    formats: {
      number: { money: { style: "currency", currency: "EUR" } },
      date: { year: { year: "numeric" } },
    },
  });
  expect(intl.formatMessage({ id: "hello" }, { name: "Ada" })).toBe("Hello Ada");
  expect(intl.formatMessage({ id: "empty", defaultMessage: "fallback" })).toBe("");
  expect(intl.formatMessage({ id: "constructor" })).toBe("Own");
  expect(intl.formatNumber(12, "money")).toBe("€12.00");
  expect(intl.formatNumber(12, "money", { currency: "USD" })).toBe("US$12.00");
  const value = "2026-01-01T00:30:00Z";
  expect(intl.formatDate(value, "year")).toBe("2025");
  expect(intl.formatDate(value, "year", { timeZone: "UTC" })).toBe("2026");
  expect(intl.formatDateToParts(value, "year")).toContainEqual({ type: "year", value: "2025" });
  expect(intl.formatTime(value)).toBe(
    sdk.formatTime(value, undefined, { locale: "en-GB", timeZone: "Pacific/Honolulu" }),
  );
  expect(
    intl
      .formatTimeToParts(value)
      .map((p) => p.value)
      .join(""),
  ).toBe(intl.formatTime(value));
  expect(
    intl
      .formatNumberToParts(12, "money")
      .map((p) => p.value)
      .join(""),
  ).toBe(intl.formatNumber(12, "money"));
  expect(intl.formatRelativeTime(-1, "day")).toBe("1 day ago");
  expect(intl.formatPlural(1)).toBe("one");
  expect(intl.formatList(["A", "B"])).toBe("A and B");
  expect(
    intl
      .formatListToParts(["A", "B"])
      .map((p) => p.value)
      .join(""),
  ).toBe("A and B");
  expect(intl.formatDisplayName("US", { type: "region" })).toBe("United States");
  expect(sdk.getSnapshot()).toEqual(snapshot);
});

it("uses explicit configuration before instance defaults and preserves per call format layering", () => {
  const sdk = createMessagevisor({
    ...quiet,
    locale: "en-US",
    defaultTranslations: { "en-US": { hello: "SDK" } },
    modules: [createICUModule()],
  });
  const intl = createIntlFromMessagevisor(sdk, {
    locale: "de-DE",
    messages: { hello: "Config" },
    formats: {
      number: {
        fixed: { minimumFractionDigits: 2, maximumFractionDigits: 3 },
        percent: { style: "percent" },
      },
    },
  });
  expect(intl.locale).toBe("de-DE");
  expect(intl.formatMessage({ id: "hello" })).toBe("Config");
  expect(
    intl.formatNumber(12, "fixed", {
      formats: { number: { fixed: { maximumFractionDigits: 2 } } },
    }),
  ).toBe("12,00");
  expect(
    intl.formatNumber(0.5, "percent", {
      formats: { number: { fixed: { maximumFractionDigits: 2 } } },
    }),
  ).toBe("50 %");
  expect(intl.formatNumber(12, "fixed", { locale: "en-US" })).toBe("12.00");
});

it("accepts valid unchanged ICU output and rich output without heuristic failure", () => {
  const sdk = createMessagevisor({ ...quiet, locale: "en-US", modules: [createICUModule()] });
  const intl = createIntlFromMessagevisor(sdk);
  expect(intl.formatMessage({ defaultMessage: "<literal>unchanged</literal>" })).toBe(
    "<literal>unchanged</literal>",
  );
  expect(intl.formatMessage({ defaultMessage: "{value}" }, { value: "{value}" })).toBe("{value}");
});

test.each(["", 0, false, null])("preserves an explicit falsy plural node %s", (one) => {
  const sdk = createMessagevisor({ ...quiet, locale: "en-US" });
  const view = render(
    <MessagevisorProvider instance={sdk}>
      <FormattedPlural value={1} one={one} other="fallback" />
    </MessagevisorProvider>,
  );
  expect(view.container.textContent).toBe(one === 0 ? "0" : "");
});

it("selects once and scans the selected translation instead of the descriptor fallback", () => {
  const diagnostics: any[] = [];
  const resolveFlag = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const sdk = createMessagevisor({
    ...quiet,
    logLevel: "debug",
    onDiagnostic: (d) => diagnostics.push(d),
    resolveFlag,
    modules: [createICUModule({ ignoreTags: false })],
    datafile: {
      schemaVersion: "1",
      messagevisorVersion: "test",
      revision: "1",
      locale: "en-US",
      target: "web",
      segments: {},
      translations: { rich: "<em>base</em>" },
      messages: {
        rich: {
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
  });
  const view = render(
    <MessagevisorProvider
      instance={sdk}
      defaultRichTextElements={{ strong: (chunks) => <strong>{chunks}</strong> }}
    >
      <FormattedMessage id="rich" defaultMessage="fallback" />
    </MessagevisorProvider>,
  );
  expect(view.container.querySelector("strong")?.textContent).toBe("selected");
  expect(resolveFlag).toHaveBeenCalledTimes(1);
  expect(diagnostics.filter((d) => d.code === "deprecated_message")).toHaveLength(1);
  expect(diagnostics.filter((d) => d.code === "message_override_matched")).toHaveLength(1);
});
