import {
  isTitleLanguageMarker,
  stripTitleLanguageMarkers,
} from "@/renderer/utils/languageDetection";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";

const TENTATIVE_AUTHOR_PREFIX_PATTERN = /^\s*(?:\([^)]*\)\s*)*(?:\[\s*([^\]]+?)\s*]\s*)+/;
const TENTATIVE_AUTHOR_NAME_PATTERN = /\[\s*([^\]]+?)\s*]/g;
const SEQUENCE_MARKER_PATTERN = /^(?:\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const FUZZY_TITLE_MAX_EDIT_DISTANCE = 1;
const FUZZY_TITLE_MIN_CHARACTERS = 25;
const FUZZY_TITLE_MIN_TOKENS = 5;

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
);

const getMergeTitleVariants = (value: string): string[] => (
  Array.from(new Set([
    normalizeTitleText(value),
    normalizeTitleText(value, true),
  ])).filter(Boolean)
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

const hasDifferentSequenceMarkers = (left: string, right: string): boolean => {
  const leftMarkers = getTitleSequenceMarkers(left);
  const rightMarkers = getTitleSequenceMarkers(right);

  return [...leftMarkers].some((marker) => !rightMarkers.has(marker))
    || [...rightMarkers].some((marker) => !leftMarkers.has(marker));
};

const normalizeTentativeAuthorName = (value: string): string => (
  normalizeTitleText(value)
);

const normalizeTentativeAuthorNames = (values: string[]): string[] => (
  values.map(normalizeTentativeAuthorName).filter(Boolean)
);

const haveConflictingTentativeAuthors = (
  leftAuthors: string[],
  rightAuthors: string[],
): boolean => {
  const leftValues = normalizeTentativeAuthorNames(leftAuthors);
  const rightValues = normalizeTentativeAuthorNames(rightAuthors);
  if (!leftValues.length || !rightValues.length) {
    return false;
  }

  const rightSet = new Set(rightValues);
  return leftValues.every((author) => !rightSet.has(author));
};

const canUseFuzzyTitleMatch = (
  leftAuthors: string[],
  rightAuthors: string[],
): boolean => {
  const leftValues = normalizeTentativeAuthorNames(leftAuthors);
  const rightValues = normalizeTentativeAuthorNames(rightAuthors);
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

const areFuzzyTitleVariantsMatching = (left: string, right: string): boolean => (
  isFuzzyTitleCandidate(left)
  && isFuzzyTitleCandidate(right)
  && hasSingleEditDifference(left, right)
);

const doTitleAlternativesMatch = (
  left: string,
  right: string,
  allowFuzzyMatch = false,
): boolean => {
  return getTitleAlternatives(left).some((leftAlternative) => (
    getTitleAlternatives(right).some((rightAlternative) => {
      if (hasDifferentSequenceMarkers(leftAlternative, rightAlternative)) {
        return false;
      }

      const leftVariants = getMergeTitleVariants(leftAlternative);
      const rightVariants = getMergeTitleVariants(rightAlternative);
      const rightVariantSet = new Set(rightVariants);
      if (leftVariants.some((leftVariant) => rightVariantSet.has(leftVariant))) {
        return true;
      }

      return allowFuzzyMatch && leftVariants.some((leftVariant) => (
        rightVariants.some((rightVariant) => areFuzzyTitleVariantsMatching(leftVariant, rightVariant))
      ));
    })
  ));
};

export const canMergeMultiSearchSourceTitles = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
): boolean => {
  if (haveConflictingTentativeAuthors(source.tentativeAuthorNames, groupSource.tentativeAuthorNames)) {
    return false;
  }

  return doTitleAlternativesMatch(
    source.result.title,
    groupSource.result.title,
    canUseFuzzyTitleMatch(source.tentativeAuthorNames, groupSource.tentativeAuthorNames),
  );
};
