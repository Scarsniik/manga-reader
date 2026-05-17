import { normalizeScraperCssSelectorInput } from "@/shared/scraper";

const RESERVED_SCRAPER_DISPLAY_CHARACTERS = new Set([
  ":",
  "/",
  "?",
  "#",
  "[",
  "]",
  "@",
  "!",
  "$",
  "&",
  "'",
  "(",
  ")",
  "*",
  "+",
  ",",
  ";",
  "=",
  "%",
]);

export const normalizeSelectorInput = (input: string): string => (input ? normalizeScraperCssSelectorInput(input) : "");

export const formatScraperValueForDisplay = (value: string | undefined): string => {
  if (typeof value !== "string" || !value.length) {
    return "";
  }

  return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, (encodedChunk) => {
    try {
      const decodedChunk = decodeURIComponent(encodedChunk);
      return Array.from(decodedChunk).some((character) => RESERVED_SCRAPER_DISPLAY_CHARACTERS.has(character))
        ? encodedChunk
        : decodedChunk;
    } catch {
      return encodedChunk;
    }
  });
};

export const formatScraperPageCountForDisplay = (value: string | undefined): string => {
  const normalizedValue = formatScraperValueForDisplay(String(value ?? "").trim());
  if (!normalizedValue) {
    return "";
  }

  return /^\d+$/.test(normalizedValue) ? `${normalizedValue} page(s)` : normalizedValue;
};
