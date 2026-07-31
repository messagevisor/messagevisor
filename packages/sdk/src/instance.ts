import type {
  Context,
  DatafileContent,
  DatafileMessage,
  FormatDateTimePresetOptions,
  FormatNumberPresetOptions,
  FormatPresets,
  FormatRelativeTimePresetOptions,
  LocaleDirection,
  LocaleKey,
  MessageKey,
  MessageMeta,
} from "@messagevisor/types";

import { evaluateCondition, evaluateGroupSegment } from "./conditions.js";

export interface MessagevisorOptions {
  datafile?: DatafileContent | string;
  defaultTranslations?: Record<LocaleKey, Record<MessageKey, string>>;
  defaultFormats?: Record<LocaleKey, FormatPresets>;
  currency?: string;
  timeZone?: string;
  context?: Context;
  locale?: LocaleKey;
  resolveFlag?: (featureKey: string, context?: Context) => boolean;
  resolveVariation?: (experimentKey: string, context?: Context) => string | null;
  onDiagnostic?: MessagevisorDiagnosticHandler;
  logLevel?: MessagevisorLogLevel;
  modules?: MessagevisorModule[];
}

export interface EvaluationOptions {
  locale?: LocaleKey;
  currency?: string;
  timeZone?: string;
  formats?: FormatPresets;
  moduleOptions?: Record<string, unknown>;
}

export interface TranslateOptions extends EvaluationOptions {
  context?: Context;
  defaultTranslation?: string;
}

export type MessagePrimitiveValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | unknown[]
  | Record<string, unknown>;

export type MessageValue<T = never> = MessagePrimitiveValue | ((chunks: Array<string | T>) => T);

export type MessageValues<T = never> = Record<string, MessageValue<T>>;

/**
 * JavaScript-enhanced return shape for modules that produce rich values.
 *
 * The portable Messagevisor SDK contract for other languages may return strings
 * only from translate() and formatMessage(). Rich callback values, framework
 * nodes, and arrays are JavaScript-specific capabilities.
 */
export type MessageFormatResult<T = never> = [T] extends [never]
  ? string
  : string | T | Array<string | T>;

export type MessagevisorTranslationSource = "translation" | "formatMessage";

export interface MessagevisorTransformPayload {
  translation: unknown;
  locale: LocaleKey;
  source: MessagevisorTranslationSource;
  messageKey?: MessageKey;
  meta?: MessageMeta;
}

export interface MessagevisorFormatPayload {
  translation: unknown;
  values?: MessageValues<any>;
  locale: LocaleKey;
  source: MessagevisorTranslationSource;
  messageKey?: MessageKey;
  meta?: MessageMeta;
  formats: FormatPresets;
  moduleOptions?: Record<string, unknown>;
}

export interface MessagevisorModuleApi {
  setFlagResolver: (resolver?: (featureKey: string, context?: Context) => boolean) => void;
  setVariationResolver: (
    resolver?: (experimentKey: string, context?: Context) => string | null,
  ) => void;
  getRevision: (locale?: LocaleKey) => string;
  onDiagnostic: (
    handler: MessagevisorDiagnosticHandler,
    options?: MessagevisorModuleDiagnosticOptions,
  ) => MessagevisorUnsubscribe;
  reportDiagnostic: (diagnostic: MessagevisorModuleReportedDiagnostic) => void;
}

export type MessagevisorModuleSetupApi = MessagevisorModuleApi;

export interface MessagevisorModule {
  name?: string;
  setup?: (api: MessagevisorModuleApi) => void;
  format?: (payload: MessagevisorFormatPayload, api?: MessagevisorModuleApi) => unknown;
  transform?: (payload: MessagevisorTransformPayload, api?: MessagevisorModuleApi) => unknown;
  close?: () => void | Promise<void>;
}

export type MessagevisorModuleUnsubscribe = () => Promise<void>;

export type MessagevisorDiagnosticCode =
  | "sdk_initialized"
  | "missing_translation"
  | "missing_datafile"
  | "missing_locale"
  | "invalid_datafile"
  | "invalid_message"
  | "unsupported_formatter"
  | "missing_format"
  | "invalid_format"
  | "message_override_matched"
  | "deprecated_message"
  | "duplicate_module"
  | "module_setup_error"
  | "module_close_error"
  | (string & {});

export type MessagevisorDiagnosticDetails = Record<string, unknown>;

export interface MessagevisorDiagnostic {
  level: MessagevisorLogLevel;
  code: MessagevisorDiagnosticCode;
  message: string;
  /** Structured diagnostic context. Always present, including when empty. */
  details: MessagevisorDiagnosticDetails;
  module?: string;
  moduleName?: string;
  originalError?: unknown;
}

export interface MessagevisorModuleReportedDiagnostic extends Omit<
  MessagevisorDiagnostic,
  "details" | "module" | "moduleName"
> {
  /** Additional module-owned context, normalized to an object by the SDK. */
  details?: MessagevisorDiagnosticDetails;
}

type MessagevisorDiagnosticInput = Omit<MessagevisorDiagnostic, "details"> & {
  details?: MessagevisorDiagnosticDetails;
};

export type MessagevisorDiagnosticHandler = (diagnostic: MessagevisorDiagnostic) => void;

export type MessagevisorLogLevel = "fatal" | "error" | "warn" | "info" | "debug";

export interface MessagevisorModuleDiagnosticOptions {
  logLevel?: MessagevisorLogLevel;
}

interface MessagevisorModuleDiagnosticSubscription {
  moduleKey: string;
  handler: MessagevisorDiagnosticHandler;
  logLevel: MessagevisorLogLevel;
}

interface MessagevisorCache {
  numberFormat: Record<string, Intl.NumberFormat>;
  dateTimeFormat: Record<string, Intl.DateTimeFormat>;
  relativeTimeFormat: Record<string, Intl.RelativeTimeFormat>;
  pluralRules: Record<string, Intl.PluralRules>;
  listFormat: Record<string, any>;
  displayNames: Record<string, any>;
  order: Record<keyof Omit<MessagevisorCache, "order">, string[]>;
}

export type MessagevisorEventName =
  | "change"
  | "error"
  | "datafile_set"
  | "locale_set"
  | "context_set"
  | "currency_set"
  | "timeZone_set";

export type MessagevisorUnsubscribe = () => void;

export interface MessagevisorSnapshot {
  version: number;
  locale: LocaleKey | null;
  direction?: LocaleDirection;
  context: Context;
  currency?: string;
  timeZone?: string;
  datafileLocales: LocaleKey[];
  datafileRevisionsByLocale: Record<LocaleKey, string>;
}

interface MessagevisorEventBase {
  version: number;
  snapshot: MessagevisorSnapshot;
  previousSnapshot: MessagevisorSnapshot;
}

