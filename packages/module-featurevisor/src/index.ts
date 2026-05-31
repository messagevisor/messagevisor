import type { Context as FeaturevisorContext, FeaturevisorInstance } from "@featurevisor/sdk";
import type { MessagevisorModule } from "@messagevisor/sdk";
import type { Context } from "@messagevisor/types";

export interface FeaturevisorModuleOptions {
  name?: string;
  instance: FeaturevisorInstance;
  passContext?: boolean;
}

export function createFeaturevisorModule(options: FeaturevisorModuleOptions): MessagevisorModule {
  const name = options.name || "featurevisor";
  const instance = options.instance;
  const passContext = options.passContext === true;

  if (!instance) {
    throw new Error("Featurevisor module requires an instance.");
  }

  return {
    name,
    setup({ setFlagResolver, setVariationResolver }) {
      setFlagResolver((featureKey, context?: Context) => {
        if (passContext) {
          return instance.isEnabled(featureKey, context as FeaturevisorContext);
        }

        return instance.isEnabled(featureKey);
      });

      setVariationResolver((experimentKey, context?: Context) => {
        const variation = passContext
          ? instance.getVariation(experimentKey, context as FeaturevisorContext)
          : instance.getVariation(experimentKey);

        return variation ?? null;
      });
    },
  };
}
