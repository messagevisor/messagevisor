import type {
  Condition,
  GroupSegment,
  TargetKey,
  SegmentKey,
  LocaleKey,
  LocaleDirection,
  MessageKey,
  MessageMeta,
  Segment,
  Translation,
} from "./entities";
import type { FormatPresets } from "./format";

export interface MessageOverride {
  key: string;

  // one of them need to be provided
  conditions?: Condition | Condition[] | "*"; // string can be "*" or stringified datafile condition
  segments?: GroupSegment | GroupSegment[] | "*"; // string can be "*", segment key, or stringified datafile segment group

  translation: Translation;
}

export interface DatafileMessage {
  deprecated?: boolean;
  deprecationWarning?: string;
  meta?: MessageMeta;
  overrides?: MessageOverride[];
}

export interface DatafileContent {
  schemaVersion: string;
  messagevisorVersion: string;
  revision: string;
  target: TargetKey;
  locale: LocaleKey;
  direction?: LocaleDirection;
  formats?: FormatPresets;
  segments: {
    [key: SegmentKey]: Segment;
  };
  messages: {
    [key: MessageKey]: DatafileMessage;
  };
  translations: {
    [key: MessageKey]: Translation;
  };
}
