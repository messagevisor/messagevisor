export class MessagevisorCLIError extends Error {
  public readonly cliMessage: string;

  constructor(message: string) {
    super(message);
    this.name = "MessagevisorCLIError";
    this.cliMessage = message;
  }
}

export function getMessagevisorCLIErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "cliMessage" in error &&
    typeof (error as { cliMessage?: unknown }).cliMessage === "string"
  ) {
    return (error as { cliMessage: string }).cliMessage;
  }

  return undefined;
}

export function printMessagevisorCLIError(error: unknown) {
  const message = getMessagevisorCLIErrorMessage(error);

  if (typeof message === "undefined") {
    return false;
  }

  console.error(message);
  return true;
}
