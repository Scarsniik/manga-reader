const normalizeFullwidthAscii = (value: string): string => (
  value.replace(/[！-～]/gu, (character) => (
    String.fromCodePoint((character.codePointAt(0) ?? 0) - 0xfee0)
  ))
);

export const normalizeTitleAnalysisText = (value: unknown): string => (
  normalizeFullwidthAscii(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
);

export const splitTitleAnalysisListValue = (value: string): string[] => {
  const values: string[] = [];
  let depth = 0;
  let current = "";

  Array.from(value).forEach((char) => {
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if ((char === "," || char === "&") && depth === 0) {
      const normalized = normalizeTitleAnalysisText(current);
      if (normalized) {
        values.push(normalized);
      }
      current = "";
      return;
    }

    current += char;
  });

  const normalized = normalizeTitleAnalysisText(current);
  if (normalized) {
    values.push(normalized);
  }

  return Array.from(new Set(values));
};

export const appendUniqueTitleAnalysisValue = (
  values: string[],
  nextValue: string,
): string[] => {
  const normalized = normalizeTitleAnalysisText(nextValue);
  if (!normalized) {
    return values;
  }

  const seen = new Set(values.map((value) => value.toLowerCase()));
  return seen.has(normalized.toLowerCase()) ? values : [...values, normalized];
};

export const splitTitleAnalysisAlternatives = (value: string): string[] => {
  const alternatives: string[] = [];
  let current = "";
  let depth = 0;
  const characters = Array.from(value);
  const flush = (): void => {
    const normalized = normalizeTitleAnalysisText(current);
    if (normalized) alternatives.push(normalized);
    current = "";
  };

  characters.forEach((character, index) => {
    if ("([{（［｛".includes(character)) depth += 1;
    if (")]}）］｝".includes(character)) depth = Math.max(0, depth - 1);
    const previous = characters[index - 1] ?? "";
    const next = characters[index + 1] ?? "";
    const isWrappedDash = "ー–—".includes(character) && /\s/u.test(previous) && /\s/u.test(next);
    const isSpacedSlash = character === "/" && /\s/u.test(previous) && /\s/u.test(next);
    if (depth === 0 && ("|｜ㅣᅵ│┃¦".includes(character) || isSpacedSlash || isWrappedDash)) {
      flush();
      return;
    }
    current += character;
  });
  flush();

  return alternatives.length ? Array.from(new Set(alternatives)) : [normalizeTitleAnalysisText(value)].filter(Boolean);
};
