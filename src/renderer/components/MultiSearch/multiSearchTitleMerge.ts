import {
  isTitleLanguageMarker,
  stripTitleLanguageMarkers,
} from "@/renderer/utils/languageDetection";
import { getJapaneseRomajiVariants } from "@/renderer/utils/japaneseRomanization";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";

const TENTATIVE_AUTHOR_PREFIX_PATTERN = /^\s*(?:\([^)]*\)\s*)*(?:\[\s*([^\]]+?)\s*]\s*)+/;
const TENTATIVE_AUTHOR_NAME_PATTERN = /\[\s*([^\]]+?)\s*]/g;
const SEQUENCE_MARKER_PATTERN = /^(?:\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const COMPACT_TITLE_MIN_CHARACTERS = 8;
const FUZZY_TITLE_MAX_EDIT_DISTANCE = 1;
const FUZZY_TITLE_MIN_CHARACTERS = 25;
const FUZZY_TITLE_MIN_TOKENS = 5;

type TitleAlternativeMergeProfile = {
  variants: string[];
  variantSet: Set<string>;
  sequenceMarkers: Set<string>;
  fuzzyVariants: string[];
};

type SourceTitleMergeProfile = {
  alternatives: TitleAlternativeMergeProfile[];
  normalizedTentativeAuthorNames: string[];
};

const sourceTitleMergeProfileCache = new WeakMap<MultiSearchSourceResult, SourceTitleMergeProfile>();

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

const normalizeListValue = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const splitTentativeAuthorName = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  Array.from(value).forEach((char) => {
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      return;
    }

    current += char;
  });

  parts.push(current);
  return parts.map(normalizeListValue).filter(Boolean);
};

const collectTentativeAuthorNames = (value: string): string[] => {
  const author = normalizeListValue(value);
  if (!author || isTitleLanguageMarker(author)) {
    return [];
  }

  const splitAuthors = splitTentativeAuthorName(author)
    .filter((splitAuthor) => !isTitleLanguageMarker(splitAuthor));

  return Array.from(new Set([author, ...splitAuthors]));
};

export const extractTentativeAuthorNamesFromTitle = (title: string): string[] => {
  const prefixMatch = title.match(TENTATIVE_AUTHOR_PREFIX_PATTERN);
  if (!prefixMatch) {
    return [];
  }

  const seen = new Set<string>();
  const authors: string[] = [];

  Array.from(prefixMatch[0].matchAll(TENTATIVE_AUTHOR_NAME_PATTERN)).forEach((match) => {
    collectTentativeAuthorNames(match[1]).forEach((author) => {
      const key = author.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      authors.push(author);
    });
  });

  return authors;
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

const getCompactTitleVariant = (value: string): string => {
  const compactValue = value.replace(/\s+/g, "");

  return compactValue !== value && Array.from(compactValue).length >= COMPACT_TITLE_MIN_CHARACTERS
    ? compactValue
    : "";
};

const addCompactTitleVariants = (values: string[]): string[] => (
  uniqueValues([
    ...values,
    ...values.map(getCompactTitleVariant),
  ])
);

const getMergeTitleVariants = (value: string): string[] => (
  addCompactTitleVariants([
    normalizeTitleText(value),
    normalizeTitleText(value, true),
    ...getJapaneseRomajiVariants(value).flatMap((variant) => [
      normalizeTitleText(variant),
      normalizeTitleText(variant, true),
    ]),
  ]).filter(Boolean)
);

const getTitleAlternatives = (value: string): string[] => {
  const alternatives = value
    .split(/[|/]+/g)
    .map((title) => title.trim())
    .filter(Boolean);

  return alternatives.length ? Array.from(new Set(alternatives)) : [value];
};

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

const getNormalizedTentativeAuthorNameVariants = (value: string): string[] => (
  getMergeTitleVariants(value)
);

const normalizeTentativeAuthorNames = (values: string[]): string[] => (
  uniqueValues(values.flatMap(getNormalizedTentativeAuthorNameVariants))
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

const isFuzzyTitleCandidate = (value: string): boolean => {
  const tokens = value.split(" ").filter(Boolean);

  return Array.from(value).length >= FUZZY_TITLE_MIN_CHARACTERS
    && tokens.length >= FUZZY_TITLE_MIN_TOKENS;
};

const hasSingleEditDifference = (left: string, right: string): boolean => {
  if (left === right) {
    return false;
  }

  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  const lengthDifference = Math.abs(leftCharacters.length - rightCharacters.length);
  if (lengthDifference > FUZZY_TITLE_MAX_EDIT_DISTANCE) {
    return false;
  }

  if (leftCharacters.length === rightCharacters.length) {
    let differences = 0;

    for (let index = 0; index < leftCharacters.length; index += 1) {
      if (leftCharacters[index] !== rightCharacters[index]) {
        differences += 1;
      }

      if (differences > FUZZY_TITLE_MAX_EDIT_DISTANCE) {
        return false;
      }
    }

    return differences === FUZZY_TITLE_MAX_EDIT_DISTANCE;
  }

  const shorter = leftCharacters.length < rightCharacters.length ? leftCharacters : rightCharacters;
  const longer = leftCharacters.length < rightCharacters.length ? rightCharacters : leftCharacters;
  let shorterIndex = 0;
  let longerIndex = 0;
  let differences = 0;

  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex += 1;
      longerIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > FUZZY_TITLE_MAX_EDIT_DISTANCE) {
      return false;
    }

    longerIndex += 1;
  }

  return true;
};

