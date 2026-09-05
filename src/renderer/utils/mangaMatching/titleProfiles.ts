import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import { stripTitleLanguageMarkers } from "@/renderer/utils/languageDetection";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  buildVariantKindSets,
  getLooseRomajiPhoneticKey,
  getMergeTitleVariants,
  getRomanizationMatchLevel,
  type RomanizationMatchLevel,
  type TitleMergeVariant,
  type TitleMergeVariantKind,
} from "@/renderer/utils/mangaMatching/titleVariants";
import {
  hasSingleEditDifference,
  isFuzzyTitleCandidate,
} from "@/renderer/utils/mangaMatching/titleFuzzy";

const SEQUENCE_VALUE_PATTERN = String.raw`(?:\d{1,3}|i|ii|iii|iv|v|vi|vii|viii|ix|x)`;
const EXPLICIT_SEQUENCE_RANGE_PATTERN = new RegExp(
  String.raw`\b(?:vol(?:ume)?|part|pt|chapter|ch|episode|ep|no)\.?\s*#?\s*(${SEQUENCE_VALUE_PATTERN})\s*[-–—~+]\s*(${SEQUENCE_VALUE_PATTERN})\b`,
  "gi",
);
const EXPLICIT_SEQUENCE_PATTERN = new RegExp(
  String.raw`\b(?:vol(?:ume)?|part|pt|chapter|ch|episode|ep|no)\.?\s*#?\s*(${SEQUENCE_VALUE_PATTERN})\b`,
  "gi",
);
const HASH_SEQUENCE_PATTERN = new RegExp(String.raw`#\s*(${SEQUENCE_VALUE_PATTERN})\b`, "gi");
const TRAILING_SEQUENCE_RANGE_PATTERN = new RegExp(
  String.raw`(?:^|\s)(${SEQUENCE_VALUE_PATTERN})\s*[-–—~+]\s*(${SEQUENCE_VALUE_PATTERN})\s*$`,
  "i",
);
const TRAILING_SEQUENCE_PATTERN = new RegExp(
  String.raw`(?:^|\s)(${SEQUENCE_VALUE_PATTERN})\s*$`,
  "i",
);
const DATE_PATTERN = /\b(?:19|20)\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b/g;
const FIRST_PART_PATTERN = /(?:\b(?:zenpen|zen hen)\b|前編|上巻)/giu;
const LAST_PART_PATTERN = /(?:\b(?:kouhen|kohen|kou hen|ko hen)\b|後編|下巻)/giu;
const JAPANESE_SEQUENCE_PATTERN = /第\s*(\d{1,3})\s*(?:話|章|巻|部)/gu;
const TITLE_ALTERNATIVE_SEPARATOR_PATTERN = /[|│┃¦/]+/gu;
const SPACED_JAPANESE_DASH_PATTERN = /\s+ー+\s+/gu;
const ROMAN_SEQUENCE_VALUES: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

export type MangaMergeOptions = {
  enableRomajiPhoneticMerge: boolean;
  assumeSameAuthor?: boolean;
};

export type MatchableManga = {
  title: string;
  sourceUrl?: string | null;
  authorNames?: string[];
  contextualAuthorNames?: string[];
  advancedRomanizedTitleVariants?: string[];
  advancedRomanizedAuthorNameVariants?: string[];
  advancedRomanizedContextualAuthorNameVariants?: string[];
};

export type MangaTitleMatchKind = "base" | RomanizationMatchLevel;
export type MangaMatchKind = "url" | MangaTitleMatchKind;

type TitleAlternativeMergeProfile = {
  variants: string[];
  variantKindSets: Map<string, Set<TitleMergeVariantKind>>;
  sequenceMarkers: Set<string>;
  sequenceAgnosticVariants: string[];
  fuzzyVariants: string[];
};

type MangaTitleMergeProfile = {
  alternatives: TitleAlternativeMergeProfile[];
  normalizedAuthorNames: string[];
  normalizedContextualAuthorNames: string[];
};

