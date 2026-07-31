export { createMessagevisor } from "./instance.js";
export { evaluateCondition, evaluateGroupSegment, evaluateSegment } from "./conditions.js";
export { getPortableRegexError } from "./portableRegex.js";
export type { EvaluateOptions as MessagevisorEvaluationDataProvider } from "./conditions.js";

// `createMessagevisor()` is the primary runtime API. Keep the rest type-only so
// internal implementation helpers do not accidentally become public contracts.
export type {
  EvaluationOptions,
  ChangeEventDetails,
  ContextSetEventDetails,
  CurrencySetEventDetails,
  DatafileSetEventDetails,
  ErrorEventDetails,
  LocaleSetEventDetails,
  MessageFormatResult,
  MessagePrimitiveValue,
  MessageValue,
  MessageValues,
  Messagevisor,
  MessagevisorChild,
  MessagevisorDiagnostic,
  MessagevisorDiagnosticCode,
  MessagevisorDiagnosticDetails,
  MessagevisorDiagnosticHandler,
  MessagevisorEvent,
  MessagevisorEventCallback,
  MessagevisorEventDetailsByName,
  MessagevisorEventName,
  MessagevisorFormatPayload,
  MessagevisorLogLevel,
  MessagevisorModule,
  MessagevisorModuleApi,
  MessagevisorModuleDiagnosticOptions,
  MessagevisorModuleReportedDiagnostic,
  MessagevisorModuleSetupApi,
  MessagevisorModuleUnsubscribe,
  MessagevisorOptions,
  MessagevisorSnapshot,
  MessagevisorTransformPayload,
  MessagevisorTranslationSource,
  MessagevisorUnsubscribe,
  SpawnOptions,
  TranslateOptions,
  TimeZoneSetEventDetails,
} from "./instance.js";

export type * from "@messagevisor/types";
