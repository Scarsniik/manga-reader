import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import { stripTitleLanguageMarkers } from "@/renderer/utils/languageDetection";
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

const SEQUENCE_MARKER_PATTERN = /^(?:\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

export type MangaMergeOptions = {
  enableRomajiPhoneticMerge: boolean;
};

export type MatchableManga = {
  title: string;
  sourceUrl?: string | null;
  authorNames?: string[];
  advancedRomanizedTitleVariants?: string[];
  advancedRomanizedAuthorNameVariants?: string[];
};

export type MangaTitleMatchKind = "base" | RomanizationMatchLevel;
export type MangaMatchKind = "url" | MangaTitleMatchKind;

type TitleAlternativeMergeProfile = {
  variants: string[];
  variantKindSets: Map<string, Set<TitleMergeVariantKind>>;
  sequenceMarkers: Set<string>;
  fuzzyVariants: string[];
};

type MangaTitleMergeProfile = {
  alternatives: TitleAlternativeMergeProfile[];
  normalizedAuthorNames: string[];
};

const mangaTitleMergeProfileCache = new WeakMap<MatchableManga, Map<string, MangaTitleMergeProfile>>();
const mangaTitleMergeProfileValueCache = new Map<string, MangaTitleMergeProfile>();
const MAX_MANGA_TITLE_PROFILE_VALUE_CACHE_SIZE = 5000;

export const DEFAULT_MANGA_MERGE_OPTIONS: MangaMergeOptions = {
  enableRomajiPhoneticMerge: false,
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

const normalizeTitleText = (value: string, removeParentheses = false): string => (
  stripTitleLanguageMarkers(value)
    .replace(/(?:\[[^\]]*]|\{[^}]*})/g, " ")
    .replace(removeParentheses ? /\([^)]*\)/g : /$^/g, " ")
    .normalize("NFKC")
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
    .split(/[|/]+/g)
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

const getMangaTitleAlternativeTargets = (title: string): string[] => (
  uniqueValues([
    ...getMangaTitleAlternatives(title),
    ...getMangaTitleRomanizationTargets(title),
  ])
);

const getTitleSequenceMarkers = (value: string): Set<string> => (
  new Set(normalizeTitleText(value).split(" ").filter((token) => SEQUENCE_MARKER_PATTERN.test(token)))
);

const hasDifferentSequenceMarkerSets = (
  leftMarkers: Set<string>,
  rightMarkers: Set<string>,
): boolean => (
  [...leftMarkers].some((marker) => !rightMarkers.has(marker))
  || [...rightMarkers].some((marker) => !leftMarkers.has(marker))
);

const getNormalizedAuthorNameVariants = (
  value: string,
  advancedRomanizedVariants: string[] = [],
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string[] => (
  uniqueValues(
    getMergeTitleVariants(
      value,
      (variantValue, kind) => normalizeTitleVariant(variantValue, kind, options),
      advancedRomanizedVariants,
    )
      .map((variant) => variant.value),
  )
);

const normalizeAuthorNames = (
  values: string[],
  advancedRomanizedVariants: string[] = [],
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string[] => (
  uniqueValues([
    ...values.flatMap((value) => getNormalizedAuthorNameVariants(value, [], options)),
    ...advancedRomanizedVariants.flatMap((value) => (
      getNormalizedAuthorNameVariants(value, [value], options)
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

const buildTitleAlternativeMergeProfile = (
  title: string,
  advancedRomanizedVariants: string[] = [],
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): TitleAlternativeMergeProfile => {
  const variantEntries = getMergeTitleVariants(
    title,
    (value, kind) => normalizeTitleVariant(value, kind, options),
    advancedRomanizedVariants,
  );
  const variants = uniqueValues(variantEntries.map((variant) => variant.value));

  return {
    variants,
    variantKindSets: buildVariantKindSets(variantEntries),
    sequenceMarkers: getTitleSequenceMarkers(title),
    fuzzyVariants: variants.filter(isFuzzyTitleCandidate),
  };
};

const buildMangaTitleMergeProfile = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): MangaTitleMergeProfile => {
  const alternatives = [
    ...getMangaTitleAlternativeTargets(manga.title).map((title) => (
      buildTitleAlternativeMergeProfile(title, [], options)
    )),
    ...(manga.advancedRomanizedTitleVariants ?? []).map((title) => (
      buildTitleAlternativeMergeProfile(title, [title], options)
    )),
  ];

  return {
    alternatives,
    normalizedAuthorNames: normalizeAuthorNames(
      manga.authorNames ?? [],
      manga.advancedRomanizedAuthorNameVariants ?? [],
      options,
    ),
  };
};

const getTitleMergeOptionsCacheKey = (options: MangaMergeOptions): string => (
  options.enableRomajiPhoneticMerge ? "phonetic" : "standard"
);

const getMangaTitleMergeProfileValueCacheKey = (
  manga: MatchableManga,
  options: MangaMergeOptions = DEFAULT_MANGA_MERGE_OPTIONS,
): string => (
  JSON.stringify([
    getTitleMergeOptionsCacheKey(options),
    manga.title,
    manga.authorNames ?? [],
    manga.advancedRomanizedTitleVariants ?? [],
    manga.advancedRomanizedAuthorNameVariants ?? [],
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

const doTitleAlternativeProfilesMatch = (
  left: TitleAlternativeMergeProfile,
  right: TitleAlternativeMergeProfile,
  allowFuzzyMatch: boolean,
): MangaTitleMatchKind | null => {
  if (hasDifferentSequenceMarkerSets(left.sequenceMarkers, right.sequenceMarkers)) {
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

  return null;
};

const doTitleProfilesMatch = (
  left: MangaTitleMergeProfile,
  right: MangaTitleMergeProfile,
): MangaTitleMatchKind | null => {
  if (
    haveConflictingNormalizedAuthors(
      left.normalizedAuthorNames,
      right.normalizedAuthorNames,
    )
  ) {
    return null;
  }

  const allowFuzzyMatch = canUseFuzzyTitleProfileMatch(
    left.normalizedAuthorNames,
    right.normalizedAuthorNames,
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