const mangaTitleMergeProfileCache = new WeakMap<MatchableManga, Map<string, MangaTitleMergeProfile>>();
const mangaTitleMergeProfileValueCache = new Map<string, MangaTitleMergeProfile>();
const MAX_MANGA_TITLE_PROFILE_VALUE_CACHE_SIZE = 5000;
const SAME_AUTHOR_COMPACT_ROMAJI_MIN_CHARACTERS = 14;
const FUZZY_AUTHOR_MIN_CHARACTERS = 12;

export const DEFAULT_MANGA_MERGE_OPTIONS: MangaMergeOptions = {
  enableRomajiPhoneticMerge: false,
  assumeSameAuthor: false,
};

export const normalizeMangaMergeOptions = (
  options: Partial<MangaMergeOptions> | null | undefined,
): MangaMergeOptions => ({
  ...DEFAULT_MANGA_MERGE_OPTIONS,
  ...(options ?? {}),
});

export const areMangaMergeOptionsEqual = (
  left: MangaMergeOptions,
  right: MangaMergeOptions,
): boolean => (
  left.enableRomajiPhoneticMerge === right.enableRomajiPhoneticMerge
  && (left.assumeSameAuthor === true) === (right.assumeSameAuthor === true)
);

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
};

const normalizeSequenceValue = (value: string): string => {
  const normalized = value.toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return String(Number.parseInt(normalized, 10));
  }

  return String(ROMAN_SEQUENCE_VALUES[normalized] ?? normalized);
};

const replaceSequenceSyntax = (value: string): string => (
  value
    .replace(
      new RegExp(
        String.raw`\b(?:vol(?:ume)?|part|pt|chapter|ch|episode|ep|no)\.?\s*#?\s*(${SEQUENCE_VALUE_PATTERN})\s*[-–—~+]\s*(${SEQUENCE_VALUE_PATTERN})\b`,
        "gi",
      ),
      (_match, startValue: string, endValue: string) => (
        ` ${normalizeSequenceValue(startValue)}-${normalizeSequenceValue(endValue)} `
      ),
    )
    .replace(
      new RegExp(
        String.raw`\b(?:vol(?:ume)?|part|pt|chapter|ch|episode|ep|no)\.?\s*#?\s*(${SEQUENCE_VALUE_PATTERN})\b`,
        "gi",
      ),
      (_match, sequenceValue: string) => ` ${normalizeSequenceValue(sequenceValue)} `,
    )
    .replace(
      new RegExp(String.raw`#\s*(${SEQUENCE_VALUE_PATTERN})\b`, "gi"),
      (_match, sequenceValue: string) => ` ${normalizeSequenceValue(sequenceValue)} `,
    )
    .replace(FIRST_PART_PATTERN, " sequence-first ")
    .replace(LAST_PART_PATTERN, " sequence-last ")
    .replace(
      new RegExp(String.raw`\b(${SEQUENCE_VALUE_PATTERN})\s*$`, "i"),
      (_match, sequenceValue: string) => ` ${normalizeSequenceValue(sequenceValue)} `,
    )
);

const normalizeTitleText = (value: string, removeParentheses = false): string => (
  replaceSequenceSyntax(stripTitleLanguageMarkers(value).normalize("NFKC"))
    .replace(/(?:\[[^\]]*]|\{[^}]*})/g, " ")
    .replace(removeParentheses ? /\([^)]*\)/g : /$^/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
);

const normalizeTitleVariant = (
  value: string,
  kind: TitleMergeVariantKind,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): TitleMergeVariant[] => {
  const normalizedValue = normalizeTitleText(value);
  const normalizedValueWithoutParentheses = normalizeTitleText(value, true);

  const variants: TitleMergeVariant[] = [
    {
      value: normalizedValue,
      kind,
    },
    {
      value: normalizedValueWithoutParentheses,
      kind,
    },
  ];

  if (options.enableRomajiPhoneticMerge) {
    variants.push(
      {
        value: getLooseRomajiPhoneticKey(normalizedValue),
        kind: "katakanaPhonetic",
      },
      {
        value: getLooseRomajiPhoneticKey(normalizedValueWithoutParentheses),
        kind: "katakanaPhonetic",
      },
    );
  }

  return variants;
};

