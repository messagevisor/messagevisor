const portableRegexFlagsPattern = /^[imsu]+$/;

/**
 * Validates the regular expression subset shared by Messagevisor SDKs.
 *
 * The scanner deliberately understands escaped characters and character
 * classes so literal text is not mistaken for unsupported group syntax,
 * backreferences, or possessive quantifiers.
 */
export function getPortableRegexError(pattern: string, flags = "") {
  if (flags && (!portableRegexFlagsPattern.test(flags) || new Set(flags).size !== flags.length)) {
    return 'flags must contain each of "i", "m", "s", and "u" at most once';
  }

  try {
    new RegExp(pattern, flags);
  } catch (error) {
    return `must be valid: ${error instanceof Error ? error.message : String(error)}`;
  }

  let inCharacterClass = false;

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];

    if (character === "\\") {
      const escaped = pattern[index + 1];
      if (
        !inCharacterClass &&
        (/[1-9]/.test(escaped || "") ||
          ((escaped === "k" || escaped === "g") &&
            (pattern[index + 2] === "<" || pattern[index + 2] === "'")))
      ) {
        return "must not use backreferences";
      }
      index += 1;
      continue;
    }

    if (character === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (inCharacterClass) continue;

    if (character === "(" && pattern[index + 1] === "?") {
      return "must not use lookaround, named groups, noncapturing groups, atomic groups, or inline mode groups";
    }

    if (
      (character === "?" || character === "*" || character === "+") &&
      pattern[index + 1] === "+"
    ) {
      return "must not use possessive quantifiers";
    }

    if (character === "{") {
      const quantifier = pattern.slice(index).match(/^\{\d+(?:,\d*)?\}\+/);
      if (quantifier) return "must not use possessive quantifiers";
    }
  }

  return undefined;
}
