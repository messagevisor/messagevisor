/** Shared advanced search tokenization (used by entity lists, format tables, etc.). */

export interface ParsedQuery {
  freeText: string[];
  qualifiers: Array<{ key: string; value: string }>;
}

export function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of raw) {
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === " " && !inQuote) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseQuery(raw: string): ParsedQuery {
  const freeText: string[] = [];
  const qualifiers: Array<{ key: string; value: string }> = [];

  for (const token of tokenize(raw.trim())) {
    const colonIdx = token.indexOf(":");
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      let value = token.slice(colonIdx + 1);
      if (value.startsWith('"') && value.endsWith('"') && value.length > 2) {
        value = value.slice(1, -1);
      }
      if (value) qualifiers.push({ key, value });
    } else {
      freeText.push(token.toLowerCase());
    }
  }

  return { freeText, qualifiers };
}
