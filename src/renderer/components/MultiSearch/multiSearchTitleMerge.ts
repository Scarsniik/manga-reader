import type {
  MultiSearchMergeOptions,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import {
  canMergeMangaTitles,
  getMangaTitleAlternatives,
  getMangaTitleMergeExactKeys,
  getMangaTitleMergeFuzzyLengths,
  getMangaTitleMergeMatchKind,
  getMangaTitleRomanizationTargets,
  type MatchableManga,
  type MangaTitleMatchKind,
} from "@/renderer/utils/mangaMatching/titleProfiles";

export { extractTentativeAuthorNamesFromTitle } from "@/renderer/components/MultiSearch/multiSearchTentativeAuthors";

export type MultiSearchTitleMatchKind = MangaTitleMatchKind;

const getSourceMatchableManga = (source: MultiSearchSourceResult): MatchableManga => {
  return {
    title: source.result.title,
    sourceUrl: source.result.detailUrl,
    authorNames: source.tentativeAuthorNames,
    advancedRomanizedTitleVariants: source.advancedRomanizedTitleVariants,
    advancedRomanizedAuthorNameVariants: source.advancedRomanizedTentativeAuthorNameVariants,
  };
};

export const getMultiSearchTitleAlternatives = (value: string): string[] => (
  getMangaTitleAlternatives(value)
);

export const getMultiSearchTitleRomanizationTargets = (title: string): string[] => (
  getMangaTitleRomanizationTargets(title)
);

export const getMultiSearchTitleMergeExactKeys = (
  source: MultiSearchSourceResult,
  options: MultiSearchMergeOptions,
): string[] => (
  getMangaTitleMergeExactKeys(getSourceMatchableManga(source), options)
);

export const getMultiSearchTitleMergeFuzzyLengths = (
  source: MultiSearchSourceResult,
  options: MultiSearchMergeOptions,
): number[] => (
  getMangaTitleMergeFuzzyLengths(getSourceMatchableManga(source), options)
);

export const canMergeMultiSearchSourceTitles = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
  options: MultiSearchMergeOptions,
): boolean => (
  canMergeMangaTitles(
    getSourceMatchableManga(source),
    getSourceMatchableManga(groupSource),
    options,
  )
);

export const getMultiSearchSourceTitleMergeMatchKind = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
  options: MultiSearchMergeOptions,
): MultiSearchTitleMatchKind | null => (
  getMangaTitleMergeMatchKind(
    getSourceMatchableManga(source),
    getSourceMatchableManga(groupSource),
    options,
  )
);
