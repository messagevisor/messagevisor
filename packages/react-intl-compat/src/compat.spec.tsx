import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { DatafileContent } from "@messagevisor/types";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import { MessagevisorProvider } from "@messagevisor/react";

import {
  defineMessage,
  defineMessages,
  FormattedDate,
  FormattedList,
  FormattedMessage,
  FormattedNumber,
  FormattedNumberParts,
  FormattedPlural,
  injectIntl,
  useIntl,
} from "./index";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  formats: {
    number: {
      money: { style: "currency", currency: "USD", currencyDisplay: "symbol" },
    },
    date: {
      short: { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" },
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
    rich: {},
  },
  translations: {
    greeting: "Hello {name}",
    rich: "Read <link>terms</link>.",
  },
};

const nlDatafile: DatafileContent = {
  ...datafile,
  revision: "2",
  locale: "nl-NL",
  formats: {
    number: {
      money: { style: "currency", currency: "EUR", currencyDisplay: "symbol" },
    },
    date: {
      short: { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" },
    },
  },
  translations: {
    greeting: "Hallo {name}",
    rich: "Lees <link>voorwaarden</link>.",
  },
};

describe("@messagevisor/react-intl-compat", function () {
  it("supports bridge mode with locale-keyed catalogs and useIntl", function () {
    function Example() {
      const intl = useIntl();

      return (
        <div>
          <span>
            {intl.formatMessage({ id: "greeting", defaultMessage: "Hi {name}" }, { name: "Ada" })}
          </span>
          <span>{intl.formatNumber(12)}</span>
        </div>
      );
    }

    const instance = createMessagevisor({
      locale: "en-US",
      defaultTranslations: {
        "en-US": {
          greeting: "Hello {name}",
        },
      },
      modules: [createICUModule()],
    });

    render(
      <MessagevisorProvider instance={instance}>
        <Example />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("maps descriptor defaultMessage to SDK defaultTranslation", function () {
    function Example() {
      const intl = useIntl();

      return (
        <span>
          {intl.formatMessage(
            { id: "missing.greeting", defaultMessage: "Hi {name}" },
            { name: "Ada" },
          )}
        </span>
      );
    }

    const instance = createMessagevisor({
      locale: "en-US",
      modules: [createICUModule()],
    });

    render(
      <MessagevisorProvider instance={instance}>
        <Example />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hi Ada")).toBeInTheDocument();
  });

  it("maps empty defaultMessage through defaultTranslation without falling back to the message key", function () {
    function Example() {
      const intl = useIntl();

      return (
        <span data-testid="empty-default">
          {intl.formatMessage({ id: "missing.empty", defaultMessage: "" })}
        </span>
      );
    }

    const instance = createMessagevisor({
      locale: "en-US",
      modules: [createICUModule()],
    });

    render(
      <MessagevisorProvider instance={instance}>
        <Example />
      </MessagevisorProvider>,
    );

    expect(screen.getByTestId("empty-default")).toBeEmptyDOMElement();
  });

  it("uses defaultMessage for FormattedMessage when the id is missing, including rich text", function () {
    render(
      <MessagevisorProvider
        instance={createMessagevisor({
          datafile,
          modules: [createICUModule({ ignoreTags: false })],
        })}
        textComponent="span"
        defaultRichTextElements={{
          link: function link(chunks) {
            return <a href="/terms">{chunks}</a>;
          },
        }}
      >
        <FormattedMessage id="missing.rich" defaultMessage="Read <link>terms</link>." />
      </MessagevisorProvider>,
    );

    expect(screen.getByRole("link", { name: "terms" })).toHaveAttribute("href", "/terms");
  });

  it("supports datafile mode and preserves Messagevisor overrides", function () {
    render(
      <MessagevisorProvider
        instance={createMessagevisor({ datafile, modules: [createICUModule()] })}
      >
        <FormattedMessage id="greeting" values={{ name: "Ada" }} />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada")).toBeInTheDocument();

    const instance = createMessagevisor({
      datafile,
      context: { platform: "web" },
      modules: [createICUModule()],
    });

    render(
      <MessagevisorProvider instance={instance}>
        <FormattedMessage id="greeting" values={{ name: "Lin" }} />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello web Lin")).toBeInTheDocument();
  });

  it("supports rich text defaults and textComponent wrapping", function () {
    const instance = createMessagevisor({
      datafile,
      modules: [createICUModule({ ignoreTags: false })],
    });

    render(
      <MessagevisorProvider
        instance={instance}
        textComponent="span"
        defaultRichTextElements={{
          link: function link(chunks) {
            return <a href="/terms">{chunks}</a>;
          },
        }}
      >
        <FormattedMessage id="rich" />
      </MessagevisorProvider>,
    );

    expect(screen.getByRole("link", { name: "terms" })).toHaveAttribute("href", "/terms");
  });

  it("exports defineMessage helpers and imperative components", function () {
    const message = defineMessage({ id: "hello", defaultMessage: "Hello" });
    const messages = defineMessages({
      count: { id: "count", defaultMessage: "{count, number}" },
    });

    expect(message.id).toEqual("hello");
    expect(messages.count.id).toEqual("count");

    render(
      <MessagevisorProvider
        instance={createMessagevisor({
          locale: "en-US",
          defaultTranslations: {
            "en-US": {
              hello: "Hello",
              count: "{count, number}",
            },
          },
          modules: [createICUModule()],
        })}
      >
        <FormattedNumber value={12} />
        <FormattedDate
          value={new Date("2025-01-01T12:00:00Z")}
          format={{ year: "numeric", timeZone: "UTC" }}
        />
        <FormattedList value={["A", "B"]} />
        <FormattedPlural value={1} one="item" other="items" />
        <FormattedNumberParts value={12}>
          {(parts) => <span>{parts[0].value}</span>}
        </FormattedNumberParts>
      </MessagevisorProvider>,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(document.body.textContent).toContain("A and B");
    expect(document.body.textContent).toContain("item");
  });

  it("supports injectIntl", function () {
    const Base = injectIntl(function Base(props: { intl: ReturnType<typeof useIntl> }) {
      return <span>{props.intl.formatMessage({ id: "greeting" }, { name: "Ada" })}</span>;
    });

    render(
      <MessagevisorProvider
        instance={createMessagevisor({
          locale: "en-US",
          defaultTranslations: {
            "en-US": {
              greeting: "Hello {name}",
            },
          },
          modules: [createICUModule()],
        })}
      >
        <Base />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada")).toBeInTheDocument();
  });

  it("updates useIntl locale and formatted messages after SDK locale changes", function () {
    function Example() {
      const intl = useIntl();

      return (
        <section>
          <p>{intl.locale}</p>
          <p>{intl.formatMessage({ id: "greeting" }, { name: "Ada" })}</p>
          <button
            onClick={() => {
              intl.messagevisor.setDatafile(nlDatafile);
              intl.messagevisor.setLocale("nl-NL");
            }}
          >
            switch
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createMessagevisor({ datafile, modules: [createICUModule()] })}
      >
        <Example />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("en-US")).toBeInTheDocument();
    expect(screen.getByText("Hello Ada")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByText("nl-NL")).toBeInTheDocument();
    expect(screen.getByText("Hallo Ada")).toBeInTheDocument();
  });

  it("updates FormattedMessage after SDK locale changes", function () {
    function Example() {
      const intl = useIntl();

      return (
        <section>
          <FormattedMessage id="greeting" values={{ name: "Ada" }} />
          <button
            onClick={() => {
              intl.messagevisor.setDatafile(nlDatafile);
              intl.messagevisor.setLocale("nl-NL");
            }}
          >
            switch
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createMessagevisor({ datafile, modules: [createICUModule()] })}
      >
        <Example />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByText("Hallo Ada")).toBeInTheDocument();
  });

  it("updates formatter components after SDK locale changes", function () {
    function Example() {
      const intl = useIntl();

      return (
        <section>
          <span data-testid="number">
            <FormattedNumber value={1234.5} />
          </span>
          <span data-testid="currency">{intl.formatNumber(12, "money")}</span>
          <button
            onClick={() => {
              intl.messagevisor.setDatafile(nlDatafile);
              intl.messagevisor.setLocale("nl-NL");
            }}
          >
            switch
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createMessagevisor({ datafile, modules: [createICUModule()] })}
      >
        <Example />
      </MessagevisorProvider>,
    );

    const initialNumber = screen.getByTestId("number").textContent;
    expect(screen.getByTestId("currency")).toHaveTextContent("$12.00");

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByTestId("number").textContent).not.toEqual(initialNumber);
    expect(screen.getByTestId("currency")).toHaveTextContent("€");
    expect(screen.getByTestId("currency")).not.toHaveTextContent("$12.00");
  });

  it("updates injected intl props after SDK locale changes", function () {
    const Base = injectIntl(function Base(props: { intl: ReturnType<typeof useIntl> }) {
      return <span>{props.intl.formatMessage({ id: "greeting" }, { name: "Ada" })}</span>;
    });

    function Example() {
      const intl = useIntl();

      return (
        <section>
          <Base />
          <button
            onClick={() => {
              intl.messagevisor.setDatafile(nlDatafile);
              intl.messagevisor.setLocale("nl-NL");
            }}
          >
            switch
          </button>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createMessagevisor({ datafile, modules: [createICUModule()] })}
      >
        <Example />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByText("Hallo Ada")).toBeInTheDocument();
  });

  it("fails clearly when ICU formatting is requested without the ICU module", function () {
    expect(() =>
      render(
        <MessagevisorProvider
          instance={createMessagevisor({
            locale: "en-US",
            defaultTranslations: {
              "en-US": {
                greeting: "Hello {name}",
              },
            },
          })}
        >
          <FormattedMessage id="greeting" values={{ name: "Ada" }} />
        </MessagevisorProvider>,
      ),
    ).toThrow(
      "Message formatting requires a Messagevisor instance configured with createICUModule().",
    );
  });
});