export interface DatafileSetEventDetails {
  datafile: DatafileContent;
  /** Locale whose stored datafile changed. */
  locale: LocaleKey;
  /** Locale currently selected for evaluation after the update. */
  activeLocale: LocaleKey | null;
  previousLocale: LocaleKey | null;
  replaced: boolean;
}
export interface LocaleSetEventDetails {
  locale: LocaleKey;
  previousLocale: LocaleKey | null;
}
export interface ContextSetEventDetails {
  context: Context;
  previousContext: Context;
  replaced: boolean;
}
export interface CurrencySetEventDetails {
  currency: string;
  previousCurrency?: string;
}
export interface TimeZoneSetEventDetails {
  timeZone: string;
  previousTimeZone?: string;
}
export interface ErrorEventDetails {
  diagnostic: MessagevisorDiagnostic;
}
export type ChangeEventDetails =
  | ({ source: "datafile_set" } & DatafileSetEventDetails)
  | ({ source: "locale_set" } & LocaleSetEventDetails)
  | ({ source: "context_set" } & ContextSetEventDetails)
  | ({ source: "currency_set" } & CurrencySetEventDetails)
  | ({ source: "timeZone_set" } & TimeZoneSetEventDetails);

export interface MessagevisorEventDetailsByName {
  change: ChangeEventDetails;
  error: ErrorEventDetails;
  datafile_set: DatafileSetEventDetails;
  locale_set: LocaleSetEventDetails;
  context_set: ContextSetEventDetails;
  currency_set: CurrencySetEventDetails;
  timeZone_set: TimeZoneSetEventDetails;
}

export type MessagevisorEvent<T extends MessagevisorEventName = MessagevisorEventName> =
  T extends MessagevisorEventName
    ? MessagevisorEventBase & { type: T } & MessagevisorEventDetailsByName[T]
    : never;

export type MessagevisorEventCallback<T extends MessagevisorEventName = MessagevisorEventName> = (
  event: MessagevisorEvent<T>,
) => void;

export interface SpawnOptions {
  locale?: LocaleKey;
  currency?: string;
  timeZone?: string;
}

export type MessagevisorChild = Omit<
  Messagevisor,
  "addModule" | "removeModule" | "setDatafile" | "spawn"
>;

const DEFAULT_CURRENCY = "USD";
const LOG_PREFIX = "[Messagevisor]";
const FORMATTER_CACHE_LIMIT = 100;

class MessagevisorCloseError extends Error {
  public readonly errors: unknown[];

  constructor(message: string, errors: unknown[]) {
    super(message);
    this.name = "MessagevisorCloseError";
    this.errors = errors;
  }
}

function createEmptyRecord<T>() {
  return {} as Record<string, T>;
}

function createMessagevisorCache(): MessagevisorCache {
  return {
    numberFormat: createEmptyRecord<Intl.NumberFormat>(),
    dateTimeFormat: createEmptyRecord<Intl.DateTimeFormat>(),
    relativeTimeFormat: createEmptyRecord<Intl.RelativeTimeFormat>(),
    pluralRules: createEmptyRecord<Intl.PluralRules>(),
    listFormat: createEmptyRecord<any>(),
    displayNames: createEmptyRecord<any>(),
    order: {
      numberFormat: [],
      dateTimeFormat: [],
      relativeTimeFormat: [],
      pluralRules: [],
      listFormat: [],
      displayNames: [],
    },
  };
}

function getFormatterCacheKey(locale: string, options: Record<string, any>) {
  var keys = Object.keys(options).sort();
  var parts = [locale];
  for (var i = 0; i < keys.length; i++) {
    parts.push(keys[i], JSON.stringify(options[keys[i]]));
  }
  return parts.join("|");
}

