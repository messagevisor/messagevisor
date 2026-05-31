import { createInstance, type FeaturevisorInstance } from "@featurevisor/sdk";
import { createMessagevisor } from "@messagevisor/sdk";
import type { DatafileContent } from "@messagevisor/types";

import { createFeaturevisorModule } from "./index";

const datafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  segments: {},
  messages: {
    checkout: {
      overrides: [
        {
          key: "feature-enabled",
          conditions: {
            feature: "new-checkout",
            operator: "isEnabled",
          },
          translation: "Fast checkout",
        },
        {
          key: "feature-disabled",
          conditions: {
            feature: "legacy-checkout",
            operator: "isDisabled",
          },
          translation: "Classic checkout",
        },
      ],
    },
    experiment: {
      overrides: [
        {
          key: "bold-copy",
          conditions: {
            experiment: "checkout-copy",
            operator: "hasVariation",
            value: "bold",
          },
          translation: "Bold checkout copy",
        },
      ],
    },
    missingExperiment: {
      overrides: [
        {
          key: "missing",
          conditions: {
            experiment: "missing-copy",
            operator: "hasVariation",
            value: "bold",
          },
          translation: "Missing experiment matched",
        },
      ],
    },
  },
  translations: {
    checkout: "Default checkout",
    experiment: "Default experiment",
    missingExperiment: "Default missing experiment",
  },
};

describe("@messagevisor/module-featurevisor", function () {
  it("connects feature and experiment conditions to a Featurevisor instance", function () {
    const f = createInstance({
      logLevel: "fatal",
      sticky: {
        "new-checkout": {
          enabled: true,
        },
        "legacy-checkout": {
          enabled: false,
        },
        "checkout-copy": {
          enabled: true,
          variation: "bold",
        },
      },
    });
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [createFeaturevisorModule({ instance: f })],
    });

    expect(m.translate("checkout")).toEqual("Fast checkout");
    expect(m.translate("experiment")).toEqual("Bold checkout copy");
    expect(m.translate("missingExperiment")).toEqual("Default missing experiment");
  });

  it("supports isDisabled feature conditions", function () {
    const f = createInstance({
      logLevel: "fatal",
      sticky: {
        "new-checkout": {
          enabled: false,
        },
        "legacy-checkout": {
          enabled: false,
        },
      },
    });
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [createFeaturevisorModule({ instance: f })],
    });

    expect(m.translate("checkout")).toEqual("Classic checkout");
  });

  it("does not pass Messagevisor context to Featurevisor evaluations by default", function () {
    const calls: Array<{ method: string; key: string; context: unknown }> = [];
    const instance = {
      isEnabled(featureKey, context) {
        calls.push({ method: "isEnabled", key: featureKey, context });
        return true;
      },
      getVariation(experimentKey, context) {
        calls.push({ method: "getVariation", key: experimentKey, context });
        return "bold";
      },
    } as unknown as FeaturevisorInstance;
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      context: {
        platform: "web",
        plan: "pro",
      },
      modules: [createFeaturevisorModule({ instance })],
    });

    expect(m.translate("checkout", {}, { context: { userId: "user-123" } })).toEqual(
      "Fast checkout",
    );
    expect(m.translate("experiment")).toEqual("Bold checkout copy");
    expect(calls).toEqual([
      {
        method: "isEnabled",
        key: "new-checkout",
        context: undefined,
      },
      {
        method: "getVariation",
        key: "checkout-copy",
        context: undefined,
      },
    ]);
  });

  it("passes merged Messagevisor context to Featurevisor evaluations when enabled", function () {
    const calls: Array<{ method: string; key: string; context: unknown }> = [];
    const instance = {
      isEnabled(featureKey, context) {
        calls.push({ method: "isEnabled", key: featureKey, context });
        return context?.platform === "web" && context?.userId === "user-123";
      },
      getVariation(experimentKey, context) {
        calls.push({ method: "getVariation", key: experimentKey, context });
        return context?.plan === "pro" ? "bold" : null;
      },
    } as unknown as FeaturevisorInstance;
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      context: {
        platform: "web",
        plan: "pro",
      },
      modules: [createFeaturevisorModule({ instance, passContext: true })],
    });

    expect(m.translate("checkout", {}, { context: { userId: "user-123" } })).toEqual(
      "Fast checkout",
    );
    expect(m.translate("experiment")).toEqual("Bold checkout copy");
    expect(calls).toEqual([
      {
        method: "isEnabled",
        key: "new-checkout",
        context: {
          platform: "web",
          plan: "pro",
          userId: "user-123",
        },
      },
      {
        method: "getVariation",
        key: "checkout-copy",
        context: {
          platform: "web",
          plan: "pro",
        },
      },
    ]);
  });

  it("converts null variations to non-matches", function () {
    const instance = {
      isEnabled() {
        return false;
      },
      getVariation() {
        return null;
      },
    } as unknown as FeaturevisorInstance;
    const m = createMessagevisor({
      datafile,
      logLevel: "fatal",
      modules: [createFeaturevisorModule({ instance })],
    });

    expect(m.translate("experiment")).toEqual("Default experiment");
  });

  it("uses a stable default module name and supports custom names", function () {
    expect(createFeaturevisorModule({ instance: {} as FeaturevisorInstance }).name).toEqual(
      "featurevisor",
    );
    expect(
      createFeaturevisorModule({
        name: "flags",
        instance: {} as FeaturevisorInstance,
      }).name,
    ).toEqual("flags");
  });

  it("requires a Featurevisor instance", function () {
    expect(() => createFeaturevisorModule({ instance: undefined as any })).toThrow(
      "Featurevisor module requires an instance.",
    );
  });
});
