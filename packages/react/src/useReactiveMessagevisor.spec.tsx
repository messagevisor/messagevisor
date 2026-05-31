import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { datafile, createRichTestInstance, createTestInstance } from "./testUtils";
import {
  useCurrency,
  useDirection,
  useFormatDate,
  useFormatDateTimeRange,
  useFormatMessage,
  useFormatNumber,
  useFormatRelativeTime,
  useFormatTime,
  useLocale,
  useLocaleInfo,
  useMessagevisorContext,
  useTranslation,
} from "./useReactiveMessagevisor";
import { useMessagevisorSnapshot } from "./useMessagevisorSnapshot";
import { useSdk } from "./useSdk";

const nlDatafile = {
  ...datafile,
  locale: "nl-NL",
  direction: "ltr",
  revision: "2",
  messages: {
    ...datafile.messages,
    greeting: {
      overrides: [
        {
          key: "web-nl",
          segments: "web",
          translation: "Hallo web {name}",
        },
      ],
    },
  },
  translations: {
    ...datafile.translations,
    greeting: "Hallo {name}",
    total: "Totaal: {amount, number, money}",
  },
} as typeof datafile;

const arDatafile = {
  ...datafile,
  locale: "ar-SA",
  direction: "rtl",
  revision: "3",
  translations: {
    ...datafile.translations,
    greeting: "مرحبا {name}",
  },
  messages: {
    ...datafile.messages,
    greeting: {},
  },
} as typeof datafile;

