export class MessagevisorCLIError extends Error {
  public readonly cliMessage: string;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, options: { code?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    Object.setPrototypeOf(this, MessagevisorCLIError.prototype);
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
  if (!cliError) {
    if (!options.json) return error;

    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify(
      { error: { code: "internal_error", message, details: {} } },
      null,
      options.pretty ? 2 : 0,
    );
  }

  const envelope = {
    error: {
      code: cliError.code,
      message: cliError.cliMessage,
      details: cliError.details,
    },
  };

  return options.json
    ? JSON.stringify(envelope, null, options.pretty ? 2 : 0)
    : cliError.cliMessage;
}

export function printMessagevisorCLIError(error: unknown, options: { [key: string]: any } = {}) {
  const cliError = getMessagevisorCLIError(error);

  if (!cliError) {
    return false;
  }

  console.error(formatMessagevisorCLIError(cliError, options));
  return true;
}
