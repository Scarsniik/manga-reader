import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { selectPreferredMultiSearchTitleSource } from "@/renderer/components/MultiSearch/multiSearchTitleSelection";
import type { QuickReviewItem, QuickReviewSource } from "@/renderer/components/QuickReview/types";
import type { ScraperRecord, ScraperSearchResultItem } from "@/shared/scraper";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";

const cloneStringList = (values: string[] | undefined): string[] | undefined => (
  values ? [...values] : undefined
);

const cloneSearchResult = (result: ScraperSearchResultItem): ScraperSearchResultItem => ({
  ...result,
  authorUrls: cloneStringList(result.authorUrls),
  authorNames: cloneStringList(result.authorNames),
  sourceNames: cloneStringList(result.sourceNames),
  sourceUrls: cloneStringList(result.sourceUrls),
  tags: cloneStringList(result.tags),
  tagUrls: cloneStringList(result.tagUrls),
  thumbnailCandidates: cloneStringList(result.thumbnailCandidates),
  languageCodes: cloneStringList(result.languageCodes),
});

const buildQuickReviewSource = (
  scraper: ScraperRecord,
  result: ScraperSearchResultItem,
): QuickReviewSource => ({
  scraper,
  result: cloneSearchResult(result),
});

const buildSourceFromMultiSearch = (source: MultiSearchSourceResult): QuickReviewSource => (
  buildQuickReviewSource(source.scraper, source.result)
);

export const buildQuickReviewItemsFromSearchResults = (
  scraper: ScraperRecord,
  results: ScraperSearchResultItem[],
): QuickReviewItem[] => results.map((result, index) => {
  const source = buildQuickReviewSource(scraper, result);
  return {
    id: `search:${scraper.id}:${result.detailUrl || result.title}:${index}`,
    primarySource: source,
    availableSources: [source],
    displayCoverUrl: result.thumbnailUrl,
    displayLanguageCodes: cloneStringList(result.languageCodes),
  };
});

export const buildQuickReviewItemsFromMergedResults = (
  results: MultiSearchMergedResult[],
): QuickReviewItem[] => results.flatMap((result, index) => {
  const primarySource = selectPreferredMultiSearchTitleSource(
    result.sources,
    result.preferredTitleLanguageCodes,
  );
  if (!primarySource) return [];

  return [{
    id: `merged:${result.id}:${index}`,
    primarySource: buildSourceFromMultiSearch(primarySource),
    availableSources: result.sources.map(buildSourceFromMultiSearch),
    displayTitle: result.title,
    displayCoverUrl: result.coverUrl,
    displaySummary: result.summary,
    displayPageCount: result.pageCount,
    displayLanguageCodes: [...result.sourceLanguageCodes],
  }];
});

type DetailsTargetOptions = {
  id: string;
  scraper: ScraperRecord;
  sourceUrl: string;
  title?: string;
  details?: ScraperRuntimeDetailsResult | null;
};

export const buildQuickReviewItemFromDetailsTarget = ({
  id,
  scraper,
  sourceUrl,
  title,
  details,
}: DetailsTargetOptions): QuickReviewItem => {
  const result: ScraperSearchResultItem = {
    title: details?.title || title || sourceUrl,
    detailUrl: details?.finalUrl || details?.requestedUrl || sourceUrl,
    detailsMetadataFetched: Boolean(details),
    detailsSourceUrl: details?.finalUrl || details?.requestedUrl,
    authorUrl: details?.authorUrls[0],
    authorUrls: details ? [...details.authorUrls] : undefined,
    authorNames: details ? [...details.authors] : undefined,
    sourceNames: details ? [...details.sources] : undefined,
    sourceUrls: details ? [...details.sourceUrls] : undefined,
    tags: details ? [...details.tags] : undefined,
    tagUrls: details ? [...details.tagUrls] : undefined,
    thumbnailUrl: details?.cover,
    thumbnailCandidates: details?.coverCandidates ? [...details.coverCandidates] : undefined,
    summary: details?.description,
    pageCount: details?.pageCount,
    languageCodes: details ? [...details.languageCodes] : undefined,
  };
  const source = buildQuickReviewSource(scraper, result);

  return {
    id,
    primarySource: source,
    availableSources: [source],
    displayTitle: result.title,
    displayCoverUrl: result.thumbnailUrl,
    displaySummary: result.summary,
    displayPageCount: result.pageCount,
    displayLanguageCodes: result.languageCodes,
  };
};

export const cloneQuickReviewItems = (items: QuickReviewItem[]): QuickReviewItem[] => (
  items.map((item) => {
    const primaryKey = `${item.primarySource.scraper.id}\u0000${item.primarySource.result.detailUrl || item.primarySource.result.title}`;
    const sources = item.availableSources.map((source) => buildQuickReviewSource(source.scraper, source.result));
    const primarySource = sources.find((source) => (
      `${source.scraper.id}\u0000${source.result.detailUrl || source.result.title}` === primaryKey
    )) ?? buildQuickReviewSource(item.primarySource.scraper, item.primarySource.result);

    return {
      ...item,
      primarySource,
      availableSources: sources,
      displayLanguageCodes: cloneStringList(item.displayLanguageCodes),
    };
  })
);
