import type { FormatPresets } from "./format";

/**
 * Common
 */
export type Matrix = Record<string, unknown[]>;

export type ExampleKey = string;

export interface ExampleBase {
  matrix?: Matrix;
  index?: number; // based on matrix

  description?: string;
  values?: Record<string, unknown>;
  context?: Context;
  formats?: FormatPresets;
  timeZone?: string;
  currency?: string;
}

/**
 * Locales
 */
export type LocaleKey = string;
export type LocaleDirection = "ltr" | "rtl";

export type LocaleExample = ExampleBase & {
  // one of them below needs to be provided
  rawMessage?: string;
  message?: MessageKey;
};

export interface Locale {
  key?: LocaleKey;
  promotable?: boolean;
  description?: string;
  direction?: LocaleDirection;
  inheritFormatsFrom?: string;
  inheritTranslationsFrom?: string;
  mergeExamplesFrom?: string;
  formats?: FormatPresets;
  examples?: LocaleExample[];
}

/**
 * Attributes
 */
export type AttributeKey = string;

export interface AttributeObjectValue {
  [key: AttributeKey]: AttributeValue;
}

export type AttributeValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | string[]
  | AttributeObjectValue
  | Record<string, unknown>;

export type AttributeType =
  | "boolean"
  | "string"
  | "integer"
  | "double"
  | "date"
  | "object"
  | "array";

export interface AttributeSchema {
  description?: string; // only available in YAML files
  enum?: AttributeValue[];
  const?: AttributeValue;
  maximum?: number;
  minimum?: number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  items?: AttributeSchema;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  required?: string[];
  properties?: {
    [key: AttributeKey]: AttributeSchema;
  };
  additionalProperties?: AttributeSchema;
  oneOf?: AttributeSchema[];
}

export type Attribute = AttributeSchema & {
  key?: AttributeKey;
  archived?: boolean; // only available in YAML files
  promotable?: boolean;
  type?: AttributeType; // required when not using oneOf
};

/**
 * Context
 */
export interface Context {
  [key: AttributeKey]: AttributeValue;
}

/**
 * Conditions
 */
export type Operator =
  | "equals"
  | "notEquals"
  | "exists"
  | "notExists"

  // numeric
  | "greaterThan"
  | "greaterThanOrEquals"
  | "lessThan"
  | "lessThanOrEquals"

  // string
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "matches"
  | "notMatches"

  // date comparisons
  | "before"
  | "after"

  // array of strings
  | "includes"
  | "notIncludes"

  // feature
  | "isEnabled"
  | "isDisabled"

  // experiment
  | "hasVariation"

  // array of strings
  | "in"
  | "notIn";

export type ConditionValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | Array<string | number | boolean | null>;

export interface AttributeCondition {
  attribute: AttributeKey;

  operator:
    | "equals"
    | "notEquals"
    | "exists"
    | "notExists"
    | "greaterThan"
    | "greaterThanOrEquals"
    | "lessThan"
    | "lessThanOrEquals"
    | "contains"
    | "notContains"
    | "startsWith"
    | "endsWith"
    | "matches"
    | "notMatches"
    | "before"
    | "after"
    | "includes"
    | "notIncludes"
    | "in"
    | "notIn";
  value?: ConditionValue; // for all operators, except for "exists" and "notExists"
  regexFlags?: string; // unique portable flags: i, m, s, u; regex operators only
}

export interface FeatureCondition {
  feature: string;
  operator: "isEnabled" | "isDisabled";
}

export interface ExperimentCondition {
  experiment: string;
  operator: "hasVariation";
  value: string;
}

export type PlainCondition = AttributeCondition | FeatureCondition | ExperimentCondition;

export interface AndCondition {
  and: Condition[];
}

export interface OrCondition {
  or: Condition[];
}

export interface NotCondition {
  not: Condition[];
}

export type AndOrNotCondition = AndCondition | OrCondition | NotCondition;

export type Condition = PlainCondition | AndOrNotCondition | string;

/**
 * Segments
 */

export type SegmentKey = string;

export interface Segment {
  archived?: boolean; // only available in YAML files
  key?: SegmentKey; // needed for supporting v1 datafile generation
  promotable?: boolean;
  conditions: Condition | Condition[]; // string can be "*" or stringified for datafile
  description?: string; // only available in YAML files
}

export type PlainGroupSegment = SegmentKey;

export interface AndGroupSegment {
  and: GroupSegment[];
}

export interface OrGroupSegment {
  or: GroupSegment[];
}

export interface NotGroupSegment {
  not: GroupSegment[];
}

export type AndOrNotGroupSegment = AndGroupSegment | OrGroupSegment | NotGroupSegment;

// group of segment keys with and/or conditions, or just string
export type GroupSegment = PlainGroupSegment | AndOrNotGroupSegment;

export type TranslationStatus = "draft" | "translated" | "reviewed";

export interface TranslationState {
  status: TranslationStatus;
  /** SHA-256 hash of the source-locale text this translation was based on. */
  sourceHash?: string;
}

export type TranslationStates = Partial<Record<LocaleKey, TranslationState>>;

/**
 * Overrides
 */
export interface Override {
  key: string;
  promotable?: boolean;
  description?: string;
  summary?: string;

  // one of them need to be provided
  conditions?: Condition | Condition[] | "*"; // string can be "*" or stringified datafile condition
  segments?: GroupSegment | GroupSegment[] | "*"; // string can be "*", segment key, or stringified datafile segment group

  translations: {
    [locale: LocaleKey]: Translation;
  };
  translationStates?: TranslationStates;
}

/**
 * Messages
 */
export type MessageKey = string;

export type Translation = string;
export type MessageMeta = Record<string, unknown>;

export type MessageExample = ExampleBase & {
  locale: LocaleKey;
};

export interface Message {
  key?: MessageKey;

  // only in YAML files
  archived?: boolean;
  promotable?: boolean;
  deprecated?: boolean;
  deprecationWarning?: string;
  description?: string;
  summary?: string;
  meta?: MessageMeta;
  examples?: MessageExample[];

  // rest
  translations: {
    [locale: LocaleKey]: Translation;
  };
  translationStates?: TranslationStates;
  overrides?: Override[];
}

/**
 * Targets
 */
export type TargetKey = string;

export type TargetFormatPatterns = Partial<Record<keyof FormatPresets, string | string[]>>;

export interface Target {
  key?: TargetKey;
  description?: string;
  promotable?: boolean;
  stringify?: boolean;
  pretty?: boolean;
  revisionFromHash?: boolean;
  includeMessages?: string | string[];
  excludeMessages?: string | string[];
  includeOnlyUsedFormats?: boolean;
  includeFormats?: TargetFormatPatterns;
  excludeFormats?: TargetFormatPatterns;
  locales?: LocaleKey[];
  context?: Context;
  formats?: { [locale: LocaleKey]: FormatPresets };
}
