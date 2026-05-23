import { stripTitleLanguageMarkers } from "@/renderer/utils/languageDetection";
import {
  buildVariantKindSets,
  getMergeTitleVariants,
  getRomanizationMatchLevel,
  type RomanizationMatchLevel,
  type TitleMergeVariant,
  type TitleMergeVariantKind,
} from "@/renderer/components/MultiSearch/multiSearchTitleMergeVariants";
import {
  hasSingleEditDifference,
  isFuzzyTitleCandidate,
} from "@/renderer/components/MultiSearch/multiSearchTitleMergeFuzzy";
import { getLooseRomajiPhoneticKey } from "@/renderer/components/MultiSearch/multiSearchRomajiPhonetic";
import type {
  MultiSearchMergeOptions,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
export { extractTentativeAuthorNamesFromTitle } from "@/renderer/components/MultiSearch/multiSearchTentativeAuthors";

const SEQUENCE_MARKER_PATTERN = /^(?:\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

export type MultiSearchTitleMatchKind = "base" | RomanizationMatchLevel;

type TitleAlternativeMergeProfile = {
  variants: string[];
  variantKindSets: Map<string, Set<TitleMergeVariantKind>>;
  sequenceMarkers: Set<string>;
  fuzzyVariants: string[];
};

type SourceTitleMergeProfile = {
  alternatives: TitleAlternativeMergeProfile[];
  normalizedTentativeAuthorNames: string[];
};

const sourceTitleMergeProfileCache = new WeakMap<MultiSearchSourceResult, Map<string, SourceTitleMergeProfile>>();

const DEFAULT_TITLE_MERGE_OPTIONS: MultiSearchMergeOptions = {
  enableRomajiPhoneticMerge: false,
};

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
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
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

export const getMultiSearchTitleAlternatives = (value: string): string[] => {
  const alternatives = value
    .split(/[|/]+/g)
    .map((title) => title.trim())
    .filter(Boolean);

  return alternatives.length ? Array.from(new Set(alternatives)) : [value];
};

export const getMultiSearchTitleRomanizationTargets = (title: string): string[] => (
  uniqueValues(getMultiSearchTitleAlternatives(title).flatMap((alternative) => [
    normalizeTitleText(alternative),
    normalizeTitleText(alternative, true),
  ]))
);

const getSourceTitleAlternativeTargets = (title: string): string[] => (
  uniqueValues([
    ...getMultiSearchTitleAlternatives(title),
    ...getMultiSearchTitleRomanizationTargets(title),
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

const getNormalizedTentativeAuthorNameVariants = (
  value: string,
  advancedRomanizedVariants: string[] = [],
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
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

const normalizeTentativeAuthorNames = (
  values: string[],
  advancedRomanizedVariants: string[] = [],
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): string[] => (
  uniqueValues([
    ...values.flatMap((value) => getNormalizedTentativeAuthorNameVariants(value, [], options)),
    ...advancedRomanizedVariants.flatMap((value) => (
      getNormalizedTentativeAuthorNameVariants(value, [value], options)
    )),
  ])
);

const haveConflictingNormalizedTentativeAuthors = (
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
  source: MultiSearchSourceResult,
  advancedRomanizedVariants: string[] = [],
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
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

const buildSourceTitleMergeProfile = (
  source: MultiSearchSourceResult,
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): SourceTitleMergeProfile => {
  const alternatives = [
    ...getSourceTitleAlternativeTargets(source.result.title).map((title) => (
      buildTitleAlternativeMergeProfile(title, source, [], options)
    )),
    ...(source.advancedRomanizedTitleVariants ?? []).map((title) => (
      buildTitleAlternativeMergeProfile(title, source, [title], options)
    )),
  ];

  return {
    alternatives,
    normalizedTentativeAuthorNames: normalizeTentativeAuthorNames(
      source.tentativeAuthorNames,
      source.advancedRomanizedTentativeAuthorNameVariants ?? [],
      options,
    ),
  };
};

const getTitleMergeOptionsCacheKey = (options: MultiSearchMergeOptions): string => (
  options.enableRomajiPhoneticMerge ? "phonetic" : "standard"
);

const getSourceTitleMergeProfile = (
  source: MultiSearchSourceResult,
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): SourceTitleMergeProfile => {
  const cacheKey = getTitleMergeOptionsCacheKey(options);
  const cachedProfiles = sourceTitleMergeProfileCache.get(source);
  const cachedProfile = cachedProfiles?.get(cacheKey);
  if (cachedProfile) {
    return cachedProfile;
  }

  const profile = buildSourceTitleMergeProfile(source, options);
  if (cachedProfiles) {
    cachedProfiles.set(cacheKey, profile);
  } else {
    sourceTitleMergeProfileCache.set(source, new Map([[cacheKey, profile]]));
  }

  return profile;
};

const doTitleAlternativeProfilesMatch = (
  left: TitleAlternativeMergeProfile,
  right: TitleAlternativeMergeProfile,
  allowFuzzyMatch: boolean,
): MultiSearchTitleMatchKind | null => {
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
  left: SourceTitleMergeProfile,
  right: SourceTitleMergeProfile,
): MultiSearchTitleMatchKind | null => {
  if (
    haveConflictingNormalizedTentativeAuthors(
      left.normalizedTentativeAuthorNames,
      right.normalizedTentativeAuthorNames,
    )
  ) {
    return null;
  }

  const allowFuzzyMatch = canUseFuzzyTitleProfileMatch(
    left.normalizedTentativeAuthorNames,
    right.normalizedTentativeAuthorNames,
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

export const getMultiSearchTitleMergeExactKeys = (
  source: MultiSearchSourceResult,
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): string[] => (
  uniqueValues(getSourceTitleMergeProfile(source, options).alternatives.flatMap((alternative) => alternative.variants))
);

export const getMultiSearchTitleMergeFuzzyLengths = (
  source: MultiSearchSourceResult,
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): number[] => (
  Array.from(new Set(
    getSourceTitleMergeProfile(source, options)
      .alternatives
      .flatMap((alternative) => alternative.fuzzyVariants)
      .map((variant) => Array.from(variant).length),
  ))
);

export const canMergeMultiSearchSourceTitles = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): boolean => {
  return getMultiSearchSourceTitleMergeMatchKind(source, groupSource, options) !== null;
};

export const getMultiSearchSourceTitleMergeMatchKind = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
  options: MultiSearchMergeOptions = DEFAULT_TITLE_MERGE_OPTIONS,
): MultiSearchTitleMatchKind | null => {
  return doTitleProfilesMatch(
    getSourceTitleMergeProfile(source, options),
    getSourceTitleMergeProfile(groupSource, options),
  );
};
