// exports
import type { MessagevisorFormatPayload, MessagevisorModule } from "@messagevisor/sdk";

export interface InterpolationModuleOptions {
  name?: string;
  pattern?: RegExp;
}

const DEFAULT_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function toGlobalPattern(pattern: RegExp = DEFAULT_PATTERN) {
  const flags = Array.from(new Set(`${pattern.flags}g`.split(""))).join("");
  return new RegExp(pattern.source, flags);
}

function isInterpolatableValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function createInterpolationModule(
  options: InterpolationModuleOptions = {},
): MessagevisorModule {
  const pattern = toGlobalPattern(options.pattern);

  return {
    name: options.name || "interpolation",
    format(payload: MessagevisorFormatPayload) {
      if (typeof payload.translation !== "string") {
        return;
      }

      return payload.translation.replace(pattern, (match, variableName: unknown) => {
        if (typeof variableName !== "string") {
          return match;
        }

        const value = payload.values?.[variableName];

        return isInterpolatableValue(value) ? String(value) : match;
      });
    },
  };
}
