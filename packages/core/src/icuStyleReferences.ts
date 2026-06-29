export type IcuFormatType = "number" | "date" | "time";

export interface IcuStyleReference {
  type: IcuFormatType;
  style: string;
  isSkeleton: boolean;
}

function findMatchingBrace(value: string, openIndex: number) {
  let depth = 0;

  for (let index = openIndex; index < value.length; index++) {
    const character = value[index];

    if (character === "{") {
      depth++;
    }

    if (character === "}") {
      depth--;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelCommas(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let startIndex = 0;

  for (let index = 0; index < value.length; index++) {
    const character = value[index];

    if (character === "{") {
      depth++;
      continue;
    }

    if (character === "}") {
      depth--;
      continue;
    }

    if (character === "," && depth === 0) {
      parts.push(value.slice(startIndex, index).trim());
      startIndex = index + 1;
    }
  }

  parts.push(value.slice(startIndex).trim());

  return parts;
}

function normalizeStyle(style: string): { style: string; isSkeleton: boolean } {
  const trimmedStyle = style.trim();

  if (!trimmedStyle) {
    return { style: "", isSkeleton: false };
  }

  if (trimmedStyle.startsWith("::")) {
    return { style: trimmedStyle, isSkeleton: true };
  }

  return { style: trimmedStyle.split(/\s+/)[0], isSkeleton: false };
}

export function extractIcuStyleReferences(value: string): IcuStyleReference[] {
  const references: IcuStyleReference[] = [];
  let index = 0;

  while (index < value.length) {
    const openIndex = value.indexOf("{", index);

    if (openIndex === -1) {
      break;
    }

    const closeIndex = findMatchingBrace(value, openIndex);

    if (closeIndex === -1) {
      break;
    }

    const content = value.slice(openIndex + 1, closeIndex);
    const parts = splitTopLevelCommas(content);
    const type = parts[1]?.trim();
    const styleReference = parts[2] ? normalizeStyle(parts[2]) : { style: "", isSkeleton: false };

    if ((type === "number" || type === "date" || type === "time") && styleReference.style) {
      references.push({ type, style: styleReference.style, isSkeleton: styleReference.isSkeleton });
    }

    references.push(...extractIcuStyleReferences(content));
    index = closeIndex + 1;
  }

  return references;
}
