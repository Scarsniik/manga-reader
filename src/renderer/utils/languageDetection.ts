import { languages } from "@/renderer/consts/languages";
import type { ScraperLanguageValueMapping } from "@/shared/scraper";

export const UNKNOWN_LANGUAGE_CODE = "__language_unknown__";

const UNKNOWN_LANGUAGE_VALUES = new Set([
  "",
  "unknown",
  "__multi_search_unknown__",
  UNKNOWN_LANGUAGE_CODE,
]);

const LANGUAGE_FLAG_CODES: Record<string, string> = {
  en: "gb",
  fr: "fr",
  ja: "jp",
  es: "es",
  de: "de",
  it: "it",
  pt: "pt",
  ko: "kr",
  zh: "cn",
  ru: "ru",
};

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  anglais: "en",
  gb: "en",
  uk: "en",
  fr: "fr",
  fra: "fr",
  fre: "fr",
  french: "fr",
  francais: "fr",
  vf: "fr",
  vostfr: "fr",
  ja: "ja",
  jp: "ja",
  jpn: "ja",
  japanese: "ja",
  japonais: "ja",
  raw: "ja",
  es: "es",
  esp: "es",
  spa: "es",
  spanish: "es",
  espanol: "es",
  de: "de",
  ger: "de",
  deu: "de",
  german: "de",
  allemand: "de",
  it: "it",
  ita: "it",
  italian: "it",
  italien: "it",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  portugais: "pt",
  br: "pt",
  ptbr: "pt",
  ko: "ko",
  kor: "ko",
  korean: "ko",
  coreen: "ko",
  zh: "zh",
  cn: "zh",
  chi: "zh",
  zho: "zh",
  chinese: "zh",
  chinois: "zh",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  russe: "ru",
};

const TITLE_LANGUAGE_PATTERNS: Array<{
  code: string;
  pattern: RegExp;
}> = [
  { code: "en", pattern: /(?:[\[({]\s*(?:en|eng|english|anglais)\s*[\])}]|(?:^|[\s_\-.])(?:eng|english|anglais)(?:$|[\s_\-.]))/i },
  { code: "fr", pattern: /(?:[\[({]\s*(?:fr|fra|fre|french|francais|français|vf|vostfr)\s*[\])}]|(?:^|[\s_\-.])(?:fra|fre|french|francais|français|vf|vostfr)(?:$|[\s_\-.]))/i },
  { code: "ja", pattern: /(?:[\[({]\s*(?:ja|jp|jpn|japanese|japonais|raw)\s*[\])}]|(?:^|[\s_\-.])(?:jpn|japanese|japonais|raw)(?:$|[\s_\-.]))/i },
  { code: "es", pattern: /(?:[\[({]\s*(?:es|esp|spa|spanish|espanol|español)\s*[\])}]|(?:^|[\s_\-.])(?:esp|spa|spanish|espanol|español)(?:$|[\s_\-.]))/i },
  { code: "de", pattern: /(?:[\[({]\s*(?:de|ger|deu|german|allemand)\s*[\])}]|(?:^|[\s_\-.])(?:ger|deu|german|allemand)(?:$|[\s_\-.]))/i },
  { code: "it", pattern: /(?:[\[({]\s*(?:it|ita|italian|italien)\s*[\])}]|(?:^|[\s_\-.])(?:ita|italian|italien)(?:$|[\s_\-.]))/i },
  { code: "pt", pattern: /(?:[\[({]\s*(?:pt|por|portuguese|portugais|br|ptbr|pt-br)\s*[\])}]|(?:^|[\s_\-.])(?:por|portuguese|portugais|br|ptbr|pt-br)(?:$|[\s_\-.]))/i },
  { code: "ko", pattern: /(?:[\[({]\s*(?:ko|kor|korean|coreen|coréen)\s*[\])}]|(?:^|[\s_\-.])(?:kor|korean|coreen|coréen)(?:$|[\s_\-.]))/i },
  { code: "zh", pattern: /(?:[\[({]\s*(?:zh|chi|zho|cn|chinese|chinois)\s*[\])}]|(?:^|[\s_\-.])(?:chi|zho|chinese|chinois)(?:$|[\s_\-.]))/i },
  { code: "ru", pattern: /(?:[\[({]\s*(?:ru|rus|russian|russe)\s*[\])}]|(?:^|[\s_\-.])(?:rus|russian|russe)(?:$|[\s_\-.]))/i },
];

