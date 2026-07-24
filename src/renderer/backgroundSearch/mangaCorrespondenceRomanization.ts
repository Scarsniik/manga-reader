const MAX_ROMANIZED_SEARCH_TERM_LENGTH = 220;
export const MAX_ROMANIZED_SEARCH_TERMS_PER_TITLE = 2;

const expandRomanizedLongVowels = (value: string): string => (
  value
    .replace(/[āĀâÂ]/g, (match) => (match === match.toUpperCase() ? "Aa" : "aa"))
    .replace(/[īĪîÎ]/g, (match) => (match === match.toUpperCase() ? "Ii" : "ii"))
    .replace(/[ūŪûÛ]/g, (match) => (match === match.toUpperCase() ? "Uu" : "uu"))
    .replace(/[ēĒêÊ]/g, (match) => (match === match.toUpperCase() ? "Ee" : "ee"))
    .replace(/[ōŌôÔ]/g, (match) => (match === match.toUpperCase() ? "Ou" : "ou"))
);

const normalizeRomanizedSearchTerm = (value: string): string => (
  expandRomanizedLongVowels(String(value ?? ""))
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' -]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ROMANIZED_SEARCH_TERM_LENGTH)
);

const isReadableRomanizedSearchTerm = (value: string): boolean => {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 3
    && words.some((word) => word.length >= 4)
    && !words.some((word) => word.length > 80);
};

export const selectMangaCorrespondenceRomanizedSearchTerms = (
  variants: string[],
  limit = MAX_ROMANIZED_SEARCH_TERMS_PER_TITLE,
): string[] => {
  const seen = new Set<string>();
  const selected: string[] = [];

  variants.some((variant) => {
    const normalized = normalizeRomanizedSearchTerm(variant);
    const key = normalized.toLowerCase();
    if (!isReadableRomanizedSearchTerm(normalized) || seen.has(key)) {
      return false;
    }

    seen.add(key);
    selected.push(normalized);
    return selected.length >= Math.max(0, limit);
  });

  return selected;
};