export const getMangaTitleAlternatives = (value: string): string[] => {
  const alternatives = value
    .normalize("NFKC")
    .replace(SPACED_JAPANESE_DASH_PATTERN, "|")
    .split(TITLE_ALTERNATIVE_SEPARATOR_PATTERN)
    .map((title) => title.trim())
    .filter(Boolean);

  return alternatives.length ? Array.from(new Set(alternatives)) : [value];
};

export const getMangaTitleRomanizationTargets = (title: string): string[] => (
  uniqueValues(getMangaTitleAlternatives(title).flatMap((alternative) => [
    normalizeTitleText(alternative),
    normalizeTitleText(alternative, true),
  ]))
);

const addSequenceRange = (
  markers: Set<string>,
  startValue: string,
  endValue: string,
): void => {
  markers.add(`range:${normalizeSequenceValue(startValue)}-${normalizeSequenceValue(endValue)}`);
};

const getTitleSequenceMarkers = (value: string): Set<string> => {
  const markers = new Set<string>();
  const normalizedValue = stripTitleLanguageMarkers(value)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const valueWithoutExplicitRanges = normalizedValue.replace(
    EXPLICIT_SEQUENCE_RANGE_PATTERN,
    (_match, startValue: string, endValue: string) => {
      addSequenceRange(markers, startValue, endValue);
      return " ";
    },
  );

  for (const match of valueWithoutExplicitRanges.matchAll(EXPLICIT_SEQUENCE_PATTERN)) {
    markers.add(`number:${normalizeSequenceValue(match[1])}`);
  }
  for (const match of valueWithoutExplicitRanges.matchAll(HASH_SEQUENCE_PATTERN)) {
    markers.add(`number:${normalizeSequenceValue(match[1])}`);
  }
  for (const match of normalizedValue.matchAll(JAPANESE_SEQUENCE_PATTERN)) {
    markers.add(`number:${normalizeSequenceValue(match[1])}`);
  }
  if (FIRST_PART_PATTERN.test(normalizedValue)) {
    markers.add("part:first");
  }
  FIRST_PART_PATTERN.lastIndex = 0;
  if (LAST_PART_PATTERN.test(normalizedValue)) {
    markers.add("part:last");
  }
  LAST_PART_PATTERN.lastIndex = 0;

  const trailingValue = normalizedValue
    .replace(DATE_PATTERN, " ")
    .replace(/(?:\[[^\]]*]|\{[^}]*})/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const trailingRange = trailingValue.match(TRAILING_SEQUENCE_RANGE_PATTERN);
  if (trailingRange) {
    addSequenceRange(markers, trailingRange[1], trailingRange[2]);
    return markers;
  }

  const trailingSequence = trailingValue.match(TRAILING_SEQUENCE_PATTERN);
  if (trailingSequence) {
    markers.add(`number:${normalizeSequenceValue(trailingSequence[1])}`);
  }

  return markers;
};

type SequenceMarkerCompatibility = "contained" | "equal" | "incompatible";

const getSequenceMarkerRange = (marker: string): { end: number; start: number } | null => {
  const numberMatch = marker.match(/^number:(\d+)$/u);
  if (numberMatch) {
    const value = Number(numberMatch[1]);
    return { start: value, end: value };
  }

  const rangeMatch = marker.match(/^range:(\d+)-(\d+)$/u);
  if (!rangeMatch) {
    return null;
  }

  return {
    start: Number(rangeMatch[1]),
    end: Number(rangeMatch[2]),
  };
};

