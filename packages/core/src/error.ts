/**
 * Machine-readable error codes emitted by the built-in CLI.
 *
 * Keep these values stable. Consumers should branch on the code and use the
 * message only for display. `cli_error` remains the compatibility fallback
 * for third-party plugins that have not classified their errors yet.
 */
export const MESSAGEVISOR_CLI_ERROR_CODES = {
  cliError: "cli_error",
  internalError: "internal_error",
  invalidCliArguments: "invalid_cli_arguments",
  duplicateCliCommand: "duplicate_cli_command",
  unknownCommand: "unknown_command",
  invalidRegularExpression: "invalid_regular_expression",
  invalidInput: "invalid_input",
  invalidConfiguration: "invalid_configuration",
  unknownConfigOption: "unknown_config_option",
  invalidProjectConfiguration: "invalid_project_configuration",
  invalidEntityKey: "invalid_entity_key",
  invalidEntityPath: "invalid_entity_path",
  entityNotFound: "entity_not_found",
  entityAlreadyExists: "entity_already_exists",
  entityConflict: "entity_conflict",
  unknownAttribute: "unknown_attribute",
  unknownSegment: "unknown_segment",
  unknownFormat: "unknown_format",
  missingLocale: "missing_locale",
  duplicateMutation: "duplicate_mutation",
  editorialMutationInProgress: "editorial_mutation_in_progress",
  downloadFailed: "download_failed",
  gitCommandFailed: "git_command_failed",
  gitRefNotFound: "git_ref_not_found",
  missingGitRef: "missing_git_ref",
  projectNotFound: "project_not_found",
  invalidProjectPath: "invalid_project_path",
  unknownLocale: "unknown_locale",
  unknownMessage: "unknown_message",
  unknownTarget: "unknown_target",
  unknownSet: "unknown_set",
  noSets: "no_sets",
  setsNotEnabled: "sets_not_enabled",
  setRequiredForJson: "set_required_for_json",
  noMatchingMessages: "no_matching_messages",
  missingRequiredOption: "missing_required_option",
  conflictingOptions: "conflicting_options",
  invalidOption: "invalid_option",
  invalidJson: "invalid_json",
  invalidCsv: "invalid_csv",
  invalidFormat: "invalid_format",
  invalidAuditFormat: "invalid_audit_format",
  invalidConflictStrategy: "invalid_conflict_strategy",
  invalidOverride: "invalid_override",
  duplicateOverride: "duplicate_override",
  promotionPreflightFailed: "promotion_preflight_failed",
  promotionNotAllowed: "promotion_not_allowed",
  promotionConflict: "promotion_conflict",
  jsonPrettyNotSupported: "json_pretty_not_supported",
} as const;

export type MessagevisorCLIErrorCode =
  (typeof MESSAGEVISOR_CLI_ERROR_CODES)[keyof typeof MESSAGEVISOR_CLI_ERROR_CODES];

export class MessagevisorCLIError extends Error {
  public readonly cliMessage: string;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, options: { code?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    Object.setPrototypeOf(this, MessagevisorCLIError.prototype);
    this.name = "MessagevisorCLIError";
    this.cliMessage = message;
    this.code = options.code || MESSAGEVISOR_CLI_ERROR_CODES.cliError;
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
      { error: { code: MESSAGEVISOR_CLI_ERROR_CODES.internalError, message, details: {} } },
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
