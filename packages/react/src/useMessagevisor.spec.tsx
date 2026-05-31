import * as React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { datafile, createRichTestInstance, createTestInstance } from "./testUtils";
import { MESSAGEVISOR_METHODS, useMessagevisor } from "./useMessagevisor";

describe("useMessagevisor", function () {
  it("exposes exactly the expected bound methods", function () {
    let keys: string[] = [];

    function TestComponent() {
      keys = Object.keys(useMessagevisor());

      return <p>ready</p>;
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(keys.sort()).toEqual([...MESSAGEVISOR_METHODS].sort());
  });

  it("translates through t and keeps destructured methods bound", function () {
    let text = "";
    let total = "";

    function TestComponent() {
      const { t, setContext } = useMessagevisor();

      setContext({ platform: "web" });
      text = t("greeting", { name: "Ada" });
      total = t("total", { amount: 12 });

      return <p>{text}</p>;
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello web Ada")).toBeInTheDocument();
    expect(text).toEqual("Hello web Ada");
    expect(total).toEqual("Total: $12.00");
  });

  it("exposes formatting helpers and SDK setters/getters", function () {
    const results: string[] = [];

    function TestComponent() {
      const {
        formatMessage,
        formatNumber,
        formatDate,
        formatTime,
        formatDateTimeRange,
        formatRelativeTime,
        setCurrency,
        getCurrency,
        setTimeZone,
        getTimeZone,
        getDirection,
        setContext,
        getContext,
        setDatafile,
        getRevision,
      } = useMessagevisor();

      setCurrency("EUR");
      setTimeZone("UTC");
      setContext({ plan: "pro" });
      setDatafile({
        ...datafile,
        locale: "nl-NL",
        revision: "2",
        translations: {
          greeting: "Hallo {name}",
          total: "Totaal",
        },
        messages: {
          greeting: {},
          total: {},
        },
      });

      results.push(formatMessage("Hello {name}", { name: "Ada" }));
      results.push(formatNumber(12, "money"));
      results.push(formatNumber(12, { style: "currency", currency: "USD" }));
      results.push(formatDate("2025-01-02T00:00:00Z", "short"));
      results.push(formatTime("2025-01-02T12:00:00Z", "short"));
      results.push(formatDateTimeRange("2025-01-02T00:00:00Z", "2025-01-03T00:00:00Z", "short"));
      results.push(formatRelativeTime(-1, "day", "short"));
      results.push(String(getCurrency()));
      results.push(String(getTimeZone()));
      results.push(String(getDirection()));
      results.push(String(getContext().plan));
      results.push(getRevision());
      results.push(getRevision("nl-NL"));

      return <p>formatted</p>;
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("formatted")).toBeInTheDocument();
    expect(results[0]).toEqual("Hello Ada");
    expect(results[1]).toContain("$");
    expect(results[2]).toContain("12");
    expect(results[3]).toContain("1/2/25");
    expect(results[4]).toContain("12:00");
    expect(results[5]).toContain("Jan");
    expect(results[6]).toEqual("yesterday");
    expect(results.slice(7)).toEqual(["EUR", "UTC", "ltr", "pro", "1", "2"]);
  });

  it("switches locale only when setLocale is called after setDatafile", function () {
    let before = "";
    let afterDatafile = "";
    let afterLocale = "";

    function TestComponent() {
      const { t, setDatafile, setLocale, getLocale } = useMessagevisor();

      before = String(getLocale());
      setDatafile({
        ...datafile,
        locale: "nl-NL",
        translations: {
          greeting: "Hallo {name}",
          total: "Totaal",
        },
        messages: {
          greeting: {},
          total: {},
        },
      });
      afterDatafile = t("greeting", { name: "Ada" });
      setLocale("nl-NL");
      afterLocale = t("greeting", { name: "Ada" });

      return <p>locale</p>;
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(before).toEqual("en-US");
    expect(afterDatafile).toEqual("Hello Ada");
    expect(afterLocale).toEqual("Hallo Ada");
  });

  it("keeps method references stable for the same instance and refreshes for a new instance", function () {
    const first = createTestInstance();
    const second = createMessagevisor({
      datafile: {
        ...datafile,
        translations: {
          ...datafile.translations,
          greeting: "Hi {name}",
        },
      },
      modules: [createICUModule()],
    });
    const refs: Array<ReturnType<typeof useMessagevisor>["t"]> = [];
    const values: string[] = [];

    function TestComponent() {
      const { t } = useMessagevisor();

      refs.push(t);
      values.push(t("greeting", { name: "Ada" }));

      return <p>refs</p>;
    }

    const { rerender } = render(
      <MessagevisorProvider instance={first}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    rerender(
      <MessagevisorProvider instance={first}>
        <TestComponent />
      </MessagevisorProvider>,
    );
    rerender(
      <MessagevisorProvider instance={second}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(refs[0]).toBe(refs[1]);
    expect(refs[1]).not.toBe(refs[2]);
    expect(values).toEqual(["Hello Ada", "Hello Ada", "Hi Ada"]);
  });

  it("does not re-render automatically when the SDK instance mutates", function () {
    let renderCount = 0;
    let displayed = "";

    function TestComponent() {
      renderCount++;
      const { t, setContext } = useMessagevisor();

      displayed = t("greeting", { name: "Ada" });
      return <button onClick={() => setContext({ platform: "web" })}>{displayed}</button>;
    }

    render(
      <MessagevisorProvider instance={createTestInstance()}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    screen.getByRole("button").click();

    expect(renderCount).toEqual(1);
    expect(displayed).toEqual("Hello Ada");
    expect(screen.getByText("Hello Ada")).toBeInTheDocument();
  });

  it("supports rich text values and provider defaults through t and formatMessage", function () {
    function TestComponent() {
      const { t, formatMessage } = useMessagevisor();
      const terms = t("richTerms", { product: "Messagevisor" });
      const inline = formatMessage("Inline <strong>{name}</strong>.", {
        name: "Ada",
      });

      return (
        <section>
          <p>{terms}</p>
          <p>{inline}</p>
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

    expect(screen.getByRole("link", { name: "terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getAllByText("Messagevisor")[0].tagName).toEqual("STRONG");
    expect(screen.getByText("Ada").tagName).toEqual("STRONG");
  });

  it("runs provider modules for t and formatMessage before fragment wrapping", function () {
    const payloads: any[] = [];

    function TestComponent() {
      const { t, formatMessage } = useMessagevisor();

      return (
        <section>
          <p>{t("greeting", { name: "Ada" })}</p>
          <p>{formatMessage("Inline {name}", { name: "Ada" })}</p>
        </section>
      );
    }

    render(
      <MessagevisorProvider
        instance={createTestInstance()}
        modules={[
          {
            name: "emphasis",
            transform(payload) {
              payloads.push(payload);

              return <strong>{payload.translation}</strong>;
            },
          },
        ]}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada").tagName).toEqual("STRONG");
    expect(screen.getByText("Inline Ada").tagName).toEqual("STRONG");
    expect(payloads.map((payload) => payload.source)).toEqual(["translation", "formatMessage"]);
    expect(payloads[0].messageKey).toEqual("greeting");
    expect(payloads[1].messageKey).toBeUndefined();
  });

  it("runs SDK modules before provider modules", function () {
    const instance = createMessagevisor({
      datafile,
      modules: [
        createICUModule(),
        {
          transform: ({ translation }) => `${translation} from sdk`,
        },
      ],
    });

    function TestComponent() {
      const { t } = useMessagevisor();

      return <p>{t("greeting", { name: "Ada" })}</p>;
    }

    render(
      <MessagevisorProvider
        instance={instance}
        modules={[
          {
            transform: ({ translation }) => `${translation} from provider`,
          },
        ]}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("Hello Ada from sdk from provider")).toBeInTheDocument();
  });

  it("does not merge provider defaults into ordinary ICU placeholders", function () {
    function TestComponent() {
      const { t, formatMessage } = useMessagevisor();

      return (
        <section>
          <p>{t("plainLink", { link: "this link" })}</p>
          <p>{formatMessage("Inline {link}", { link: "plain link" })}</p>
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

  it("lets per-call rich text values override provider defaults in t", function () {
    function TestComponent() {
      const { t } = useMessagevisor();

      return (
        <p>
          {t("richTerms", {
            product: "Messagevisor",
            link: (chunks) => <button>{chunks}</button>,
          })}
        </p>
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
  });

  it("does not parse tags through t when the ICU module keeps ignoreTags enabled", function () {
    function TestComponent() {
      const { t } = useMessagevisor();

      return <p>{t("richTerms", { product: "Messagevisor" })}</p>;
    }

    render(
      <MessagevisorProvider
        instance={createTestInstance()}
        defaultRichTextElements={{
          link: (chunks) => <a href="/terms">{chunks}</a>,
          strong: (chunks) => <strong>{chunks}</strong>,
        }}
      >
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(
      screen.getByText("Read our <link>terms</link> for <strong>Messagevisor</strong>."),
    ).toBeInTheDocument();
  });
});
