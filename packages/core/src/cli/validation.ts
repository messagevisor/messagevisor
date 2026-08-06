import { MessagevisorCLIError } from "../error";

export function parseRegexOption(name: string, value: unknown, flags = "") {
  if (value instanceof RegExp) {
    return value;
  }

  try {
    return new RegExp(String(value), flags);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new MessagevisorCLIError(`Invalid ${name}: ${detail}`, {
      code: "invalid_regular_expression",
      details: { option: name, value: String(value) },
    });
  }
}