const buildTitleAlternativeMergeProfile = (title: string): TitleAlternativeMergeProfile => {
  const variants = getMergeTitleVariants(title);

  return {
    variants,
    variantSet: new Set(variants),
    sequenceMarkers: getTitleSequenceMarkers(title),
    fuzzyVariants: variants.filter(isFuzzyTitleCandidate),
  };
};

const buildSourceTitleMergeProfile = (source: MultiSearchSourceResult): SourceTitleMergeProfile => ({
  alternatives: getTitleAlternatives(source.result.title).map(buildTitleAlternativeMergeProfile),
  normalizedTentativeAuthorNames: normalizeTentativeAuthorNames(source.tentativeAuthorNames),
});

const getSourceTitleMergeProfile = (source: MultiSearchSourceResult): SourceTitleMergeProfile => {
  const cachedProfile = sourceTitleMergeProfileCache.get(source);
  if (cachedProfile) {
    return cachedProfile;
  }

  const profile = buildSourceTitleMergeProfile(source);
  sourceTitleMergeProfileCache.set(source, profile);
  return profile;
};

const doTitleAlternativeProfilesMatch = (
  left: TitleAlternativeMergeProfile,
  right: TitleAlternativeMergeProfile,
  allowFuzzyMatch: boolean,
): boolean => {
  if (hasDifferentSequenceMarkerSets(left.sequenceMarkers, right.sequenceMarkers)) {
    return false;
  }

  if (left.variants.some((leftVariant) => right.variantSet.has(leftVariant))) {
    return true;
  }

  return allowFuzzyMatch && left.fuzzyVariants.some((leftVariant) => (
    right.fuzzyVariants.some((rightVariant) => hasSingleEditDifference(leftVariant, rightVariant))
  ));
};

const doTitleProfilesMatch = (
  left: SourceTitleMergeProfile,
  right: SourceTitleMergeProfile,
): boolean => {
  if (
    haveConflictingNormalizedTentativeAuthors(
      left.normalizedTentativeAuthorNames,
      right.normalizedTentativeAuthorNames,
    )
  ) {
    return false;
  }

  const allowFuzzyMatch = canUseFuzzyTitleProfileMatch(
    left.normalizedTentativeAuthorNames,
    right.normalizedTentativeAuthorNames,
  );

  return left.alternatives.some((leftAlternative) => (
    right.alternatives.some((rightAlternative) => (
      doTitleAlternativeProfilesMatch(leftAlternative, rightAlternative, allowFuzzyMatch)
    ))
  ));
};

export const getMultiSearchTitleMergeExactKeys = (source: MultiSearchSourceResult): string[] => (
  uniqueValues(getSourceTitleMergeProfile(source).alternatives.flatMap((alternative) => alternative.variants))
);

export const getMultiSearchTitleMergeFuzzyLengths = (source: MultiSearchSourceResult): number[] => (
  Array.from(new Set(
    getSourceTitleMergeProfile(source)
      .alternatives
      .flatMap((alternative) => alternative.fuzzyVariants)
      .map((variant) => Array.from(variant).length),
  ))
);

export const canMergeMultiSearchSourceTitles = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
): boolean => {
  return doTitleProfilesMatch(
    getSourceTitleMergeProfile(source),
    getSourceTitleMergeProfile(groupSource),
  );
};