const getSequenceMarkerCompatibility = (
  leftMarkers: Set<string>,
  rightMarkers: Set<string>,
): SequenceMarkerCompatibility => {
  const equal = leftMarkers.size === rightMarkers.size
    && [...leftMarkers].every((marker) => rightMarkers.has(marker));
  if (equal) {
    return "equal";
  }

  if (leftMarkers.size !== 1 || rightMarkers.size !== 1) {
    return "incompatible";
  }

  const [leftMarker] = leftMarkers;
  const [rightMarker] = rightMarkers;
  const leftRange = getSequenceMarkerRange(leftMarker);
  const rightRange = getSequenceMarkerRange(rightMarker);
  if (!leftRange || !rightRange) {
    return "incompatible";
  }

  const leftIsRange = leftRange.start !== leftRange.end;
  const rightIsRange = rightRange.start !== rightRange.end;
  const contained = leftIsRange !== rightIsRange && (
    leftIsRange
      ? rightRange.start >= leftRange.start && rightRange.end <= leftRange.end
      : leftRange.start >= rightRange.start && leftRange.end <= rightRange.end
  );

  return contained ? "contained" : "incompatible";
};

const normalizeJapaneseRomajiLongVowels = (value: string): string => (
  value
    .replace(/oo/g, "o")
    .replace(/ou(?=[^aeiou]|$)/g, "o")
    .replace(/oh(?=[^aeiou]|$)/g, "o")
);

const getAuthorOrthographicVariants = (value: string): string[] => {
  const normalizedValue = normalizeTitleText(value);
  if (!normalizedValue) {
    return [];
  }

  const tokens = normalizedValue.split(" ");
  const longVowelValue = normalizeJapaneseRomajiLongVowels(normalizedValue);
  const variants = [
    normalizedValue,
    normalizedValue.replace(/\s+/g, ""),
    longVowelValue,
    longVowelValue.replace(/\s+/g, ""),
  ];

  if (tokens.length === 2) {
    const reversedValue = [...tokens].reverse().join(" ");
    const reversedLongVowelValue = normalizeJapaneseRomajiLongVowels(reversedValue);
    variants.push(
      reversedValue,
      reversedValue.replace(/\s+/g, ""),
      reversedLongVowelValue,
      reversedLongVowelValue.replace(/\s+/g, ""),
    );
  }

  return uniqueValues(variants);
};

const getNormalizedAuthorNameVariants = (
  value: string,
  advancedRomanizedVariants: string[] = [],
): string[] => (
  uniqueValues(
    getMergeTitleVariants(
      value,
      (variantValue, kind) => getAuthorOrthographicVariants(variantValue).map((authorValue) => ({
        value: authorValue,
        kind,
      })),
      advancedRomanizedVariants,
    )
      .map((variant) => variant.value),
  )
);

const getEmbeddedAuthorLabels = (value: string): string[] => {
  const contextPattern = /\(([^()]*)\)|\[([^\]]*)\]|\{([^}]*)\}/gu;
  const labels = Array.from(value.matchAll(contextPattern))
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .map((label) => label.trim())
    .filter(Boolean);
  const outerLabel = value.replace(contextPattern, " ").trim();

  return uniqueValues([outerLabel, ...labels]);
};

const haveSingleEditAuthorVariant = (
  leftVariants: string[],
  rightVariants: string[],
): boolean => leftVariants.some((leftVariant) => (
  Array.from(leftVariant).length >= FUZZY_AUTHOR_MIN_CHARACTERS
  && rightVariants.some((rightVariant) => (
    Array.from(rightVariant).length >= FUZZY_AUTHOR_MIN_CHARACTERS
    && hasSingleEditDifference(leftVariant, rightVariant)
  ))
));

export type MangaAuthorNameMatch = {
  referenceName: string;
  kind: "normalized" | "singleEdit" | "embeddedLabel";
};

/**
 * Matches an extracted author against known identities without using title fuzzy rules.
 * Parenthetical labels are accepted as explicit aliases, while compound free text is not.
 */
