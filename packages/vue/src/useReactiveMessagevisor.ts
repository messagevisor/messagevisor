import type {
  EvaluationOptions,
  MessageFormatResult,
  MessagePrimitiveValue,
  MessageValues,
  TranslateOptions,
} from "@messagevisor/sdk";
import type {
  Context,
  FormatDateTimePresetOptions,
  FormatNumberPresetOptions,
  FormatRelativeTimePresetOptions,
  LocaleDirection,
  LocaleKey,
  MessageKey,
} from "@messagevisor/types";
import { computed, isRef, type ComputedRef, type MaybeRefOrGetter, toValue } from "vue";

import type { VueMessageChunk } from "./MessagevisorContext";
import { createRichTextTools, type VueMessageValues, type VueRichMessageValues } from "./richText";
import { useMessagevisorSnapshot } from "./useMessagevisorSnapshot";
import { useMessagevisorContextValue } from "./useSdk";

export interface LocaleInfo {
  locale: LocaleKey | null;
  direction: LocaleDirection | undefined;
}

type MaybeRecord<TRecord extends object> = MaybeRefOrGetter<TRecord | undefined>;
type MaybeRecordValue<TValue> = TValue | MaybeRefOrGetter<TValue>;
type MaybePrimitiveValues = Record<string, MaybeRecordValue<MessagePrimitiveValue>>;
type MaybeRichValues = Record<
  string,
  MaybeRecordValue<MessagePrimitiveValue> | VueRichMessageValues[string]
>;

function useReactiveContext() {
  const context = useMessagevisorContextValue();
  useMessagevisorSnapshot();

  return context;
}

function resolveMaybeRecord<TRecord extends object>(record?: MaybeRecord<TRecord>) {
  const resolved = typeof record === "undefined" ? undefined : toValue(record);

  if (!resolved) {
    return resolved;
  }

  return Object.fromEntries(
    Object.entries(resolved as Record<string, unknown>).map(([key, value]) => {
      if (isRef(value)) {
        return [key, value.value];
      }

      if (typeof value === "function" && value.length === 0) {
        return [key, (value as () => unknown)()];
      }

      return [key, value];
    }),
  ) as TRecord;
}

export function useLocale(): ComputedRef<LocaleKey | null> {
  const snapshot = useMessagevisorSnapshot();

  return computed(() => snapshot.value.locale);
}

export function useDirection(): ComputedRef<LocaleDirection | undefined> {
  const snapshot = useMessagevisorSnapshot();

  return computed(() => snapshot.value.direction);
}

export function useLocaleInfo(): ComputedRef<LocaleInfo> {
  const snapshot = useMessagevisorSnapshot();

  return computed(() => ({
    locale: snapshot.value.locale,
    direction: snapshot.value.direction,
  }));
}

export function useMessagevisorContext(): ComputedRef<Context> {
  const snapshot = useMessagevisorSnapshot();

  return computed(() => snapshot.value.context);
}

export function useCurrency(): ComputedRef<string | undefined> {
  const snapshot = useMessagevisorSnapshot();

  return computed(() => snapshot.value.currency);
}

export function useTimeZone(): ComputedRef<string | undefined> {
  const snapshot = useMessagevisorSnapshot();

  return computed(() => snapshot.value.timeZone);
}

export function useTranslation(
  messageKey: MaybeRefOrGetter<MessageKey>,
  values?: MaybeRecord<MaybePrimitiveValues>,
  options?: MaybeRecord<TranslateOptions>,
): ComputedRef<string>;
export function useTranslation(
  messageKey: MaybeRefOrGetter<MessageKey>,
  values: MaybeRecord<MaybeRichValues>,
  options?: MaybeRecord<TranslateOptions>,
): ComputedRef<MessageFormatResult<VueMessageChunk>>;
export function useTranslation(
  messageKey: MaybeRefOrGetter<MessageKey>,
  values?: MaybeRecord<Record<string, unknown>>,
  options?: MaybeRecord<TranslateOptions>,
) {
  const context = useReactiveContext();
  const richText = createRichTextTools(context);

  return computed(() => {
    const key = toValue(messageKey);
    const resolvedValues = resolveMaybeRecord(values);
    const resolvedOptions = resolveMaybeRecord(options);
    const message = context.instance.getRawTranslation(key, resolvedOptions);
    const translation = context.instance.translate<VueMessageChunk>(
      key,
      richText.mergeValues(
        resolvedValues as VueMessageValues | undefined,
        message,
      ) as MessageValues<VueMessageChunk>,
      resolvedOptions,
    );

    return richText.wrapResult(
      richText.runModules(translation, {
        source: "translation",
        messageKey: key,
      }),
    );
  });
}

