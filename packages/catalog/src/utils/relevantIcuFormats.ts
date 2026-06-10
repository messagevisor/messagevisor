type FormatBucket = Record<string, unknown>;
type FormatPresetsLike = Record<string, FormatBucket | unknown>;

const ICU_FORMAT_TYPES = ["number", "date", "time"] as const;

type IcuFormatType = (typeof ICU_FORMAT_TYPES)[number];

const ICU_FORMAT_TYPE_SET = new Set<string>(ICU_FORMAT_TYPES);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeFormatPresetsLike(
  parent?: FormatPresetsLike,
  child?: FormatPresetsLike,
): FormatPresetsLike | undefined {
  if (!isPlainObject(parent)) {
    return isPlainObject(child) ? child : undefined;
  }

  if (!isPlainObject(child)) {
    return parent;
  }

  const result: FormatPresetsLike = { ...parent };

  for (const typeKey of Object.keys(child)) {
    const parentStyles = result[typeKey];
    const childStyles = child[typeKey];

    if (!isPlainObject(parentStyles) || !isPlainObject(childStyles)) {
      result[typeKey] = childStyles;
      continue;
    }

    result[typeKey] = {
      ...parentStyles,
      ...childStyles,
    };
  }

  return result;
}

function normalizeIcuStyleName(value: string) {
  const style = value.trim();

  if (!style || style.startsWith("::")) {
    return undefined;
  }

  return style.replace(/,$/, "").trim() || undefined;
}

export function extractIcuFormatStyleReferences(message: string | undefined) {
  const references: Partial<Record<IcuFormatType, string[]>> = {};

  if (!message) {
    return references;
  }

  const pattern = /\{[^{}]*,\s*(number|date|time)\s*,\s*([^{}]+?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(message))) {
    const type = match[1] as IcuFormatType;
    const style = normalizeIcuStyleName(match[2]);

    if (!style) {
      continue;
    }

    if (!references[type]) {
      references[type] = [];
    }

    if (!references[type]!.includes(style)) {
      references[type]!.push(style);
    }
  }

  return references;
}

export function getRelevantIcuFormats(
  message: string | undefined,
  computedFormats: unknown,
  exampleFormats?: unknown,
) {
  const effectiveFormats = mergeFormatPresetsLike(
    isPlainObject(computedFormats) ? computedFormats : undefined,
    isPlainObject(exampleFormats) ? exampleFormats : undefined,
  );
  const references = extractIcuFormatStyleReferences(message);
  const relevant: Partial<Record<IcuFormatType, Record<string, unknown>>> = {};

  if (!effectiveFormats) {
    return undefined;
  }

  for (const typeKey of Object.keys(references)) {
    if (!ICU_FORMAT_TYPE_SET.has(typeKey)) {
      continue;
    }

    const type = typeKey as IcuFormatType;
    const styles = references[type] || [];
    const availableStyles = effectiveFormats[type];

    if (!isPlainObject(availableStyles)) {
      continue;
    }

    for (const style of styles) {
      if (!Object.prototype.hasOwnProperty.call(availableStyles, style)) {
        continue;
      }

      if (!relevant[type]) {
        relevant[type] = {};
      }

      relevant[type]![style] = availableStyles[style];
    }
  }

  return Object.keys(relevant).length > 0 ? relevant : undefined;
}