export const findCompatibleMangaAuthorName = (
  candidateName: string,
  referenceNames: string[],
): MangaAuthorNameMatch | undefined => {
  const candidateVariants = getNormalizedAuthorNameVariants(candidateName);
  if (!candidateVariants.length) return undefined;

  for (const referenceName of referenceNames) {
    const referenceVariants = getNormalizedAuthorNameVariants(referenceName);
    if (!referenceVariants.length) continue;
    const referenceVariantSet = new Set(referenceVariants);
    if (candidateVariants.some((variant) => referenceVariantSet.has(variant))) {
      return { referenceName, kind: "normalized" };
    }
    if (haveSingleEditAuthorVariant(candidateVariants, referenceVariants)) {
      return { referenceName, kind: "singleEdit" };
    }

    const candidateEmbeddedVariants = getEmbeddedAuthorLabels(candidateName)
      .flatMap((label) => getNormalizedAuthorNameVariants(label));
    const referenceEmbeddedVariants = getEmbeddedAuthorLabels(referenceName)
      .flatMap((label) => getNormalizedAuthorNameVariants(label));
    const candidateComparisonVariants = uniqueValues([
      ...candidateVariants,
      ...candidateEmbeddedVariants,
    ]);
    const referenceComparisonVariants = uniqueValues([
      ...referenceVariants,
      ...referenceEmbeddedVariants,
    ]);
    const embeddedReferenceSet = new Set(referenceComparisonVariants);
    if (candidateComparisonVariants.some((variant) => embeddedReferenceSet.has(variant))) {
      return { referenceName, kind: "embeddedLabel" };
    }
    if (haveSingleEditAuthorVariant(candidateEmbeddedVariants, referenceComparisonVariants)) {
      return { referenceName, kind: "embeddedLabel" };
    }
  }

  return undefined;
};

export const resolveCompatibleMangaAuthorName = (
  candidateName: string,
  referenceNames: string[],
): string | undefined => {
  const match = findCompatibleMangaAuthorName(candidateName, referenceNames);
  if (!match) return undefined;

  return candidateName.trim();
};

const normalizeAuthorNames = (
  values: string[],
  advancedRomanizedVariants: string[] = [],
): string[] => (
  uniqueValues([
    ...values.flatMap((value) => getNormalizedAuthorNameVariants(value)),
    ...advancedRomanizedVariants.flatMap((value) => (
      getNormalizedAuthorNameVariants(value, [value])
    )),
  ])
);

const haveConflictingNormalizedAuthors = (
  leftValues: string[],
  rightValues: string[],
): boolean => {
  if (!leftValues.length || !rightValues.length) {
    return false;
  }

  const rightSet = new Set(rightValues);
  return leftValues.every((author) => !rightSet.has(author));
};

const canUseFuzzyTitleProfileMatch = (
  leftValues: string[],
  rightValues: string[],
): boolean => {
  if (!leftValues.length || !rightValues.length) {
    return true;
  }

  const rightSet = new Set(rightValues);
  return leftValues.some((author) => rightSet.has(author));
};

const selectComparableAuthorNames = (
  normalizedAuthorNames: string[],
  normalizedContextualAuthorNames: string[],
): string[] => (
  normalizedAuthorNames.length
    ? normalizedAuthorNames
    : normalizedContextualAuthorNames
);

const areNormalizedAuthorLabelsCompatible = (
  leftValue: string,
  rightValue: string,
): boolean => {
  if (leftValue === rightValue) {
    return true;
  }

  const paddedLeftValue = ` ${leftValue} `;
  const paddedRightValue = ` ${rightValue} `;
  return paddedLeftValue.includes(paddedRightValue)
    || paddedRightValue.includes(paddedLeftValue);
};

const isSameAuthorCompactRomajiFuzzyCandidate = (
  value: string,
  variants: string[],
): boolean => {
  if (
    !/^[a-z0-9]+$/u.test(value)
    || Array.from(value).length < SAME_AUTHOR_COMPACT_ROMAJI_MIN_CHARACTERS
  ) {
    return false;
  }

  return variants.some((variant) => {
    const tokens = variant.split(" ").filter(Boolean);
    return tokens.length >= 3 && variant.replace(/\s+/g, "") === value;
  });
};