export function useFormatMessage(
  message: MaybeRefOrGetter<string>,
  values?: MaybeRecord<MaybePrimitiveValues>,
  options?: MaybeRecord<EvaluationOptions>,
): ComputedRef<string>;
export function useFormatMessage(
  message: MaybeRefOrGetter<string>,
  values: MaybeRecord<MaybeRichValues>,
  options?: MaybeRecord<EvaluationOptions>,
): ComputedRef<MessageFormatResult<VueMessageChunk>>;
export function useFormatMessage(
  message: MaybeRefOrGetter<string>,
  values?: MaybeRecord<Record<string, unknown>>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();
  const richText = createRichTextTools(context);

  return computed(() => {
    const resolvedMessage = toValue(message);
    const translation = context.instance.formatMessage<VueMessageChunk>(
      resolvedMessage,
      richText.mergeValues(
        resolveMaybeRecord(values) as VueMessageValues | undefined,
        resolvedMessage,
      ) as MessageValues<VueMessageChunk>,
      resolveMaybeRecord(options),
    );

    return richText.wrapResult(
      richText.runModules(translation, {
        source: "formatMessage",
      }),
    );
  });
}

export function useFormatNumber(
  value: MaybeRefOrGetter<number>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatNumberPresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatNumber(
      toValue(value),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatNumberToParts(
  value: MaybeRefOrGetter<number>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatNumberPresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatNumberToParts(
      toValue(value),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatDate(
  value: MaybeRefOrGetter<Date | number | string>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatDateTimePresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatDate(
      toValue(value),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatDateToParts(
  value: MaybeRefOrGetter<Date | number | string>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatDateTimePresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatDateToParts(
      toValue(value),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatTime(
  value: MaybeRefOrGetter<Date | number | string>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatDateTimePresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatTime(
      toValue(value),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatTimeToParts(
  value: MaybeRefOrGetter<Date | number | string>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatDateTimePresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatTimeToParts(
      toValue(value),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatDateTimeRange(
  start: MaybeRefOrGetter<Date | number | string>,
  end: MaybeRefOrGetter<Date | number | string>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatDateTimePresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatDateTimeRange(
      toValue(start),
      toValue(end),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatRelativeTime(
  value: MaybeRefOrGetter<number>,
  unit: MaybeRefOrGetter<Intl.RelativeTimeFormatUnit>,
  presetOrOptions?: MaybeRefOrGetter<string | FormatRelativeTimePresetOptions | undefined>,
  options?: MaybeRecord<EvaluationOptions>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatRelativeTime(
      toValue(value),
      toValue(unit),
      toValue(presetOrOptions),
      resolveMaybeRecord(options),
    ),
  );
}

export function useFormatPlural(
  value: MaybeRefOrGetter<number>,
  options?: MaybeRecord<Intl.PluralRulesOptions>,
) {
  const context = useReactiveContext();

  return computed(() => context.instance.formatPlural(toValue(value), resolveMaybeRecord(options)));
}

export function useFormatList(
  values: MaybeRefOrGetter<string[]>,
  options?: MaybeRecord<Record<string, unknown>>,
) {
  const context = useReactiveContext();

  return computed(() => context.instance.formatList(toValue(values), resolveMaybeRecord(options)));
}

export function useFormatListToParts(
  values: MaybeRefOrGetter<string[]>,
  options?: MaybeRecord<Record<string, unknown>>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatListToParts(toValue(values), resolveMaybeRecord(options)),
  );
}

export function useFormatDisplayName(
  value: MaybeRefOrGetter<string>,
  options?: MaybeRecord<Record<string, unknown>>,
) {
  const context = useReactiveContext();

  return computed(() =>
    context.instance.formatDisplayName(toValue(value), resolveMaybeRecord(options)),
  );
}
