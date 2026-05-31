import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import type { DatafileContent } from "@messagevisor/types";

export const enDatafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1-en",
  target: "web",
  locale: "en-US",
  direction: "ltr",
  formats: {
    number: {
      money: { style: "currency", currency: "USD", currencyDisplay: "symbol" },
    },
    date: {
      short: { year: "2-digit", month: "numeric", day: "numeric", timeZone: "UTC" },
    },
    time: {
      short: { hour: "numeric", minute: "2-digit", timeZone: "UTC" },
    },
    dateTimeRange: {
      short: { month: "short", day: "numeric", timeZone: "UTC" },
    },
    relative: {
      short: { numeric: "auto", style: "short" },
    },
  },
  segments: {
    pro: {
      conditions: [{ attribute: "plan", operator: "equals", value: "pro" }],
    },
  },
  messages: {
    greeting: {
      overrides: [
        {
          key: "pro",
          segments: "pro",
          translation: "Welcome back, pro {name}",
        },
      ],
    },
    total: {},
    richTerms: {},
    raw: {},
  },
  translations: {
    greeting: "Hello {name}",
    total: "Total: {amount, number, money}",
    richTerms: "Read our <link>terms</link> for <strong>{product}</strong>.",
    raw: "Raw {name}",
  },
};

export const nlDatafile: DatafileContent = {
  ...enDatafile,
  revision: "1-nl",
  locale: "nl-NL",
  translations: {
    ...enDatafile.translations,
    greeting: "Hallo {name}",
  },
};

export function createTestInstance() {
  return createMessagevisor({
    datafile: enDatafile,
    timeZone: "UTC",
    logLevel: "fatal",
    modules: [createICUModule()],
  });
}

export function createRichTestInstance() {
  return createMessagevisor({
    datafile: enDatafile,
    timeZone: "UTC",
    logLevel: "fatal",
    modules: [createICUModule({ ignoreTags: false })],
  });
}