const buildTitleAlternativeMergeProfile = (
  title: string,
  advancedRomanizedVariants: string[] = [],
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
  sequenceMarkers: Set<string> = getTitleSequenceMarkers(title),
): TitleAlternativeMergeProfile => {
  const variantEntries = getMergeTitleVariants(
    title,
    (value, kind) => normalizeTitleVariant(value, kind, options),
    advancedRomanizedVariants,
  );
  const variants = uniqueValues(variantEntries.map((variant) => variant.value));
  const sequenceAnalysis = analyzeMangaCorrespondenceTitle(title, undefined);
  const sequenceAgnosticVariants = sequenceAnalysis.sequenceMarkers.length
    ? uniqueValues([
      sequenceAnalysis.title,
      ...sequenceAnalysis.alternativeTitles,
    ].flatMap((sequenceTitle) => getMergeTitleVariants(
      sequenceTitle,
      (value, kind) => normalizeTitleVariant(value, kind, options),
    ).map((variant) => variant.value)))
    : [];

  return {
    variants,
    variantKindSets: buildVariantKindSets(variantEntries),
    sequenceMarkers,
    sequenceAgnosticVariants,
    fuzzyVariants: variants.filter((variant) => (
      isFuzzyTitleCandidate(variant)
      || (
        options.assumeSameAuthor
        && isSameAuthorCompactRomajiFuzzyCandidate(variant, variants)
      )
    )),
  };
};

const buildMangaTitleAlternativeProfiles = (
  title: string,
  options: MangaMergeOptions,
): TitleAlternativeMergeProfile[] => (
  getMangaTitleAlternatives(title).flatMap((alternative) => {
    const sequenceMarkers = getTitleSequenceMarkers(alternative);
    return uniqueValues([
      alternative,
      normalizeTitleText(alternative),
      normalizeTitleText(alternative, true),
    ]).map((target) => (
      buildTitleAlternativeMergeProfile(target, [], options, sequenceMarkers)
    ));
  })
);

const buildMangaTitleMergeProfile = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): MangaTitleMergeProfile => {
  const alternatives = [
    ...buildMangaTitleAlternativeProfiles(manga.title, options),
    ...(manga.advancedRomanizedTitleVariants ?? []).map((title) => (
      buildTitleAlternativeMergeProfile(title, [title], options)
    )),
  ];

  return {
    alternatives,
    normalizedAuthorNames: options.assumeSameAuthor
      ? []
      : normalizeAuthorNames(
        manga.authorNames ?? [],
        manga.advancedRomanizedAuthorNameVariants ?? [],
      ),
    normalizedContextualAuthorNames: options.assumeSameAuthor
      ? []
      : normalizeAuthorNames(
        manga.contextualAuthorNames ?? [],
        manga.advancedRomanizedContextualAuthorNameVariants ?? [],
      ),
  };
};

const getTitleMergeOptionsCacheKey = (options: MangaMergeOptions): string => (
  [
    options.enableRomajiPhoneticMerge ? "phonetic" : "standard",
    options.assumeSameAuthor ? "same-author" : "check-author",
  ].join(":")
);

const getMangaTitleMergeProfileValueCacheKey = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string => (
  JSON.stringify([
    getTitleMergeOptionsCacheKey(options),
    manga.title,
    options.assumeSameAuthor ? [] : manga.authorNames ?? [],
    options.assumeSameAuthor ? [] : manga.contextualAuthorNames ?? [],
    manga.advancedRomanizedTitleVariants ?? [],
    options.assumeSameAuthor ? [] : manga.advancedRomanizedAuthorNameVariants ?? [],
    options.assumeSameAuthor ? [] : manga.advancedRomanizedContextualAuthorNameVariants ?? [],
  ])
);

const getCachedMangaTitleMergeProfileByValue = (
  cacheKey: string,
): MangaTitleMergeProfile | null => {
  const cachedProfile = mangaTitleMergeProfileValueCache.get(cacheKey);
  if (!cachedProfile) {
    return null;
  }

  mangaTitleMergeProfileValueCache.delete(cacheKey);
  mangaTitleMergeProfileValueCache.set(cacheKey, cachedProfile);
  return cachedProfile;
};

