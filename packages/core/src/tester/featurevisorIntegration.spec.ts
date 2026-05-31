import { createInstance as createFeaturevisor } from "@featurevisor/sdk";
import { createMessagevisor } from "@messagevisor/sdk";
import type { DatafileContent } from "@messagevisor/types";

const messagevisorDatafile: DatafileContent = {
  schemaVersion: "1",
  messagevisorVersion: "0.0.1",
  revision: "1",
  target: "web",
  locale: "en-US",
  segments: {},
  translations: {
    checkoutBanner: "Classic checkout",
    disabledBanner: "Checkout enabled",
  },
  messages: {
    checkoutBanner: {
      overrides: [
        {
          key: "faster-checkout-bold",
          conditions: {
            and: [
              { feature: "new-checkout", operator: "isEnabled" },
              { experiment: "checkout-copy", operator: "hasVariation", value: "bold" },
            ],
          },
          translation: "Faster checkout",
        },
      ],
    },
    disabledBanner: {
      overrides: [
        {
          key: "checkout-disabled",
          conditions: { feature: "new-checkout", operator: "isDisabled" },
          translation: "Checkout disabled",
        },
      ],
    },
  },
};

const featurevisorDatafile = {
  schemaVersion: "2",
  revision: "1",
  segments: {},
  features: {
    "new-checkout": {
      key: "new-checkout",
      bucketBy: "userId",
      traffic: [
        {
          key: "1",
          segments: "*",
          percentage: 100000,
          allocation: [],
        },
      ],
    },
    "checkout-copy": {
      key: "checkout-copy",
      bucketBy: "userId",
      variations: [{ value: "control" }, { value: "bold" }],
      traffic: [
        {
          key: "1",
          segments: "*",
          percentage: 100000,
          allocation: [
            { variation: "control", range: [0, 0] },
            { variation: "bold", range: [0, 100000] },
          ],
        },
      ],
    },
  },
};

describe("Featurevisor integration", function () {
  it("uses Featurevisor SDK evaluations for Messagevisor feature and experiment conditions", function () {
    const context = { userId: "user-123" };
    const featurevisor = createFeaturevisor({
      datafile: featurevisorDatafile as any,
      context,
      logLevel: "warn",
    });
    const messagevisor = createMessagevisor({
      datafile: messagevisorDatafile,
      context,
      resolveFlag: (featureKey) => featurevisor.isEnabled(featureKey, context),
      resolveVariation: (experimentKey) =>
        featurevisor.getVariation(experimentKey, context) as string,
      logLevel: "warn",
    });

    expect(featurevisor.isEnabled("new-checkout", context)).toEqual(true);
    expect(featurevisor.getVariation("checkout-copy", context)).toEqual("bold");
    expect(messagevisor.translate("checkoutBanner")).toEqual("Faster checkout");
    expect(messagevisor.translate("disabledBanner")).toEqual("Checkout enabled");
  });
});
