import * as fs from "fs";
import * as path from "path";
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "./index";

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../conformance/sdk-v1.json"), "utf8"),
).hardening;
const zone = contract.timeZones;
const instant = new Date(zone.instant);
const quiet = { logLevel: "debug" as const, onDiagnostic: () => {} };

describe("ICU hardening", () => {
  test.each([undefined, zone.instance, zone.call])(
    "applies the effective zone to bare date, time, builtins and skeletons: %s",
    (timeZone) => {
      const sdk = createMessagevisor({
        ...quiet,
        locale: "en-GB",
        timeZone: zone.instance,
        modules: [createICUModule()],
      });
      const options = { timeZone };
      expect(sdk.formatMessage("{d, date}", { d: instant }, options)).toBe(
        sdk.formatDate(instant, undefined, options),
      );
      expect(sdk.formatMessage("{d, time}", { d: instant }, options)).toBe(
        sdk.formatTime(instant, undefined, options),
      );
      expect(sdk.formatMessage("{d, date, ::yyyyMMdd}", { d: instant }, options)).toBe(
        sdk.formatDate(instant, { year: "numeric", month: "2-digit", day: "2-digit" }, options),
      );
      expect(sdk.formatMessage("{d, time, short}", { d: instant }, options)).toBe(
        sdk.formatTime(instant, { hour: "numeric", minute: "numeric" }, options),
      );
      expect(sdk.getTimeZone()).toBe(zone.instance);
    },
  );

  it("honours call over preset over instance zones across locales, children and reloads", () => {
    const sdk = createMessagevisor({
      ...quiet,
      locale: "en-GB",
      timeZone: zone.instance,
      modules: [createICUModule()],
      defaultFormats: {
        "en-GB": {
          date: {
            selected: { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone.preset },
          },
          time: { selected: { hour: "numeric", minute: "numeric", timeZone: zone.preset } },
        },
      },
    });
    for (const instance of [sdk, sdk.spawn({}, { timeZone: zone.call })]) {
      for (const options of [{}, { timeZone: zone.call }]) {
        expect(instance.formatMessage("{d, date, selected}", { d: instant }, options)).toBe(
          instance.formatDate(instant, "selected", options),
        );
        expect(instance.formatMessage("{d, time, selected}", { d: instant }, options)).toBe(
          instance.formatTime(instant, "selected", options),
        );
      }
    }
    const utc = sdk.formatMessage("{d, date}", { d: instant }, { timeZone: "UTC" });
    expect(sdk.formatMessage("{d, date}", { d: instant })).not.toBe(utc);
    sdk.setTimeZone("UTC");
    expect(sdk.formatMessage("{d, date}", { d: instant })).toBe(utc);
    expect(sdk.formatMessage("{d, date}", { d: instant }, { locale: "en-US" })).toBe(
      sdk.formatDate(instant, undefined, { locale: "en-US" }),
    );
  });

  it("uses the same host default without an explicit zone and across a DST transition", () => {
    const sdk = createMessagevisor({ ...quiet, locale: "en-GB", modules: [createICUModule()] });
    expect(sdk.formatMessage("{d, time}", { d: instant })).toBe(sdk.formatTime(instant));
    for (const value of ["2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z"]) {
      const d = new Date(value);
      expect(sdk.formatMessage("{d, time}", { d }, { timeZone: "Europe/Amsterdam" })).toBe(
        sdk.formatTime(d, undefined, { timeZone: "Europe/Amsterdam" }),
      );
    }
  });

  test.each(contract.dictionaryKeys)(
    "formats explicit reserved preset and value %s without inherited lookup",
    (key: string) => {
      const sdk = createMessagevisor({
        ...quiet,
        locale: "en-GB",
        modules: [createICUModule()],
        defaultFormats: { "en-GB": { number: { [key]: { style: "percent" } } } },
      });
      expect(sdk.formatMessage(`{n, number, ${key}}`, { n: 0.5 })).toBe("50%");
      expect(sdk.formatMessage(`{${key}}`, { [key]: "own" })).toBe("own");
      expect(() => sdk.formatMessage(`{${key}}`, {})).toThrow();
      expect(sdk.formatMessage("{x, select, other {safe}}", { x: key })).toBe("safe");
    },
  );

  it("bounds compiled and native caches, reuses hits, and does not cache failed construction", () => {
    const sdk = createMessagevisor({ ...quiet, locale: "en-GB", modules: [createICUModule()] });
    const native = Intl.NumberFormat;
    const spy = jest
      .spyOn(Intl, "NumberFormat")
      .mockImplementation((...args) => new native(...args));
    Object.assign(Intl.NumberFormat, { supportedLocalesOf: native.supportedLocalesOf });
    try {
      sdk.formatMessage("{n, number}", { n: 1 });
      sdk.formatMessage("{n, number}", { n: 2 });
      expect(spy).toHaveBeenCalledTimes(1);
      for (let index = 0; index < 130; index++) {
        sdk.formatMessage(
          `${index}: {n, number, chosen}`,
          { n: 1 },
          {
            formats: {
              number: {
                chosen: {
                  minimumIntegerDigits: (index % 21) + 1,
                  minimumFractionDigits: Math.floor(index / 21),
                },
              },
            },
          },
        );
      }
      const calls = spy.mock.calls.length;
      sdk.formatMessage("{n, number}", { n: 1 });
      expect(spy).toHaveBeenCalledTimes(calls + 1);
      expect(() => sdk.formatMessage("{")).toThrow();
      expect(() => sdk.formatMessage("{")).toThrow();
      expect(sdk.formatMessage("valid")).toBe("valid");
    } finally {
      spy.mockRestore();
    }
  });
});