const setCachedMangaTitleMergeProfileByValue = (
  cacheKey: string,
  profile: MangaTitleMergeProfile,
): void => {
  mangaTitleMergeProfileValueCache.set(cacheKey, profile);

  if (mangaTitleMergeProfileValueCache.size <= MAX_MANGA_TITLE_PROFILE_VALUE_CACHE_SIZE) {
    return;
  }

  const oldestCacheKey = mangaTitleMergeProfileValueCache.keys().next().value;
  if (oldestCacheKey) {
    mangaTitleMergeProfileValueCache.delete(oldestCacheKey);
  }
};

const getMangaTitleMergeProfile = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): MangaTitleMergeProfile => {
  const cacheKey = getTitleMergeOptionsCacheKey(options);
  const cachedProfiles = mangaTitleMergeProfileCache.get(manga);
  const cachedProfile = cachedProfiles?.get(cacheKey);
  if (cachedProfile) {
    return cachedProfile;
  }

  const valueCacheKey = getMangaTitleMergeProfileValueCacheKey(manga, options);
  const cachedProfileByValue = getCachedMangaTitleMergeProfileByValue(valueCacheKey);
  if (cachedProfileByValue) {
    if (cachedProfiles) {
      cachedProfiles.set(cacheKey, cachedProfileByValue);
    } else {
      mangaTitleMergeProfileCache.set(manga, new Map([[cacheKey, cachedProfileByValue]]));
    }
    return cachedProfileByValue;
  }

  const profile = buildMangaTitleMergeProfile(manga, options);
  setCachedMangaTitleMergeProfileByValue(valueCacheKey, profile);
  if (cachedProfiles) {
    cachedProfiles.set(cacheKey, profile);
  } else {
    mangaTitleMergeProfileCache.set(manga, new Map([[cacheKey, profile]]));
  }

  return profile;
};

/**
 * Detects explicit author labels that cannot refer to the same credited author.
 * Compound credits remain compatible when they contain one complete known name.
 */
export const haveClearlyConflictingMangaAuthors = (
  left: MatchableManga,
  right: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): boolean => {
  if (options.assumeSameAuthor) {
    return false;
  }

  const leftProfile = getMangaTitleMergeProfile(left, options);
  const rightProfile = getMangaTitleMergeProfile(right, options);
  const leftAuthorNames = selectComparableAuthorNames(
    leftProfile.normalizedAuthorNames,
    leftProfile.normalizedContextualAuthorNames,
  );
  const rightAuthorNames = selectComparableAuthorNames(
    rightProfile.normalizedAuthorNames,
    rightProfile.normalizedContextualAuthorNames,
  );

  if (!leftAuthorNames.length || !rightAuthorNames.length) {
    return false;
  }

  return leftAuthorNames.every((leftAuthor) => (
    rightAuthorNames.every((rightAuthor) => (
      !areNormalizedAuthorLabelsCompatible(leftAuthor, rightAuthor)
    ))
  ));
};

const doTitleAlternativeProfilesMatch = (
  left: TitleAlternativeMergeProfile,
  right: TitleAlternativeMergeProfile,
  allowFuzzyMatch: boolean,
): MangaTitleMatchKind | null => {
  const sequenceCompatibility = getSequenceMarkerCompatibility(
    left.sequenceMarkers,
    right.sequenceMarkers,
  );
  if (sequenceCompatibility === "incompatible") {
    return null;
  }

  for (const leftVariant of left.variants) {
    const rightKinds = right.variantKindSets.get(leftVariant);
    if (!rightKinds) {
      continue;
    }

    const leftKinds = left.variantKindSets.get(leftVariant);
    if (leftKinds) {
      const romanizationMatchLevel = getRomanizationMatchLevel(leftKinds, rightKinds);
      if (romanizationMatchLevel) {
        return romanizationMatchLevel;
      }
    }

    return "base";
  }

  if (!allowFuzzyMatch) {
    return null;
  }

  for (const leftVariant of left.fuzzyVariants) {
    for (const rightVariant of right.fuzzyVariants) {
      if (!hasSingleEditDifference(leftVariant, rightVariant)) {
        continue;
      }

      const leftKinds = left.variantKindSets.get(leftVariant);
      const rightKinds = right.variantKindSets.get(rightVariant);
      if (leftKinds && rightKinds) {
        const romanizationMatchLevel = getRomanizationMatchLevel(leftKinds, rightKinds);
        if (romanizationMatchLevel) {
          return romanizationMatchLevel;
        }
      }

      return "base";
    }
  }

  if (
    sequenceCompatibility === "contained"
    && left.sequenceAgnosticVariants.some((variant) => right.sequenceAgnosticVariants.includes(variant))
  ) {
    return "base";
  }

  return null;
};

