import type {
  Context,
  Matrix,
  MessageKey,
  SegmentKey,
  TargetKey,
  LocaleKey,
  Translation,
  ExpectedByRuntime,
} from "./entities";
import type { FormatPresets } from "./format";

/**
 * MessageTest
 */
export interface MessageAssertion {
  key?: string;
  promotable?: boolean;
  matrix?: Matrix;
  description?: string;
  context?: Context;
  locale: LocaleKey;
  target?: TargetKey;
  values?: Record<string, unknown>;
  withFlags?: Record<string, boolean>;
  withVariations?: Record<string, string>;
  currency?: string;
  timeZone?: string;
  formats?: FormatPresets;
  expectedTranslation: Translation;
  expectedByRuntime?: ExpectedByRuntime;
}

export interface MessageTest {
  promotable?: boolean;
  message: MessageKey;
  assertions: MessageAssertion[];
}

/**
 * SegmentTest
 */
export interface SegmentAssertion {
  key?: string;
  promotable?: boolean;
  matrix?: Matrix;
  description?: string;
  segment: SegmentKey;
  context?: Context;
  expectedToMatch: boolean;
}

export interface SegmentTest {
  promotable?: boolean;
  segment: SegmentKey;
  assertions: SegmentAssertion[];
}

/**
 * LocaleTest
 */
export interface LocaleAssertion {
  key?: string;
  promotable?: boolean;
  matrix?: Matrix;
  description?: string;
  target?: TargetKey;
  expectedFormats?: FormatPresets;

  /**
   * When asserting raw message translation
   */
  // optional, but need to be used together if one is used
  rawMessage?: string;
  expectedTranslation?: string;
  expectedByRuntime?: ExpectedByRuntime;

  // other optional params
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: FormatPresets;
  currency?: string;
  timeZone?: string;
}

export interface LocaleTest {
  promotable?: boolean;
  locale: LocaleKey;
  assertions: LocaleAssertion[];
}

/**
 * TargetTest
 */
export interface TargetAssertion {
  key?: string;
  promotable?: boolean;
  matrix?: Matrix;
  description?: string;
  locale: LocaleKey;
  expectedToIncludeMessages?: MessageKey[];
  expectedToNotIncludeMessages?: MessageKey[];
  expectedFormats?: FormatPresets;

  /**
   * When asserting raw message or message translation
   */
  // optional, but need to be used together if one is used
  rawMessage?: string; // either rawMessage or message must be used
  message?: MessageKey;
  expectedTranslation?: string; // if rawMessage or message is used, expectedTranslation must be used
  expectedByRuntime?: ExpectedByRuntime;

  // other optional params
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: FormatPresets;
  currency?: string;
  timeZone?: string;
}

export interface TargetTest {
  promotable?: boolean;
  target: TargetKey;
  assertions: TargetAssertion[];
}

/**
 * Combined types
 */
export type Test = MessageTest | SegmentTest | LocaleTest | TargetTest;
