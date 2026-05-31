import type { DatafileContent } from "@messagevisor/types";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";

export const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  direction: "ltr",
  formats: {
    number: {
      money: { style: "currency", currency: "USD", currencyDisplay: "symbol" },
    },
    date: {
      short: { year: "2-digit", month: "numeric", day: "numeric" },
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
    web: {
      conditions: [{ attribute: "platform", operator: "equals", value: "web" }],
    },
  },
  messages: {
    greeting: {
      overrides: [
        {
          key: "web",
          segments: "web",
          translation: "Hello web {name}",
        },
      ],
    },
    total: {},
    richTerms: {},
    richInline: {},
    plainLink: {},
  },
  translations: {
    greeting: "Hello {name}",
    total: "Total: {amount, number, money}",
    richTerms: "Read our <link>terms</link> for <strong>{product}</strong>.",
    richInline: "Inline <strong>{name}</strong>.",
    plainLink: "Use {link}",
  },
};

export function createTestInstance() {
  return createMessagevisor({
    datafile,
    timeZone: "UTC",
    modules: [createICUModule()],
  });
}

export function createRichTestInstance() {
  return createMessagevisor({
    datafile,
    timeZone: "UTC",
    modules: [createICUModule({ ignoreTags: false })],
  });
}