const doTitleProfilesMatch = (
  left: MangaTitleMergeProfile,
  right: MangaTitleMergeProfile,
): MangaTitleMatchKind | null => {
  const leftAuthorNames = selectComparableAuthorNames(
    left.normalizedAuthorNames,
    left.normalizedContextualAuthorNames,
  );
  const rightAuthorNames = selectComparableAuthorNames(
    right.normalizedAuthorNames,
    right.normalizedContextualAuthorNames,
  );

  if (
    haveConflictingNormalizedAuthors(
      leftAuthorNames,
      rightAuthorNames,
    )
  ) {
    return null;
  }

  const allowFuzzyMatch = canUseFuzzyTitleProfileMatch(
    leftAuthorNames,
    rightAuthorNames,
  );

  for (const leftAlternative of left.alternatives) {
    for (const rightAlternative of right.alternatives) {
      const matchKind = doTitleAlternativeProfilesMatch(leftAlternative, rightAlternative, allowFuzzyMatch);
      if (matchKind) {
        return matchKind;
      }
    }
  }

  return null;
};

export const getMangaTitleMergeExactKeys = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string[] => (
  uniqueValues(getMangaTitleMergeProfile(manga, options).alternatives.flatMap((alternative) => alternative.variants))
);

export const getMangaTitleMergeSequenceAgnosticKeys = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string[] => (
  uniqueValues(getMangaTitleMergeProfile(manga, options).alternatives.flatMap((alternative) => (
    alternative.sequenceAgnosticVariants
  )))
);

export const getMangaTitleMergeRangeSequenceAgnosticKeys = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string[] => (
  uniqueValues(getMangaTitleMergeProfile(manga, options).alternatives.flatMap((alternative) => (
    [...alternative.sequenceMarkers].some((marker) => marker.startsWith("range:"))
      ? alternative.sequenceAgnosticVariants
      : []
  )))
);

export const getMangaTitleMergeFuzzyLengths = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): number[] => (
  Array.from(new Set(
    getMangaTitleMergeProfile(manga, options)
      .alternatives
      .flatMap((alternative) => alternative.fuzzyVariants)
      .map((variant) => Array.from(variant).length),
  ))
);

export const getMangaTitleMergeMatchKind = (
  left: MatchableManga,
  right: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): MangaTitleMatchKind | null => (
  doTitleProfilesMatch(
    getMangaTitleMergeProfile(left, options),
    getMangaTitleMergeProfile(right, options),
  )
);

export const canMergeMangaTitles = (
  left: MatchableManga,
  right: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): boolean => (
  getMangaTitleMergeMatchKind(left, right, options) !== null
);

export const getMangaSourceUrlMergeKey = (manga: MatchableManga): string => (
  normalizeScraperViewHistorySourceUrl(manga.sourceUrl)
);

export const getMangaMergeMatchKind = (
  left: MatchableManga,
  right: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): MangaMatchKind | null => {
  const leftSourceUrl = getMangaSourceUrlMergeKey(left);
  if (leftSourceUrl && leftSourceUrl === getMangaSourceUrlMergeKey(right)) {
    return "url";
  }

  return getMangaTitleMergeMatchKind(left, right, options);
};
