export type JapaneseRomajiSystem = "hepburn" | "passport" | "nippon";
export type KanaToRomaji = (text: string, system?: JapaneseRomajiSystem) => string;

export const JAPANESE_ROMAJI_SYSTEMS: JapaneseRomajiSystem[] = [
  "hepburn",
  "passport",
  "nippon",
];

const TITLE_CASE_PARTICLES = new Set([
  "and",
  "de",
  "e",
  "ga",
  "kara",
  "made",
  "mo",
  "ni",
  "no",
  "o",
  "to",
  "wa",
  "wo",
  "ya",
  "yori",
]);
const JAPANESE_CHARACTER_PATTERN = /[\u3040-\u30ff\uff66-\uff9f\u3400-\u9fff々〆ヵヶ]/u;

export const uniqueValues = (
  values: string[],
  limit = Number.POSITIVE_INFINITY,
): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.some((value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    unique.push(normalized);
    return unique.length >= limit;
  });

  return unique;
};

const expandMacronVowelsAsLongVowels = (value: string): string => (
  value
    .replace(/[āĀ]/g, (match) => (match === "Ā" ? "Aa" : "aa"))
    .replace(/[īĪ]/g, (match) => (match === "Ī" ? "Ii" : "ii"))
    .replace(/[ūŪ]/g, (match) => (match === "Ū" ? "Uu" : "uu"))
    .replace(/[ēĒ]/g, (match) => (match === "Ē" ? "Ee" : "ee"))
    .replace(/[ōŌ]/g, (match) => (match === "Ō" ? "Ou" : "ou"))
);

const expandMacronVowelsAsDoubleVowels = (value: string): string => (
  value
    .replace(/[āĀ]/g, (match) => (match === "Ā" ? "Aa" : "aa"))
    .replace(/[īĪ]/g, (match) => (match === "Ī" ? "Ii" : "ii"))
    .replace(/[ūŪ]/g, (match) => (match === "Ū" ? "Uu" : "uu"))
    .replace(/[ēĒ]/g, (match) => (match === "Ē" ? "Ee" : "ee"))
    .replace(/[ōŌ]/g, (match) => (match === "Ō" ? "Oo" : "oo"))
);

const foldLongVowels = (value: string): string => (
  expandMacronVowelsAsLongVowels(value)
    .replace(/ou/gi, (match) => (match[0] === "O" ? "O" : "o"))
    .replace(/aa/gi, (match) => (match[0] === "A" ? "A" : "a"))
    .replace(/ii/gi, (match) => (match[0] === "I" ? "I" : "i"))
    .replace(/uu/gi, (match) => (match[0] === "U" ? "U" : "u"))
    .replace(/ee/gi, (match) => (match[0] === "E" ? "E" : "e"))
    .replace(/oo/gi, (match) => (match[0] === "O" ? "O" : "o"))
);

export const addLongVowelShapeVariants = (values: string[]): string[] => (
  uniqueValues(values.flatMap((value) => [
    value,
    expandMacronVowelsAsLongVowels(value),
    expandMacronVowelsAsDoubleVowels(value),
    foldLongVowels(value),
  ]))
);

export const applyCommonReadingAlternatives = (value: string): string => (
  value
    .replace(/\bichi nin\b/gi, "hitori")
    .replace(/\bni nin\b/gi, "futari")
    .replace(/\bki ta\b/gi, "kita")
    .replace(/\bshi ta\b/gi, "shita")
    .replace(/\bi tta\b/gi, "itta")
    .replace(/ichinin/gi, "hitori")
    .replace(/ninin/gi, "futari")
);

export const isRomanizedVariant = (value: string): boolean => (
  !JAPANESE_CHARACTER_PATTERN.test(value)
);

export const capitalizeRomanWord = (word: string): string => (
  word.replace(/(\p{L})([\p{L}\p{N}'-]*)/u, (_match, first: string, rest: string) => (
    `${first.toUpperCase()}${rest.toLowerCase()}`
  ))
);

const shouldKeepTitleWordLowercase = (word: string, index: number): boolean => {
  if (index === 0 || word.includes("[")) {
    return false;
  }

  const normalizedWord = word
    .replace(/[^\p{L}\p{N}'-]+/gu, "")
    .toLowerCase();

  return TITLE_CASE_PARTICLES.has(normalizedWord);
};

export const toReadableTitleCase = (value: string): string => (
  value
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+]/g, "]")
    .trim()
    .split(" ")
    .map((word, index) => (
      shouldKeepTitleWordLowercase(word, index) ? word.toLowerCase() : capitalizeRomanWord(word)
    ))
    .join(" ")
);

export const romanizeKana = (
  value: string,
  kanaToRomaji: KanaToRomaji | null,
  system: JapaneseRomajiSystem = "hepburn",
): string => (
  kanaToRomaji ? kanaToRomaji(value, system) : value
);
