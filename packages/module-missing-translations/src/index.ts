// exports
import type {
  MessagevisorDiagnostic,
  MessagevisorModule,
  MessagevisorTranslationSource,
} from "@messagevisor/sdk";

export interface MissingTranslationPayload {
  messageKey: string;
  locale: string | null;
  revision?: string;
  source?: MessagevisorTranslationSource;
  diagnostic: MessagevisorDiagnostic;
}

export interface MissingTranslationsModuleOptions {
  name?: string;
  handler: (payload: MissingTranslationPayload) => void;
  dedupe?: boolean;
}

function getDedupeKey(payload: MissingTranslationPayload) {
  return JSON.stringify([
    payload.messageKey,
    payload.locale,
    payload.revision || null,
    payload.source || null,
  ]);
}

export function createMissingTranslationsModule(
  options: MissingTranslationsModuleOptions,
): MessagevisorModule {
  const name = options?.name || "missing-translations";
  const handler = options?.handler;
  const dedupe = options?.dedupe === true;
  const seen = new Set<string>();

  return {
    name,
    setup({ getRevision, onDiagnostic }) {
      if (typeof handler !== "function") {
        throw new Error("Missing translations module requires a handler.");
      }

      onDiagnostic(
        (diagnostic) => {
          const messageKey = diagnostic.details.messageKey;
          const diagnosticLocale = diagnostic.details.locale;
          const source = diagnostic.details.source;

          if (diagnostic.code !== "missing_translation" || typeof messageKey !== "string") {
            return;
          }

          const locale = typeof diagnosticLocale === "string" ? diagnosticLocale : null;
          let revision: string | undefined;

          if (locale) {
            try {
              revision = getRevision(locale);
            } catch {
              revision = undefined;
            }
          }

          const payload: MissingTranslationPayload = {
            messageKey,
            locale,
            revision,
            source: source === "translation" || source === "formatMessage" ? source : undefined,
            diagnostic,
          };

          if (dedupe) {
            const dedupeKey = getDedupeKey(payload);

            if (seen.has(dedupeKey)) {
              return;
            }

            seen.add(dedupeKey);
          }

          handler(payload);
        },
        { logLevel: "error" },
      );
    },
  };
}