function cacheFormatter<T>(values: Record<string, T>, order: string[], key: string, formatter: T) {
  if (order.length >= FORMATTER_CACHE_LIMIT) {
    delete values[order.shift() as string];
  }
  order.push(key);
  values[key] = formatter;
  return formatter;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(parent?: T, child?: T): T | undefined {
  if (typeof parent === "undefined") {
    return child;
  }

  if (typeof child === "undefined") {
    return parent;
  }

  if (!isPlainObject(parent) || !isPlainObject(child)) {
    return child;
  }

  const result: Record<string, unknown> = { ...parent };

  for (const key of Object.keys(child)) {
    result[key] = deepMerge(result[key], child[key]);
  }

  return result as T;
}

function getDefaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveCurrency(
  optionCurrency: string | undefined,
  presetCurrency: string | undefined,
  instanceCurrency: string | undefined,
) {
  return optionCurrency || presetCurrency || instanceCurrency || DEFAULT_CURRENCY;
}

function resolveTimeZone(
  optionTimeZone: string | undefined,
  formatTimeZone: string | undefined,
  instanceTimeZone: string | undefined,
) {
  return optionTimeZone || formatTimeZone || instanceTimeZone || getDefaultTimeZone();
}

function resolveDateTimeOptions(
  formatOptions: FormatDateTimePresetOptions | undefined,
  options: EvaluationOptions,
  instanceTimeZone: string | undefined,
) {
  return {
    ...(formatOptions || {}),
    timeZone: resolveTimeZone(options.timeZone, formatOptions?.timeZone, instanceTimeZone),
  } as Intl.DateTimeFormatOptions;
}

function shouldLog(currentLevel: MessagevisorLogLevel, level: MessagevisorLogLevel) {
  const order: MessagevisorLogLevel[] = ["fatal", "error", "warn", "info", "debug"];

  return order.indexOf(currentLevel) >= order.indexOf(level);
}

function mergeStoredDatafile(
  existing: DatafileContent | undefined,
  incoming: DatafileContent,
): DatafileContent {
  if (!existing) {
    return incoming;
  }

  return {
    schemaVersion: incoming.schemaVersion,
    messagevisorVersion: incoming.messagevisorVersion,
    revision: incoming.revision,
    target: incoming.target,
    locale: incoming.locale,
    direction: incoming.direction ?? existing.direction,
    formats: incoming.formats,
    segments: {
      ...(existing.segments || {}),
      ...(incoming.segments || {}),
    },
    messages: {
      ...(existing.messages || {}),
      ...(incoming.messages || {}),
    },
    translations: {
      ...(existing.translations || {}),
      ...(incoming.translations || {}),
    },
  };
}

export class Messagevisor {
  private datafiles: Record<LocaleKey, DatafileContent> = {};
  private defaultTranslationsByLocale: Record<LocaleKey, Record<string, string>> = {};
  private defaultFormatsByLocale: Record<LocaleKey, FormatPresets | undefined> = {};
  private locale: LocaleKey | null = null;
  private context: Context = {};
  private currency?: string;
  private timeZone?: string;
  private resolveFlag?: (featureKey: string, context?: Context) => boolean;
  private resolveVariation?: (experimentKey: string, context?: Context) => string | null;
  private hasOwnFlagResolver = false;
  private hasOwnVariationResolver = false;
  private moduleFlagResolvers: Array<{
    moduleKey: string;
    resolver: (featureKey: string, context?: Context) => boolean;
  }> = [];
  private moduleVariationResolvers: Array<{
    moduleKey: string;
    resolver: (experimentKey: string, context?: Context) => string | null;
  }> = [];
  private onDiagnostic?: MessagevisorDiagnosticHandler;
  private logLevel: MessagevisorLogLevel = "info";
  private cache: MessagevisorCache;
  private modules: MessagevisorModule[] = [];
  private moduleDiagnosticSubscriptions: MessagevisorModuleDiagnosticSubscription[] = [];
  private moduleApis: Record<string, MessagevisorModuleApi> = {};
  private moduleApiId = 0;
  private closed = false;
  private closePromise?: Promise<void>;
  private version = 0;
  private ownsModules = true;
  private parent?: Messagevisor;
  private parentUnsubscribers: MessagevisorUnsubscribe[] = [];
  private observedParentDatafileState?: Pick<
    MessagevisorSnapshot,
    "datafileLocales" | "datafileRevisionsByLocale" | "direction"
  >;
  private listeners: Record<MessagevisorEventName, MessagevisorEventCallback<any>[]> = {
    change: [],
    error: [],
    datafile_set: [],
    locale_set: [],
    context_set: [],
    currency_set: [],
    timeZone_set: [],
  };

  constructor(options: MessagevisorOptions = {}, parent?: Messagevisor) {
    this.parent = parent;
    this.ownsModules = !parent;
    this.currency = options.currency;
    this.timeZone = options.timeZone;
    this.context = options.context || {};
    this.resolveFlag = options.resolveFlag;
    this.resolveVariation = options.resolveVariation;
    this.hasOwnFlagResolver = typeof options.resolveFlag !== "undefined";
    this.hasOwnVariationResolver = typeof options.resolveVariation !== "undefined";
    this.logLevel = options.logLevel || "info";
    this.onDiagnostic = options.onDiagnostic;
    this.cache = parent?.cache || createMessagevisorCache();
    (options.modules || []).forEach((module) => {
      this.addModule(module);
    });

    if (options.defaultTranslations) {
      this.defaultTranslationsByLocale = { ...options.defaultTranslations };
    }

    if (options.defaultFormats) {
      this.defaultFormatsByLocale = { ...options.defaultFormats };
    }

    if (options.datafile) {
      this.setDatafile(options.datafile);
    } else {
      this.locale = options.locale || null;
    }

    if (parent) {
      this.datafiles = parent.datafiles;
      this.defaultTranslationsByLocale = parent.defaultTranslationsByLocale;
      this.defaultFormatsByLocale = parent.defaultFormatsByLocale;
      this.captureObservedParentDatafileState();
      this.trackParentSubscription(
        parent.on("datafile_set", (event) => this.forwardParentDatafileEvent(event)),
      );
    } else {
      this.reportDiagnostic({
        level: "info",
        code: "sdk_initialized",
        message: "SDK initialized",
      });
    }
  }

  subscribe(callback: () => void): MessagevisorUnsubscribe {
    if (this.closed) {
      return () => {};
    }

    return this.on("change", callback);
  }

  setLogLevel(level: MessagevisorLogLevel) {
    this.logLevel = level;
  }

  on<T extends MessagevisorEventName>(
    eventName: T,
    callback: MessagevisorEventCallback<T>,
  ): MessagevisorUnsubscribe {
    if (this.closed) {
      return () => {};
    }

    return this.addLocalListener(eventName, callback);
  }

  private captureObservedParentDatafileState() {
    const snapshot = this.getSnapshot();
    this.observedParentDatafileState = {
      datafileLocales: snapshot.datafileLocales.slice(),
      datafileRevisionsByLocale: { ...snapshot.datafileRevisionsByLocale },
      direction: snapshot.direction,
    };
  }

  private forwardParentDatafileEvent(event: MessagevisorEvent<"datafile_set">) {
    if (this.closed) return;

    const current = this.getSnapshot();
    const observed = this.observedParentDatafileState;
    const previousSnapshot = observed
      ? {
          ...current,
          direction: observed.direction,
          datafileLocales: observed.datafileLocales.slice(),
          datafileRevisionsByLocale: { ...observed.datafileRevisionsByLocale },
        }
      : current;

    this.emit("datafile_set", previousSnapshot, {
      datafile: event.datafile,
      locale: event.locale,
      activeLocale: this.locale,
      previousLocale: this.locale,
      replaced: event.replaced,
    });
    this.captureObservedParentDatafileState();
  }

  private addLocalListener<T extends MessagevisorEventName>(
    eventName: T,
    callback: MessagevisorEventCallback<T>,
  ): MessagevisorUnsubscribe {
    if (this.listeners[eventName].indexOf(callback) === -1) {
      this.listeners[eventName].push(callback as MessagevisorEventCallback<any>);
    }

    return () => {
      this.listeners[eventName] = this.listeners[eventName].filter(
        (listener) => listener !== callback,
      );
    };
  }

  private trackParentSubscription(unsubscribeParent: MessagevisorUnsubscribe) {
    let active = true;
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      unsubscribeParent();
      this.parentUnsubscribers = this.parentUnsubscribers.filter((entry) => entry !== unsubscribe);
    };
    this.parentUnsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  getSnapshot(): MessagevisorSnapshot {
    const datafileRevisionsByLocale: Record<LocaleKey, string> = {};

    Object.keys(this.datafiles).forEach((locale) => {
      datafileRevisionsByLocale[locale] = this.datafiles[locale].revision;
    });

    return {
      version: this.version,
      locale: this.locale,
      direction: this.locale ? this.datafiles[this.locale]?.direction : undefined,
      context: { ...this.context },
      currency: this.currency,
      timeZone: this.timeZone,
      datafileLocales: Object.keys(this.datafiles),
      datafileRevisionsByLocale,
    };
  }

  /** Creates request-local state while sharing parent datafiles, modules, and formatter caches. */
  spawn(context: Context = {}, options: SpawnOptions = {}): MessagevisorChild {
    return new Messagevisor(
      {
        context: { ...this.context, ...context },
        locale: options.locale || this.locale || undefined,
        currency: options.currency || this.currency,
        timeZone: options.timeZone || this.timeZone,
        logLevel: this.logLevel,
        onDiagnostic: this.onDiagnostic,
      },
      this,
    );
  }

  addModule(module: MessagevisorModule): MessagevisorModuleUnsubscribe {
    if (this.closed) {
      return async () => {};
    }

    if (
      module.name &&
      this.modules.some((registeredModule) => registeredModule.name === module.name)
    ) {
      this.reportDiagnostic({
        level: "error",
        code: "duplicate_module",
        message: "Duplicate module name",
        moduleName: module.name,
      });
      return async () => {};
    }

    try {
      this.runModuleSetup(module);
    } catch (error) {
      this.clearModuleDiagnosticSubscriptions(module);
      this.reportDiagnostic({
        level: "error",
        code: "module_setup_error",
        message: "Module setup failed",
        moduleName: module.name,
        originalError: error,
      });
      void this.closeModule(module).catch(() => {});
      return async () => {};
    }
    this.modules.push(module);

    return async () => this.removeModuleInstance(module);
  }

  async removeModule(name: string): Promise<void> {
    if (this.closed) {
      return;
    }

    const removedModules = this.modules.filter((module) => module.name === name);
    const errors: unknown[] = [];
    for (const module of removedModules) {
      try {
        await this.removeModuleInstance(module);
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new MessagevisorCloseError("One or more Messagevisor modules failed to close.", errors);
    }
  }

  setFlagResolver(resolver?: (featureKey: string, context?: Context) => boolean) {
    this.resolveFlag = resolver;
    this.hasOwnFlagResolver = true;
  }

  setVariationResolver(resolver?: (experimentKey: string, context?: Context) => string | null) {
    this.resolveVariation = resolver;
    this.hasOwnVariationResolver = true;
  }

  private getFlagResolver(): ((featureKey: string, context?: Context) => boolean) | undefined {
    const moduleResolver = this.moduleFlagResolvers[this.moduleFlagResolvers.length - 1]?.resolver;
    if (moduleResolver) return moduleResolver;
    if (this.hasOwnFlagResolver) return this.resolveFlag;
    return this.parent?.getFlagResolver();
  }

  private getVariationResolver():
    | ((experimentKey: string, context?: Context) => string | null)
    | undefined {
    const moduleResolver =
      this.moduleVariationResolvers[this.moduleVariationResolvers.length - 1]?.resolver;
    if (moduleResolver) return moduleResolver;
    if (this.hasOwnVariationResolver) return this.resolveVariation;
    return this.parent?.getVariationResolver();
  }

  setCurrency(currency: string) {
    const previousSnapshot = this.getSnapshot();
    const previousCurrency = this.currency;

    this.currency = currency;

    this.emit("currency_set", previousSnapshot, {
      currency,
      previousCurrency,
    });
  }

  getCurrency() {
    return this.currency;
  }

  setTimeZone(timeZone: string) {
    const previousSnapshot = this.getSnapshot();
    const previousTimeZone = this.timeZone;

    this.timeZone = timeZone;

    this.emit("timeZone_set", previousSnapshot, {
      timeZone,
      previousTimeZone,
    });
  }

  getTimeZone() {
    return this.timeZone;
  }

  setDatafile(datafile: DatafileContent | string, replace = false) {
    const resolvedDatafile = this.resolveDatafileInput(datafile);

    if (!resolvedDatafile) {
      return;
    }

    const previousSnapshot = this.getSnapshot();
    const previousLocale = this.locale;
    const storedDatafile =
      !replace && this.datafiles[resolvedDatafile.locale]
        ? mergeStoredDatafile(this.datafiles[resolvedDatafile.locale], resolvedDatafile)
        : resolvedDatafile;

    this.datafiles[storedDatafile.locale] = storedDatafile;

    if (!this.locale) {
      this.locale = storedDatafile.locale;
    }

    this.emit("datafile_set", previousSnapshot, {
      datafile: storedDatafile,
      locale: storedDatafile.locale,
      activeLocale: this.locale,
      previousLocale,
      replaced: replace,
    });
  }

  setContext(context: Context, replace = false) {
    const previousSnapshot = this.getSnapshot();
    const previousContext = this.context;

    this.context = replace ? context : { ...this.context, ...context };

    this.emit("context_set", previousSnapshot, {
      context: { ...this.context },
      previousContext: { ...previousContext },
      replaced: replace,
    });
  }

  getContext() {
    return { ...this.context };
  }

  setLocale(locale: LocaleKey) {
    if (!this.datafiles[locale]) {
      throw new Error(`Datafile not found for locale: ${locale}`);
    }

    const previousSnapshot = this.getSnapshot();
    const previousLocale = this.locale;

    this.locale = locale;

    this.emit("locale_set", previousSnapshot, {
      locale,
      previousLocale,
    });
  }

  getLocale() {
    return this.locale;
  }

  getDirection(locale: LocaleKey | null = this.locale) {
    if (!locale) {
      return undefined;
    }

    return this.getDatafile(locale).direction;
  }

  getDatafile(locale: LocaleKey | null = this.locale) {
    if (!locale) {
      this.reportDiagnostic({
        level: "error",
        code: "missing_locale",
        message: "Datafile not found: no locale is set",
        details: { locale: this.locale },
      });
      throw new Error("Datafile not found: no locale is set");
    }

    const datafile = this.datafiles[locale];

    if (!datafile) {
      this.reportDiagnostic({
        level: "error",
        code: "missing_datafile",
        message: "Datafile not found for locale",
        details: { locale },
      });
      throw new Error(`Datafile not found for locale: ${locale}`);
    }

    return datafile;
  }

  getRevision(locale?: LocaleKey) {
    return this.getDatafile(locale || this.locale).revision;
  }

  private getCurrentLocale(options: Pick<EvaluationOptions, "locale"> = {}) {
    const locale = options.locale || this.locale;

    if (!locale) {
      this.reportDiagnostic({
        level: "error",
        code: "missing_locale",
        message: "Locale not set",
        details: { locale: this.locale },
      });
      throw new Error("Locale not set");
    }

    return locale;
  }

  private emitError(diagnostic: MessagevisorDiagnostic) {
    if (this.closed) {
      return;
    }

    const snapshot = this.getSnapshot();
    const event = {
      type: "error",
      version: this.version,
      snapshot,
      previousSnapshot: snapshot,
      diagnostic,
    } as MessagevisorEvent<"error">;

    this.triggerListeners("error", event);
  }

  private reportDiagnostic(diagnostic: MessagevisorDiagnosticInput, sourceModuleKey?: string) {
    const normalizedDiagnostic: MessagevisorDiagnostic = {
      ...diagnostic,
      details: diagnostic.details || {},
    };

    this.moduleDiagnosticSubscriptions.slice().forEach((subscription) => {
      if (subscription.moduleKey === sourceModuleKey) {
        return;
      }

      if (!shouldLog(subscription.logLevel, normalizedDiagnostic.level)) {
        return;
      }

      try {
        subscription.handler(normalizedDiagnostic);
      } catch (error) {
        console.error(error);
      }
    });

    if (shouldLog(this.logLevel, normalizedDiagnostic.level)) {
      if (this.onDiagnostic) {
        try {
          this.onDiagnostic(normalizedDiagnostic);
        } catch (error) {
          console.error(error);
        }
      } else {
        const method =
          normalizedDiagnostic.level === "fatal" || normalizedDiagnostic.level === "error"
            ? "error"
            : normalizedDiagnostic.level === "warn"
              ? "warn"
              : normalizedDiagnostic.level === "debug"
                ? "debug"
                : "info";
        console[method](LOG_PREFIX, normalizedDiagnostic.message, normalizedDiagnostic);
      }
    }

    if (normalizedDiagnostic.level === "error") {
      this.emitError(normalizedDiagnostic);
    }
  }

  private resolveDatafileInput(datafile: DatafileContent | string): DatafileContent | undefined {
    try {
      const parsedDatafile = typeof datafile === "string" ? JSON.parse(datafile) : datafile;

      if (!isPlainObject(parsedDatafile) || typeof parsedDatafile.locale !== "string") {
        throw new Error("Datafile must be an object with a string locale.");
      }

      return parsedDatafile as unknown as DatafileContent;
    } catch (error) {
      this.reportDiagnostic({
        level: "error",
        code: "invalid_datafile",
        message: "could not parse datafile",
        originalError: error,
      });

      return undefined;
    }
  }

  getDefaultTranslations(locale: LocaleKey | null = this.locale) {
    if (!locale) {
      return undefined;
    }

    return this.defaultTranslationsByLocale[locale];
  }

  getDefaultFormats(locale: LocaleKey | null = this.locale) {
    if (!locale) {
      return undefined;
    }

    return this.defaultFormatsByLocale[locale];
  }

  private getMessageFromDatafile(
    messageKey: MessageKey,
    options: TranslateOptions = {},
    locale = this.getCurrentLocale(options),
  ): string | undefined {
    const datafile = this.datafiles[locale];

    if (!datafile) {
      return undefined;
    }

    const evaluationContext = {
      ...this.context,
      ...(options.context || {}),
    };
    const message = datafile.messages[messageKey];
    const overrides = message?.overrides || [];

    for (let index = 0; index < overrides.length; index++) {
      const override = overrides[index];
      const matchesConditions = evaluateCondition(override.conditions, {
        context: evaluationContext,
        segments: datafile.segments,
        resolveFlag: this.getFlagResolver(),
        resolveVariation: this.getVariationResolver(),
      });
      const matchesSegments = evaluateGroupSegment(override.segments, {
        context: evaluationContext,
        segments: datafile.segments,
        resolveFlag: this.getFlagResolver(),
        resolveVariation: this.getVariationResolver(),
      });
      const matched = matchesConditions && matchesSegments;

      if (matched) {
        const diagnostic: MessagevisorDiagnosticInput = {
          level: "debug",
          code: "message_override_matched",
          message: "Message override matched",
          details: {
            locale,
            messageKey,
            overrideKey: override.key,
          },
        };

        this.reportDiagnostic(diagnostic);

        return override.translation;
      }
    }

    return datafile.translations[messageKey];
  }

  private getMessageMeta(
    messageKey: MessageKey,
    locale = this.getCurrentLocale(),
  ): MessageMeta | undefined {
    const datafile = this.datafiles[locale];

    return datafile?.messages?.[messageKey]?.meta;
  }

  private getMessageDefinition(
    messageKey: MessageKey,
    locale = this.getCurrentLocale(),
  ): DatafileMessage | undefined {
    const datafile = this.datafiles[locale];

    return datafile?.messages?.[messageKey];
  }

  private reportDeprecatedMessage(
    messageKey: MessageKey,
    message: DatafileMessage,
    locale = this.getCurrentLocale(),
  ) {
    if (!message.deprecated) {
      return;
    }

    this.reportDiagnostic({
      level: "warn",
      code: "deprecated_message",
      message: "Deprecated message evaluated",
      details: {
        locale,
        messageKey,
        deprecationWarning: message.deprecationWarning,
        source: "translation",
      },
    });
  }

  private resolveMessage(
    messageKey: MessageKey | undefined,
    defaultTranslation: string | undefined,
    options: TranslateOptions | EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const isMissing = (value: string | undefined) => typeof value === "undefined";
    let translated: string | undefined;

    if (messageKey) {
      translated = this.getMessageFromDatafile(messageKey, options as TranslateOptions, locale);

      if (isMissing(translated)) {
        const translations = this.getDefaultTranslations(locale);
        translated = translations ? translations[messageKey] : undefined;
      }
    }

    if (!messageKey && typeof defaultTranslation === "string") {
      return {
        locale,
        source: defaultTranslation,
        formatted: defaultTranslation,
        messageKey: undefined,
      };
    }

    if (!isMissing(translated)) {
      const message = messageKey ? this.getMessageDefinition(messageKey, locale) : undefined;

      if (messageKey && message) {
        this.reportDeprecatedMessage(messageKey, message, locale);
      }

      return {
        locale,
        source: translated as string,
        formatted: translated as string,
        messageKey,
      };
    }

    if (messageKey) {
      const hasDatafile = Boolean(this.datafiles[locale]);
      this.reportDiagnostic(
        hasDatafile
          ? {
              level: "error",
              code: "missing_translation",
              message: "Missing translation",
              details: { locale, messageKey, source: "translation" },
            }
          : {
              level: "error",
              code: "missing_datafile",
              message: "Datafile not found for locale",
              details: { locale, messageKey, source: "translation" },
            },
      );
    }

    if (typeof defaultTranslation === "string") {
      return {
        locale,
        source: defaultTranslation,
        formatted: defaultTranslation,
        messageKey,
      };
    }

    return {
      locale,
      source: messageKey || "",
      formatted: messageKey || "",
      messageKey,
    };
  }

  private emit<T extends Exclude<MessagevisorEventName, "change" | "error">>(
    type: T,
    previousSnapshot: MessagevisorSnapshot,
    details: MessagevisorEventDetailsByName[T],
  ) {
    if (this.closed) {
      return;
    }

    this.version += 1;

    const event = {
      ...details,
      type,
      version: this.version,
      snapshot: this.getSnapshot(),
      previousSnapshot,
    } as MessagevisorEvent<T>;

    this.triggerListeners(type, event);

    const changeEvent = {
      ...event,
      type: "change",
      source: type,
    } as unknown as MessagevisorEvent<"change">;

    this.triggerListeners("change", changeEvent);
  }

  private triggerListeners<T extends MessagevisorEventName>(type: T, event: MessagevisorEvent<T>) {
    this.listeners[type].slice().forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error(error);
      }
    });
  }

  private getEvaluationFormats(
    options: EvaluationOptions = {},
    locale = this.getCurrentLocale(options),
  ) {
    const formats =
      deepMerge(
        deepMerge(
          this.getDefaultFormats(locale),
          this.datafiles[locale] ? this.datafiles[locale].formats : undefined,
        ),
        options.formats,
      ) || {};
    const numberFormats: NonNullable<FormatPresets["number"]> = {};
    const dateFormats: NonNullable<FormatPresets["date"]> = {};
    const timeFormats: NonNullable<FormatPresets["time"]> = {};
    const dateTimeRangeFormats: NonNullable<FormatPresets["dateTimeRange"]> = {};

    Object.keys(formats.number || {}).forEach((key) => {
      const formatOptions = formats.number?.[key];

      if (!formatOptions) {
        return;
      }

      if (formatOptions.style !== "currency") {
        numberFormats[key] = formatOptions;
        return;
      }

      numberFormats[key] = {
        ...formatOptions,
        currency: resolveCurrency(options.currency, formatOptions.currency, this.currency),
      };
    });

    Object.keys(formats.date || {}).forEach((key) => {
      const formatOptions = formats.date?.[key];

      if (!formatOptions) {
        return;
      }

      dateFormats[key] = {
        ...formatOptions,
        timeZone: resolveTimeZone(options.timeZone, formatOptions.timeZone, this.timeZone),
      };
    });

    Object.keys(formats.time || {}).forEach((key) => {
      const formatOptions = formats.time?.[key];

      if (!formatOptions) {
        return;
      }

      timeFormats[key] = {
        ...formatOptions,
        timeZone: resolveTimeZone(options.timeZone, formatOptions.timeZone, this.timeZone),
      };
    });

    Object.keys(formats.dateTimeRange || {}).forEach((key) => {
      const formatOptions = formats.dateTimeRange?.[key];

      if (!formatOptions) {
        return;
      }

      dateTimeRangeFormats[key] = {
        ...formatOptions,
        timeZone: resolveTimeZone(options.timeZone, formatOptions.timeZone, this.timeZone),
      };
    });

    return {
      ...formats,
      number: numberFormats,
      date: dateFormats,
      time: timeFormats,
      dateTimeRange: dateTimeRangeFormats,
    };
  }

  private getCachedNumberFormat(locale: LocaleKey, options: Intl.NumberFormatOptions) {
    var cacheKey = getFormatterCacheKey(locale, options);

    if (!this.cache.numberFormat[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.numberFormat,
          this.cache.order.numberFormat,
          cacheKey,
          new Intl.NumberFormat(locale, options),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid number format options",
          originalError: error,
          details: { locale, options },
        });
        throw error;
      }
    }

    return this.cache.numberFormat[cacheKey];
  }

  private getCachedDateTimeFormat(locale: LocaleKey, options: Intl.DateTimeFormatOptions) {
    var cacheKey = getFormatterCacheKey(locale, options);

    if (!this.cache.dateTimeFormat[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.dateTimeFormat,
          this.cache.order.dateTimeFormat,
          cacheKey,
          new Intl.DateTimeFormat(locale, options),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid date/time format options",
          originalError: error,
          details: { locale, options },
        });
        throw error;
      }
    }

    return this.cache.dateTimeFormat[cacheKey];
  }

  private getCachedRelativeTimeFormat(
    locale: LocaleKey,
    options: Intl.RelativeTimeFormatOptions = {},
  ) {
    var cacheKey = getFormatterCacheKey(locale, options);

    if (!this.cache.relativeTimeFormat[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.relativeTimeFormat,
          this.cache.order.relativeTimeFormat,
          cacheKey,
          new Intl.RelativeTimeFormat(locale, options),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid relative-time format options",
          originalError: error,
          details: { locale, options },
        });
        throw error;
      }
    }

    return this.cache.relativeTimeFormat[cacheKey];
  }

  private getNamedFormat<T>(
    locale: LocaleKey,
    type: keyof FormatPresets,
    preset: string,
    presets: Record<string, T> | undefined,
  ): T | undefined {
    const format = presets?.[preset];
    if (typeof format === "undefined") {
      this.reportDiagnostic({
        level: "error",
        code: "missing_format",
        message: "Named format preset not found",
        details: { locale, type, preset },
      });
    }
    return format;
  }

  private createModuleApi(module: MessagevisorModule): MessagevisorModuleApi {
    const moduleKey = this.getModuleApiKey(module);
    const setFlagResolver = (resolver?: (featureKey: string, context?: Context) => boolean) => {
      this.moduleFlagResolvers = this.moduleFlagResolvers.filter(
        (registration) => registration.moduleKey !== moduleKey,
      );
      if (resolver) this.moduleFlagResolvers.push({ moduleKey, resolver });
    };
    const setVariationResolver = (
      resolver?: (experimentKey: string, context?: Context) => string | null,
    ) => {
      this.moduleVariationResolvers = this.moduleVariationResolvers.filter(
        (registration) => registration.moduleKey !== moduleKey,
      );
      if (resolver) this.moduleVariationResolvers.push({ moduleKey, resolver });
    };
    const getRevision = (locale?: LocaleKey) => {
      return this.getRevision(locale);
    };
    const onDiagnostic = (
      handler: MessagevisorDiagnosticHandler,
      options: MessagevisorModuleDiagnosticOptions = {},
    ) => {
      const subscription: MessagevisorModuleDiagnosticSubscription = {
        moduleKey,
        handler,
        logLevel: options.logLevel || "info",
      };

      this.moduleDiagnosticSubscriptions.push(subscription);

      return () => {
        this.moduleDiagnosticSubscriptions = this.moduleDiagnosticSubscriptions.filter(
          (currentSubscription) => currentSubscription !== subscription,
        );
      };
    };
    const reportDiagnostic = (diagnostic: MessagevisorModuleReportedDiagnostic) => {
      const moduleDiagnostic: MessagevisorDiagnosticInput = { ...diagnostic };

      if (module.name) {
        moduleDiagnostic.module = module.name;
      }

      this.reportDiagnostic(moduleDiagnostic, moduleKey);
    };

    return {
      setFlagResolver,
      setVariationResolver,
      getRevision,
      onDiagnostic,
      reportDiagnostic,
    };
  }

  private getModuleApiKey(module: MessagevisorModule) {
    if (module.name) {
      return `name:${module.name}`;
    }

    const moduleWithApiKey = module as MessagevisorModule & { __messagevisorModuleApiKey?: string };

    if (!moduleWithApiKey.__messagevisorModuleApiKey) {
      moduleWithApiKey.__messagevisorModuleApiKey = `anonymous:${++this.moduleApiId}`;
    }

    return moduleWithApiKey.__messagevisorModuleApiKey;
  }

  private getModuleApi(module: MessagevisorModule): MessagevisorModuleApi {
    const key = this.getModuleApiKey(module);
    const existingApi = this.moduleApis[key];

    if (existingApi) {
      return existingApi;
    }

    const api = this.createModuleApi(module);

    this.moduleApis[key] = api;

    return api;
  }

  private runModuleSetup(module: MessagevisorModule) {
    if (!module.setup) {
      return;
    }

    module.setup(this.getModuleApi(module));
  }

  private clearModuleDiagnosticSubscriptions(module: MessagevisorModule) {
    const moduleKey = this.getModuleApiKey(module);

    this.moduleDiagnosticSubscriptions = this.moduleDiagnosticSubscriptions.filter(
      (subscription) => subscription.moduleKey !== moduleKey,
    );
    this.moduleFlagResolvers = this.moduleFlagResolvers.filter(
      (registration) => registration.moduleKey !== moduleKey,
    );
    this.moduleVariationResolvers = this.moduleVariationResolvers.filter(
      (registration) => registration.moduleKey !== moduleKey,
    );

    delete this.moduleApis[moduleKey];
  }

  private runTransforms<T = never>(
    translation: MessageFormatResult<T>,
    payload: Omit<MessagevisorTransformPayload, "translation">,
  ): MessageFormatResult<T> {
    let currentTranslation = translation as unknown;

    for (const module of this.getModules()) {
      const nextTranslation = module.transform?.(
        {
          ...payload,
          translation: currentTranslation,
        },
        this.getModuleApi(module),
      );

      if (typeof nextTranslation !== "undefined") {
        currentTranslation = nextTranslation;
      }
    }

    return currentTranslation as MessageFormatResult<T>;
  }

  private runFormats<T = never>(
    translation: MessageFormatResult<T>,
    values: MessageValues<T> | undefined,
    payload: Omit<MessagevisorFormatPayload, "translation" | "values">,
  ): MessageFormatResult<T> {
    let currentTranslation = translation as unknown;

    for (const module of this.getModules()) {
      if (!module.format) {
        continue;
      }

      try {
        const nextTranslation = module.format(
          {
            ...payload,
            translation: currentTranslation,
            values,
          },
          this.getModuleApi(module),
        );

        if (typeof nextTranslation !== "undefined") {
          currentTranslation = nextTranslation;
        }
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_message",
          message: "Unable to format message",
          originalError: error,
          details: {
            locale: payload.locale,
            messageKey: payload.messageKey,
            source: payload.source,
          },
        });

        throw error;
      }
    }

    return currentTranslation as MessageFormatResult<T>;
  }

  private formatMessageInternal<T = never>(
    message: string,
    values?: MessageValues<T>,
    options: EvaluationOptions = {},
  ): MessageFormatResult<T> {
    const locale = this.getCurrentLocale(options);
    const formats = this.getEvaluationFormats(options, locale);

    const translation = this.runFormats(message as MessageFormatResult<T>, values, {
      locale,
      source: "formatMessage",
      meta: undefined,
      formats,
      moduleOptions: options.moduleOptions,
    });

    return this.runTransforms(translation, {
      locale,
      source: "formatMessage",
      meta: undefined,
    });
  }

  translate(
    messageKey: MessageKey,
    values?: Record<string, MessagePrimitiveValue>,
    options?: TranslateOptions,
  ): string;
  translate<T>(
    messageKey: MessageKey,
    values: MessageValues<T>,
    options?: TranslateOptions,
  ): MessageFormatResult<T>;
  translate<T = never>(
    messageKey: MessageKey,
    values?: MessageValues<T>,
    options: TranslateOptions = {},
  ): MessageFormatResult<T> {
    const rawMessage = this.getRawTranslation(messageKey, options);
    const locale = this.getCurrentLocale(options);
    const formats = this.getEvaluationFormats(options, locale);
    const meta = this.getMessageMeta(messageKey, locale);
    const translation = this.runFormats(rawMessage as MessageFormatResult<T>, values, {
      locale,
      source: "translation",
      messageKey,
      meta,
      formats,
      moduleOptions: options.moduleOptions,
    });

    return this.runTransforms(translation, {
      locale,
      source: "translation",
      messageKey,
      meta,
    });
  }

  t(
    messageKey: MessageKey,
    values?: Record<string, MessagePrimitiveValue>,
    options?: TranslateOptions,
  ): string;
  t<T>(
    messageKey: MessageKey,
    values: MessageValues<T>,
    options?: TranslateOptions,
  ): MessageFormatResult<T>;
  t<T = never>(
    messageKey: MessageKey,
    values?: MessageValues<T>,
    options: TranslateOptions = {},
  ): MessageFormatResult<T> {
    if (values === undefined) {
      return this.translate(messageKey, undefined, options);
    }

    return this.translate(messageKey, values, options);
  }

  getRawTranslation(messageKey: MessageKey, options: TranslateOptions = {}): string {
    return this.resolveMessage(messageKey, options.defaultTranslation, options).formatted;
  }

  formatMessage(
    message: string,
    values?: Record<string, MessagePrimitiveValue>,
    options?: EvaluationOptions,
  ): string;
  formatMessage<T>(
    message: string,
    values: MessageValues<T>,
    options?: EvaluationOptions,
  ): MessageFormatResult<T>;
  formatMessage<T = never>(
    message: string,
    values?: MessageValues<T>,
    options: EvaluationOptions = {},
  ): MessageFormatResult<T> {
    return this.formatMessageInternal(message, values, options);
  }

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    if (this.closed) {
      return;
    }

    this.closed = true;
    this.parentUnsubscribers.slice().forEach((unsubscribe) => unsubscribe());
    this.parentUnsubscribers = [];
    Object.keys(this.listeners).forEach((eventName) => {
      this.listeners[eventName as MessagevisorEventName] = [];
    });
    this.moduleDiagnosticSubscriptions = [];
    this.moduleApis = {};

    this.closePromise = this.ownsModules ? this.closeModules() : Promise.resolve();
    return this.closePromise;
  }

  private getModules(): MessagevisorModule[] {
    return this.parent ? this.parent.getModules() : this.modules;
  }

  private async removeModuleInstance(module: MessagevisorModule): Promise<void> {
    if (this.modules.indexOf(module) === -1) {
      return;
    }

    this.modules = this.modules.filter((registeredModule) => registeredModule !== module);
    this.clearModuleDiagnosticSubscriptions(module);
    await this.closeModule(module);
  }

  private async closeModule(module: MessagevisorModule): Promise<void> {
    if (!module.close) return;

    try {
      await module.close();
    } catch (error) {
      this.reportDiagnostic({
        level: "error",
        code: "module_close_error",
        message: "Module close failed",
        moduleName: module.name,
        originalError: error,
      });
      throw error;
    }
  }

  private async closeModules(): Promise<void> {
    const errors: unknown[] = [];
    const modulesToClose = [...this.modules].reverse();

    for (const module of modulesToClose) {
      if (!module.close) {
        continue;
      }

      try {
        await this.closeModule(module);
      } catch (error) {
        errors.push(error);
      }
    }

    this.modules = [];

    if (errors.length > 0) {
      throw new MessagevisorCloseError("One or more Messagevisor modules failed to close.", errors);
    }
  }

  formatNumber(
    value: number,
    presetOrOptions?: string | FormatNumberPresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "number", presetOrOptions, evaluationFormats.number)
        : presetOrOptions;
    const finalOptions = { ...(formatOptions || {}) } as Intl.NumberFormatOptions;

    if (finalOptions.style === "currency") {
      finalOptions.currency = resolveCurrency(
        options.currency,
        finalOptions.currency,
        this.currency,
      );
    }

    return this.getCachedNumberFormat(locale, finalOptions).format(value);
  }

  formatNumberToParts(
    value: number,
    presetOrOptions?: string | FormatNumberPresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "number", presetOrOptions, evaluationFormats.number)
        : presetOrOptions;
    const finalOptions = { ...(formatOptions || {}) } as Intl.NumberFormatOptions;

    if (finalOptions.style === "currency") {
      finalOptions.currency = resolveCurrency(
        options.currency,
        finalOptions.currency,
        this.currency,
      );
    }

    return this.getCachedNumberFormat(locale, finalOptions).formatToParts(value);
  }

  formatDate(
    value: Date | number | string,
    presetOrOptions?: string | FormatDateTimePresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "date", presetOrOptions, evaluationFormats.date)
        : presetOrOptions;

    return this.getCachedDateTimeFormat(
      locale,
      resolveDateTimeOptions(formatOptions, options, this.timeZone),
    ).format(new Date(value));
  }

  formatDateToParts(
    value: Date | number | string,
    presetOrOptions?: string | FormatDateTimePresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "date", presetOrOptions, evaluationFormats.date)
        : presetOrOptions;

    return this.getCachedDateTimeFormat(
      locale,
      resolveDateTimeOptions(formatOptions, options, this.timeZone),
    ).formatToParts(new Date(value));
  }

  formatTime(
    value: Date | number | string,
    presetOrOptions?: string | FormatDateTimePresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "time", presetOrOptions, evaluationFormats.time)
        : presetOrOptions;

    return this.getCachedDateTimeFormat(
      locale,
      resolveDateTimeOptions(formatOptions, options, this.timeZone),
    ).format(new Date(value));
  }

  formatTimeToParts(
    value: Date | number | string,
    presetOrOptions?: string | FormatDateTimePresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "time", presetOrOptions, evaluationFormats.time)
        : presetOrOptions;

    return this.getCachedDateTimeFormat(
      locale,
      resolveDateTimeOptions(formatOptions, options, this.timeZone),
    ).formatToParts(new Date(value));
  }

  formatDateTimeRange(
    start: Date | number | string,
    end: Date | number | string,
    presetOrOptions?: string | FormatDateTimePresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(
            locale,
            "dateTimeRange",
            presetOrOptions,
            evaluationFormats.dateTimeRange,
          )
        : presetOrOptions;
    const formatter = this.getCachedDateTimeFormat(
      locale,
      resolveDateTimeOptions(formatOptions, options, this.timeZone),
    );

    const rangeFormatter = formatter as Intl.DateTimeFormat & {
      formatRange?: (startDate: Date, endDate: Date) => string;
    };

    if (rangeFormatter.formatRange) {
      return rangeFormatter.formatRange(new Date(start), new Date(end));
    }

    return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
  }

  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    presetOrOptions?: string | FormatRelativeTimePresetOptions,
    options: EvaluationOptions = {},
  ) {
    const locale = this.getCurrentLocale(options);
    const evaluationFormats = this.getEvaluationFormats(options, locale);
    const formatOptions =
      typeof presetOrOptions === "string"
        ? this.getNamedFormat(locale, "relative", presetOrOptions, evaluationFormats.relative)
        : presetOrOptions;

    return this.getCachedRelativeTimeFormat(locale, formatOptions).format(value, unit);
  }

  formatPlural(
    value: number,
    options: Intl.PluralRulesOptions & Pick<EvaluationOptions, "locale"> = {},
  ) {
    const { locale: optionLocale, ...pluralOptions } = options;
    const locale = this.getCurrentLocale({ locale: optionLocale });
    var cacheKey = getFormatterCacheKey(locale, pluralOptions);

    if (!this.cache.pluralRules[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.pluralRules,
          this.cache.order.pluralRules,
          cacheKey,
          new Intl.PluralRules(locale, pluralOptions),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid plural format options",
          originalError: error,
          details: { locale, options: pluralOptions },
        });
        throw error;
      }
    }

    return this.cache.pluralRules[cacheKey].select(value);
  }

  formatList(values: Array<string>, options: any = {}) {
    const { locale: optionLocale, ...listOptions } = options || {};
    const locale = this.getCurrentLocale({ locale: optionLocale });
    var cacheKey = getFormatterCacheKey(locale, listOptions);
    var ListFormat = (Intl as any).ListFormat;

    if (!ListFormat) {
      this.reportDiagnostic({
        level: "warn",
        code: "unsupported_formatter",
        message: "Intl.ListFormat is not available in this environment.",
        details: { locale },
      });

      return values.join(", ");
    }

    if (!this.cache.listFormat[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.listFormat,
          this.cache.order.listFormat,
          cacheKey,
          new ListFormat(locale, listOptions),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid list format options",
          originalError: error,
          details: { locale, options: listOptions },
        });
        throw error;
      }
    }

    return this.cache.listFormat[cacheKey].format(values);
  }

  formatListToParts(values: Array<string>, options: any = {}) {
    const { locale: optionLocale, ...listOptions } = options || {};
    const locale = this.getCurrentLocale({ locale: optionLocale });
    var cacheKey = getFormatterCacheKey(locale, listOptions);
    var ListFormat = (Intl as any).ListFormat;

    if (!ListFormat) {
      this.reportDiagnostic({
        level: "warn",
        code: "unsupported_formatter",
        message: "Intl.ListFormat is not available in this environment.",
        details: { locale },
      });

      return values;
    }

    if (!this.cache.listFormat[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.listFormat,
          this.cache.order.listFormat,
          cacheKey,
          new ListFormat(locale, listOptions),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid list format options",
          originalError: error,
          details: { locale, options: listOptions },
        });
        throw error;
      }
    }

    if (typeof this.cache.listFormat[cacheKey].formatToParts !== "function") {
      return values;
    }

    return this.cache.listFormat[cacheKey].formatToParts(values);
  }

  formatDisplayName(value: string, options: any = {}) {
    const { locale: optionLocale, ...displayNameOptions } = options || {};
    const locale = this.getCurrentLocale({ locale: optionLocale });
    var cacheKey = getFormatterCacheKey(locale, displayNameOptions);
    var DisplayNames = (Intl as any).DisplayNames;

    if (!DisplayNames) {
      this.reportDiagnostic({
        level: "warn",
        code: "unsupported_formatter",
        message: "Intl.DisplayNames is not available in this environment.",
        details: { locale },
      });

      return displayNameOptions && displayNameOptions.fallback === "none" ? undefined : value;
    }

    if (!this.cache.displayNames[cacheKey]) {
      try {
        cacheFormatter(
          this.cache.displayNames,
          this.cache.order.displayNames,
          cacheKey,
          new DisplayNames(locale, displayNameOptions),
        );
      } catch (error) {
        this.reportDiagnostic({
          level: "error",
          code: "invalid_format",
          message: "Invalid display-name format options",
          originalError: error,
          details: { locale, options: displayNameOptions },
        });
        throw error;
      }
    }

    return this.cache.displayNames[cacheKey].of(value);
  }
}

export function createMessagevisor(options: MessagevisorOptions = {}) {
  return new Messagevisor(options);
}
