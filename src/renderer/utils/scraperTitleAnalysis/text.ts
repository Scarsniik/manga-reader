export const normalizeTitleAnalysisText = (value: unknown): string => (
  String(value ?? "")
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
  const alternatives = value
    .split(/(?:[|/]+|\s+[ー–—]\s+)/g)
    .map(normalizeTitleAnalysisText)
    .filter(Boolean);

  return alternatives.length ? Array.from(new Set(alternatives)) : [normalizeTitleAnalysisText(value)].filter(Boolean);
};
