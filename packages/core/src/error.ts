export class MessagevisorCLIError extends Error {
  public readonly cliMessage: string;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, options: { code?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "MessagevisorCLIError";
    this.cliMessage = message;
    this.code = options.code || "cli_error";
    this.details = options.details || {};
  }

  toJSON() {
    return { error: { code: this.code, message: this.cliMessage, details: this.details } };
  }
}

export function getMessagevisorCLIError(error: unknown) {
  if (error instanceof MessagevisorCLIError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "cliMessage" in error &&
    typeof (error as { cliMessage?: unknown }).cliMessage === "string"
  ) {
    return new MessagevisorCLIError((error as { cliMessage: string }).cliMessage, {
      code:
        "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined,
      details:
        "details" in error &&
        typeof (error as { details?: unknown }).details === "object" &&
        (error as { details?: unknown }).details !== null
          ? (error as { details: Record<string, unknown> }).details
          : undefined,
    });
  }
  return undefined;
}

export function getMessagevisorCLIErrorMessage(error: unknown) {
  return getMessagevisorCLIError(error)?.cliMessage;
}

export function formatMessagevisorCLIError(
  error: unknown,
  options: { json?: boolean; pretty?: boolean } = {},
) {
  const cliError = getMessagevisorCLIError(error);
  if (!cliError) return error;
  return options.json
    ? JSON.stringify(cliError.toJSON(), null, options.pretty ? 2 : 0)
    : cliError.cliMessage;
}

export function printMessagevisorCLIError(error: unknown) {
  const cliError = getMessagevisorCLIError(error);

  if (!cliError) {
    return false;
  }

  const json = process.argv.includes("--json");
  const pretty = process.argv.includes("--pretty");
  console.error(formatMessagevisorCLIError(cliError, { json, pretty }));
  return true;
}