describe("reactive Messagevisor hooks", function () {
  it("exposes the SDK snapshot and re-renders when observable state changes", function () {
    let renderCount = 0;

    function TestComponent() {
      renderCount++;

      const sdk = useSdk();
      const snapshot = useMessagevisorSnapshot();

      return (
        <button onClick={() => sdk.setCurrency("EUR")}>
          {snapshot.version}:{snapshot.locale}:{snapshot.currency || "none"}
        </button>
      );
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByRole("button")).toHaveTextContent("1:en-US:none");

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("2:en-US:EUR");
    expect(renderCount).toEqual(2);
  });

  it("reactively translates when context, datafile, and locale change", function () {
    function TestComponent() {
      const sdk = useSdk();
      const locale = useLocale();
      const direction = useDirection() || "unknown";
      const context = useMessagevisorContext();
      const greeting = useTranslation("greeting", { name: "Ada" });

      return (
        <section>
          <p>{locale}</p>
          <p>{direction}</p>
          <p>{String(context.platform || "no-platform")}</p>
          <p>{greeting}</p>
          <button onClick={() => sdk.setContext({ platform: "web" })}>context</button>
          <button
            onClick={() => {
              sdk.setDatafile(nlDatafile);
              sdk.setLocale("nl-NL");
            }}
          >
            locale
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("en-US")).toBeInTheDocument();
    expect(screen.getByText("ltr")).toBeInTheDocument();
    expect(screen.getByText("no-platform")).toBeInTheDocument();
    expect(screen.getByText("Hello Ada")).toBeInTheDocument();

    fireEvent.click(screen.getByText("context"));

    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("Hello web Ada")).toBeInTheDocument();

    fireEvent.click(screen.getByText("locale"));

    expect(screen.getByText("nl-NL")).toBeInTheDocument();
    expect(screen.getByText("ltr")).toBeInTheDocument();
    expect(screen.getByText("Hallo web Ada")).toBeInTheDocument();
  });

  it("reactively exposes locale and direction together via useLocaleInfo", function () {
    function TestComponent() {
      const sdk = useSdk();
      const localeInfo = useLocaleInfo();

      return (
        <section>
          <p>
            {localeInfo.locale}:{localeInfo.direction || "unknown"}
          </p>
          <button
            onClick={() => {
              sdk.setDatafile(arDatafile);
              sdk.setLocale("ar-SA");
            }}
          >
            switch
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("en-US:ltr")).toBeInTheDocument();

    fireEvent.click(screen.getByText("switch"));

    expect(screen.getByText("ar-SA:rtl")).toBeInTheDocument();
  });

  it("updates useDirection when the active locale datafile is replaced", function () {
    function TestComponent() {
      const sdk = useSdk();
      const direction = useDirection() || "unknown";

      return (
        <section>
          <p>{direction}</p>
          <button
            onClick={() =>
              sdk.setDatafile({
                ...datafile,
                locale: "en-US",
                direction: "rtl",
                revision: "2",
              })
            }
          >
            replace
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("ltr")).toBeInTheDocument();

    fireEvent.click(screen.getByText("replace"));

    expect(screen.getByText("rtl")).toBeInTheDocument();
  });

  it("reactively formats messages, numbers, currency, dates, times, ranges, and relative time", function () {
    function TestComponent() {
      const sdk = useSdk();
      const currency = useCurrency() || "none";
      const message = useFormatMessage("Hi {name}", { name: "Ada" });
      const number = useFormatNumber(12, "money");
      const money = useFormatNumber(12, "money", { currency: "EUR" });
      const date = useFormatDate("2025-01-02T00:00:00Z", "short");
      const time = useFormatTime("2025-01-02T12:00:00Z", {
        hour: "numeric",
        minute: "2-digit",
      });
      const range = useFormatDateTimeRange("2025-01-02T00:00:00Z", "2025-01-03T00:00:00Z", "short");
      const relative = useFormatRelativeTime(-1, "day", "short");

      return (
        <section>
          <p>{currency}</p>
          <p>{message}</p>
          <p>{number}</p>
          <p>{money}</p>
          <p>{date}</p>
          <p>{time}</p>
          <p>{range}</p>
          <p>{relative}</p>
          <button
            onClick={() => {
              sdk.setCurrency("EUR");
              sdk.setTimeZone("America/New_York");
            }}
          >
            update
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText("Hi Ada")).toBeInTheDocument();
    expect(screen.getByText("$12.00")).toBeInTheDocument();
    expect(screen.getByText("€12.00")).toBeInTheDocument();
    expect(screen.getByText("1/2/25")).toBeInTheDocument();
    expect(screen.getByText("12:00 PM")).toBeInTheDocument();
    expect(screen.getByText(/Jan 2.*3/)).toBeInTheDocument();
    expect(screen.getByText("yesterday")).toBeInTheDocument();

    fireEvent.click(screen.getByText("update"));

    expect(screen.getByText("EUR")).toBeInTheDocument();
    expect(screen.getByText("$12.00")).toBeInTheDocument();
    expect(screen.getByText("€12.00")).toBeInTheDocument();
    expect(screen.getByText("7:00 AM")).toBeInTheDocument();
  });

  it("refreshes subscriptions when the provider receives a new instance", function () {
    const first = createTestInstance();
    const second = createMessagevisor({
      datafile: {
        ...datafile,
        translations: {
          ...datafile.translations,
          greeting: "Hi {name}",
        },
      },
      currency: "EUR",
      modules: [createICUModule()],
    });

    function TestComponent() {
      const greeting = useTranslation("greeting", { name: "Ada" });
      const currency = useCurrency();

      return (
        <p>
          {greeting}:{currency || "none"}
        </p>
      );
    }

    const { rerender } = render(
      <MessagevisorProvider instance={first}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada:none")).toBeInTheDocument();

    rerender(
      <MessagevisorProvider instance={second}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hi Ada:EUR")).toBeInTheDocument();
  });

  it("reactively translates rich text with provider defaults and per-call overrides", function () {
    function TestComponent() {
      const sdk = useSdk();
      const terms = useTranslation("richTerms", {
        product: "Messagevisor",
        link: (chunks) => <button>{chunks}</button>,
      });
      const inline = useFormatMessage("Inline <strong>{name}</strong>.", {
        name: "Ada",
      });

      return (
        <section>
          <p>{terms}</p>
          <p>{inline}</p>
          <button onClick={() => sdk.setContext({ platform: "web" })}>update</button>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createRichTestInstance()}
        defaultRichTextElements={{
          link: (chunks) => <a href="/terms">{chunks}</a>,
          strong: (chunks) => <strong>{chunks}</strong>,
        }}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByRole("button", { name: "terms" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "terms" })).not.toBeInTheDocument();
    expect(screen.getByText("Messagevisor").tagName).toEqual("STRONG");
    expect(screen.getByText("Ada").tagName).toEqual("STRONG");

    fireEvent.click(screen.getByRole("button", { name: "update" }));

    expect(screen.getByRole("button", { name: "terms" })).toBeInTheDocument();
  });

  it("runs provider modules for reactive translation and message formatting", function () {
    const payloads: any[] = [];

    function TestComponent() {
      const translated = useTranslation("greeting", { name: "Ada" });
      const formatted = useFormatMessage("Inline {name}", { name: "Ada" });

      return (
        <section>
          <p>{translated}</p>
          <p>{formatted}</p>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createTestInstance()}
        modules={[
          {
            transform(payload) {
              payloads.push(payload);

              if (payload.source === "translation") {
                return `${payload.translation}!`;
              }

              return undefined;
            },
          },
        ]}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada!")).toBeInTheDocument();
    expect(screen.getByText("Inline Ada")).toBeInTheDocument();
    expect(payloads.map((payload) => payload.source)).toEqual(["translation", "formatMessage"]);
    expect(payloads[0].messageKey).toEqual("greeting");
    expect(payloads[1].messageKey).toBeUndefined();
  });

  it("keeps provider defaults away from plain placeholders in reactive hooks", function () {
    function TestComponent() {
      const translated: string = useTranslation("plainLink", { link: "this link" });
      const formatted: string = useFormatMessage("Inline {link}", { link: "plain link" });

      return (
        <section>
          <p>{translated}</p>
          <p>{formatted}</p>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createRichTestInstance()}
        defaultRichTextElements={{
          link: (chunks) => <a href="/terms">{chunks}</a>,
        }}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Use this link")).toBeInTheDocument();
    expect(screen.getByText("Inline plain link")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("types rich reactive hooks as renderable React nodes", function () {
    function TestComponent() {
      const translated: React.ReactNode = useTranslation("richTerms", {
        product: "Messagevisor",
      });
      const formatted: React.ReactNode = useFormatMessage("Inline <strong>{name}</strong>.", {
        name: "Ada",
      });

      return (
        <section>
          <p>{translated}</p>
          <p>{formatted}</p>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createRichTestInstance()}
        defaultRichTextElements={{
          link: (chunks) => <a href="/terms">{chunks}</a>,
          strong: (chunks) => <strong>{chunks}</strong>,
        }}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByRole("link", { name: "terms" })).toBeInTheDocument();
    expect(screen.getByText("Ada").tagName).toEqual("STRONG");
  });

  it("can return raw rich chunks when fragment wrapping is disabled", function () {
    const chunks: React.ReactNode[] = [];

    function TestComponent() {
      const terms = useTranslation("richTerms", {
        product: "Messagevisor",
      });

      if (Array.isArray(terms)) {
        chunks.push(...terms);
      }

      return <p>ready</p>;
    }

    render(
      <MessagevisorProvider
        instance={createRichTestInstance()}
        wrapRichTextChunksInFragment={false}
        defaultRichTextElements={{
          link: (value) => <a href="/terms">{value}</a>,
          strong: (value) => <strong>{value}</strong>,
        }}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(chunks).toHaveLength(5);
    expect(React.isValidElement(chunks[1])).toEqual(true);
    expect(
      (chunks[1] as React.ReactElement<{ href: string; children: React.ReactNode }>).type,
    ).toEqual("a");
    expect(
      (chunks[1] as React.ReactElement<{ href: string; children: React.ReactNode }>).props.href,
    ).toEqual("/terms");
    expect(React.isValidElement(chunks[3])).toEqual(true);
    expect((chunks[3] as React.ReactElement).type).toEqual("strong");
  });
});