const TITLE_LANGUAGE_MARKER_PATTERN = new RegExp([
  String.raw`[\[({]\s*(?:en|eng|english|anglais|fr|fra|fre|french|francais|français|vf|vostfr|ja|jp|jpn|japanese|japonais|raw|es|esp|spa|spanish|espanol|español|de|ger|deu|german|allemand|it|ita|italian|italien|pt|por|portuguese|portugais|br|ptbr|pt-br|ko|kor|korean|coreen|coréen|zh|chi|zho|cn|chinese|chinois|ru|rus|russian|russe)\s*[\])}]`,
  String.raw`(?:^|[\s_\-.])(?:eng|english|anglais|fra|fre|french|francais|français|vf|vostfr|jpn|japanese|japonais|raw|esp|spa|spanish|espanol|español|ger|deu|german|allemand|ita|italian|italien|por|portuguese|portugais|br|ptbr|pt-br|kor|korean|coreen|coréen|chi|zho|chinese|chinois|rus|russian|russe)(?:$|[\s_\-.])`,
].join("|"), "gi");

const KNOWN_LANGUAGE_CODES = new Set(languages.map((language) => language.code));

export const normalizeLanguageToken = (value: string): string => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^pt-br$/, "ptbr")
);

const getLanguageMappingCandidates = (value: string): string[] => {
  const normalizedSource = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const tokens = normalizedSource.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
  const candidates = [
    normalizeLanguageToken(value),
    ...tokens.flatMap((token) => {
      const normalizedToken = normalizeLanguageToken(token);
      const flagMatch = normalizedToken.match(/^flag-(.+)$/);

      return flagMatch
        ? [normalizedToken, normalizeLanguageToken(flagMatch[1])]
        : [normalizedToken];
    }),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
};

const getNormalizedLanguageMappings = (
  mappings: ScraperLanguageValueMapping[] | undefined,
): ScraperLanguageValueMapping[] => (
  (mappings ?? [])
    .map((mapping) => ({
      value: normalizeLanguageToken(mapping.value),
      languageCode: mapping.languageCode.trim().toLowerCase(),
    }))
    .filter((mapping) => mapping.value && mapping.languageCode)
);

export const uniqueLanguageCodes = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((codes, value) => {
    const normalized = normalizeLanguageToken(value);
    const code = LANGUAGE_ALIASES[normalized] || (KNOWN_LANGUAGE_CODES.has(normalized) ? normalized : "");

    if (!code || seen.has(code)) {
      return codes;
    }

    seen.add(code);
    codes.push(code);
    return codes;
  }, []);
};

export const getLanguageLabel = (value: string): string => {
  const normalizedValue = value.trim().toLowerCase();
  if (UNKNOWN_LANGUAGE_VALUES.has(normalizedValue)) {
    return "Non renseignee";
  }

  return languages.find((language) => language.code === normalizedValue)?.frenchName || "?";
};

export const getLanguageFlagCode = (value: string): string => {
  const normalizedValue = value.trim().toLowerCase();
  if (UNKNOWN_LANGUAGE_VALUES.has(normalizedValue)) {
    return "unknown";
  }

  return LANGUAGE_FLAG_CODES[normalizedValue] || normalizedValue || "unknown";
};

export const detectLanguageCodesFromTitle = (title: string): string[] => (
  TITLE_LANGUAGE_PATTERNS
    .filter(({ pattern }) => pattern.test(title))
    .map(({ code }) => code)
);

export const stripTitleLanguageMarkers = (title: string): string => (
  title
    .replace(TITLE_LANGUAGE_MARKER_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
);

export const isTitleLanguageMarker = (value: string): boolean => (
  TITLE_LANGUAGE_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  })
);

export const detectLanguageCodesFromTextValues = (values: string[]): string[] => {
  const candidates = values.flatMap((value) => [
    value,
    ...value.split(/[,;|\/()[\]{}\s]+/g),
  ]);

  return uniqueLanguageCodes(candidates);
};

export const detectLanguageCodesFromProcessedValues = (values: string[]): string[] => {
  const candidates = values.flatMap((value) => {
    const flagMatches = Array.from(value.matchAll(/\bflag-([a-z0-9-]+)\b/gi))
      .map((match) => match[1]);

    return [
      value,
      ...flagMatches,
      ...value.split(/[,;|\/()[\]{}\s_\-.]+/g),
    ];
  });

  return uniqueLanguageCodes(candidates);
};

export const detectLanguageCodesFromMappedValues = (
  values: string[],
  mappings: ScraperLanguageValueMapping[] | undefined,
): string[] => {
  const normalizedMappings = getNormalizedLanguageMappings(mappings);
  if (!normalizedMappings.length) {
    return [];
  }

  for (const value of values) {
    const candidates = getLanguageMappingCandidates(value);
    const mapping = candidates
      .map((candidate) => normalizedMappings.find((entry) => entry.value === candidate))
      .find(Boolean);
    const languageCodes = mapping ? uniqueLanguageCodes([mapping.languageCode]) : [];

    if (languageCodes.length) {
      return languageCodes;
    }
  }

  return [];
};
