import type { DatafileContent } from "@messagevisor/types";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";

import { createInterpolationModule } from "./index";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  formats: {
    number: {
      decimalFixed: { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 },
    },
  },
  segments: {},
  messages: {
    greeting: {},
    repeated: {},
    customPrefix: {},
    mixedFormatting: {},
  },
  translations: {
    greeting: "Hello {name}",
    repeated: "{name} and {name} and {_value_2}",
    customPrefix: "Hello %{name}",
    mixedFormatting: "Total %{currency}{amount, number, decimalFixed}",
  },
};

describe("@messagevisor/module-interpolation", function () {
  it("interpolates default placeholders for translate and formatMessage", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createInterpolationModule()],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello Ada");
    expect(m.formatMessage("Hi {name}", { name: "Lin" })).toEqual("Hi Lin");
  });

  it("replaces repeated placeholders and supports uppercase, lowercase, digits, and underscores", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createInterpolationModule()],
    });

    expect(
      m.translate("repeated", {
        name: "Ada",
        _value_2: "OK",
      }),
    ).toEqual("Ada and Ada and OK");
    expect(
      m.formatMessage("Vars {USER_1} {user_2}", {
        USER_1: "A",
        user_2: "B",
      }),
    ).toEqual("Vars A B");
  });

  it("leaves unknown, null, undefined, object, array, date, and function placeholders untouched", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createInterpolationModule()],
    });

    expect(m.formatMessage("Hello {name}", {})).toEqual("Hello {name}");
    expect(m.formatMessage("Hello {name}", { name: null as any })).toEqual("Hello {name}");
    expect(m.formatMessage("Hello {name}", { name: undefined as any })).toEqual("Hello {name}");
    expect(m.formatMessage("Hello {name}", { name: { first: "Ada" } as any })).toEqual(
      "Hello {name}",
    );
    expect(m.formatMessage("Hello {name}", { name: ["Ada"] as any })).toEqual("Hello {name}");
    expect(m.formatMessage("Hello {name}", { name: new Date() as any })).toEqual("Hello {name}");
    expect(
      m.formatMessage("Hello {name}", {
        name: (() => "Ada") as any,
      }),
    ).toEqual("Hello {name}");
  });

  it("interpolates string, number, and boolean values", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createInterpolationModule()],
    });

    expect(m.formatMessage("Name {name}", { name: "Ada" })).toEqual("Name Ada");
    expect(m.formatMessage("Count {count}", { count: 12 })).toEqual("Count 12");
    expect(m.formatMessage("Flag {enabled}", { enabled: false })).toEqual("Flag false");
  });

  it("skips processing when the incoming translation is not a string", function () {
    const m = createMessagevisor({
      datafile,
      modules: [
        {
          name: "object-first",
          format() {
            return { value: "not-a-string" };
          },
        },
        createInterpolationModule(),
      ],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual({ value: "not-a-string" });
  });

  it("supports custom regex patterns such as %{name}", function () {
    const m = createMessagevisor({
      datafile,
      modules: [
        createInterpolationModule({
          pattern: /%\{([A-Za-z_][A-Za-z0-9_]*)\}/,
        }),
      ],
    });

    expect(m.translate("customPrefix", { name: "Ada" })).toEqual("Hello Ada");
  });

  it("composes with module-icu through module ordering", function () {
    const m = createMessagevisor({
      datafile,
      modules: [
        createInterpolationModule({
          pattern: /%\{([A-Za-z_][A-Za-z0-9_]*)\}/,
        }),
        createICUModule(),
      ],
    });

    expect(
      m.translate("mixedFormatting", {
        currency: "EUR",
        amount: 12,
      }),
    ).toEqual("Total EUR12.00");
  });

  it("does not mutate payload values", function () {
    const values = { name: "Ada" };
    const m = createMessagevisor({
      datafile,
      modules: [createInterpolationModule()],
    });

    m.translate("greeting", values);

    expect(values).toEqual({ name: "Ada" });
  });

  it("can be removed by its default name", function () {
    const m = createMessagevisor({
      datafile,
      modules: [createInterpolationModule()],
    });

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello Ada");

    m.removeModule("interpolation");

    expect(m.translate("greeting", { name: "Ada" })).toEqual("Hello {name}");
  });
});
