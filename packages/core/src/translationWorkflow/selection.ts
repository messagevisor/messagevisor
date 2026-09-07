import type { Locale, Message, Target } from "@messagevisor/types";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError } from "../error";
import {
  compileTargetMessageMatcher,
  compilePatternMatcher,
  normalizePatterns,
  resolveTargetLocaleKeys,
} from "../targeting";
import { loadProjectSnapshot } from "../snapshot";
import { createTargetContextSpecializer } from "../builder/applyContextToTarget";

export interface TranslationSelectionOptions {
  locale?: string | string[];
  target?: string | string[];
  includeMessages?: string | string[];
  excludeMessages?: string | string[];
  set?: string;
}

export async function readTranslationSelection(
  datasource: Datasource,
  options: TranslationSelectionOptions,
) {
  const snapshot = await loadProjectSnapshot(datasource, {
    entityTypes: ["locale", "message", "target", "segment"],
  });
  const { locale: localeKeys, message: messageKeys, target: targetKeys } = snapshot.keys;
  for (const [kind, requested, available] of [
    ["locale", normalizePatterns(options.locale), localeKeys],
    ["target", normalizePatterns(options.target), targetKeys],
  ] as const) {
    for (const key of requested)
      if (!available.includes(key))
        throw new MessagevisorCLIError(`Unknown ${kind} "${key}".`, { code: `unknown_${kind}` });
  }
  const locales: Record<string, Locale> = snapshot.locales;
  const includes = compilePatternMatcher(options.includeMessages);
  const excludes = compilePatternMatcher(options.excludeMessages);
  const messages: Record<string, Message> = Object.fromEntries(
    messageKeys
      .filter((key) => (options.includeMessages === undefined || includes(key)) && !excludes(key))
      .map((key) => [key, snapshot.messages[key]]),
  );
  const targets: Array<{ key?: string; value?: Target }> =
    options.target === undefined
      ? [{}]
      : normalizePatterns(options.target).map((key) => ({ key, value: snapshot.targets[key] }));
  const scopes = targets.map(({ key, value }) => {
    const matches = compileTargetMessageMatcher(value);
    const requested = options.locale === undefined ? localeKeys : normalizePatterns(options.locale);
    const specializer = createTargetContextSpecializer(snapshot.segments, value?.context);
    return {
      target: key,
      localeKeys: resolveTargetLocaleKeys(value, localeKeys, requested).sort(),
      messages: Object.fromEntries(
        Object.entries(messages)
          .filter(([key, message]) => !message.archived && matches(key))
          .map(([key, message]) => [
            key,
            {
              ...message,
              ...(message.overrides
                ? {
                    overrides: message.overrides.filter(
                      (override) =>
                        (!override.conditions ||
                          specializer.applyContextToCondition(override.conditions).state !==
                            "false") &&
                        (!override.segments ||
                          override.segments === "*" ||
                          specializer.applyContextToGroupSegment(override.segments).state !==
                            "false"),
                    ),
                  }
                : {}),
            },
          ]),
      ),
    };
  });
  return { locales, scopes };
}
