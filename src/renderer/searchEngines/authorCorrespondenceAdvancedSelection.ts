import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { normalizeCorrespondenceTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import { resolveCompatibleMangaAuthorName } from "@/renderer/utils/mangaMatching/titleProfiles";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";

export type AuthorCorrespondenceAdvancedSeed = {
  key: string;
  anchorSourceKeys: string[];
  result: MultiSearchMergedResult;
  referenceSource: MultiSearchSourceResult;
};

const GENERIC_AUTHOR_PAGE_TITLE_KEYS = new Set([
  "artist",
  "artists",
  "author",
  "authors",
  "cartoonist",
  "cartoonists",
  "creator",
  "creators",
  "illustrator",
  "illustrators",
  "mangaka",
  "漫画家",
  "作家",
  "作者",
  "作品集",
]);

const GENERIC_AUTHOR_PAGE_WORD_KEYS = new Set([
  ...GENERIC_AUTHOR_PAGE_TITLE_KEYS,
  "archive",
  "artwork",
  "artworks",
  "collection",
  "danbooru",
  "dlsite",
  "fanbox",
  "gallery",
  "pixiv",
  "portfolio",
  "profile",
  "voice",
  "work",
  "works",
]);

const removeGenericAuthorPageWords = (value: string): string => (
  normalizeCorrespondenceTitle(value)
    .split(" ")
    .filter((word) => !GENERIC_AUTHOR_PAGE_WORD_KEYS.has(word))
    .join(" ")
);

export const isUsableAuthorCorrespondenceMangaTitle = (
  title: string,
  referenceNames: string[],
): boolean => {
  const normalizedTitle = normalizeCorrespondenceTitle(title);
  if (!normalizedTitle || GENERIC_AUTHOR_PAGE_TITLE_KEYS.has(normalizedTitle)) return false;
  if (resolveCompatibleMangaAuthorName(title, referenceNames)) return false;

  const titleWithoutGenericWords = removeGenericAuthorPageWords(title);
  return Boolean(
    titleWithoutGenericWords
    && !resolveCompatibleMangaAuthorName(titleWithoutGenericWords, referenceNames)
  );
};

export const isUsableAuthorCorrespondenceAutomaticTitle = (title: string): boolean => {
  const normalizedTitle = normalizeCorrespondenceTitle(title);
  if (!normalizedTitle || GENERIC_AUTHOR_PAGE_TITLE_KEYS.has(normalizedTitle)) return false;
  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(title.trim())) return false;
  if (/[^\x00-\x7F]/u.test(normalizedTitle)) return Array.from(normalizedTitle).length >= 4;

  const words = normalizedTitle.split(" ").filter(Boolean);
  return words.length >= 3 || normalizedTitle.replace(/\s+/g, "").length >= 14;
};

const getSourceReferenceNames = (source: MultiSearchSourceResult): string[] => ([
  ...(source.result.authorNames ?? []),
  ...source.tentativeAuthorNames,
  ...(source.contextualAuthorNames ?? []),
]);

export const isUsableAuthorCorrespondenceAdvancedMangaSource = (
  source: MultiSearchSourceResult,
  referenceNames: string[] = [],
): boolean => {
  const analysis = analyzeMangaCorrespondenceTitle(
    source.result.title,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis")),
  );
  const comparableReferenceNames = [...referenceNames, ...getSourceReferenceNames(source)];
  return [analysis.title, ...analysis.alternativeTitles].some((title) => (
    isUsableAuthorCorrespondenceMangaTitle(title, comparableReferenceNames)
  ));
};

const normalizeAdvancedBatchSize = (batchSize: number): number => {
  if (!Number.isFinite(batchSize)) return 1;
  const flooredBatchSize = Math.floor(batchSize);
  if (flooredBatchSize === 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, flooredBatchSize);
};

export const resolveAuthorCorrespondenceAdvancedBatchSize = (options: {
  batchSize: number;
  cachedMangaCount: number;
  requestedBatchCount: number;
  requestedProcessedMangaCount?: number;
}): number => {
  const batchSize = normalizeAdvancedBatchSize(options.batchSize);
  if (batchSize === Number.MAX_SAFE_INTEGER) return batchSize;
  const legacyRequestedMangaCount = Math.max(
    1,
    Math.floor(options.requestedBatchCount),
  ) * batchSize;
  const requestedMangaCount = Math.max(
    0,
    Math.floor(options.requestedProcessedMangaCount ?? legacyRequestedMangaCount),
  );
  return Math.min(
    batchSize,
    Math.max(0, requestedMangaCount - Math.max(0, options.cachedMangaCount)),
  );
};

export const selectAuthorCorrespondenceAdvancedSeeds = (
  results: MultiSearchMergedResult[],
  authorSourceKeys: Set<string>,
  processedMangaKeys: Set<string>,
  batchSize: number,
  isReferenceSourceEligible: (source: MultiSearchSourceResult) => boolean = () => true,
): AuthorCorrespondenceAdvancedSeed[] => results.flatMap((result) => {
  const anchorSourceKeys = result.sources
    .map(buildMultiSearchSourceIdentityKey)
    .filter((sourceKey) => authorSourceKeys.has(sourceKey))
    .sort();
  const key = anchorSourceKeys[0];
  const referenceSource = result.sources.find((source) => (
    source.canOpenDetails && Boolean(source.result.detailUrl?.trim())
    && isReferenceSourceEligible(source)
  ));
  const alreadyProcessed = anchorSourceKeys.some((sourceKey) => processedMangaKeys.has(sourceKey));
  return key && referenceSource && !alreadyProcessed
    ? [{ key, anchorSourceKeys, result, referenceSource }]
    : [];
}).slice(0, normalizeAdvancedBatchSize(batchSize));
