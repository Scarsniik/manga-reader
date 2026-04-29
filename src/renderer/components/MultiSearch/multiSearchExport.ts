import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";

type MultiSearchExportOptions = {
  query: string;
  viewMode: MultiSearchViewMode;
  runs: MultiSearchScraperRun[];
  mergedResults: MultiSearchMergedResult[];
  sourceCount: number;
};

const buildScraperSnapshot = (source: MultiSearchSourceResult) => ({
  id: source.scraper.id,
  name: source.scraper.name,
  baseUrl: source.scraper.baseUrl,
  sourceLanguages: source.scraper.globalConfig.sourceLanguages,
  contentTypes: source.scraper.globalConfig.contentTypes,
});

const buildSourceSnapshot = (source: MultiSearchSourceResult) => ({
  scraper: buildScraperSnapshot(source),
  searchTerm: source.searchTerm,
  pageIndex: source.pageIndex,
  sourceLanguageCodes: source.sourceLanguageCodes,
  detectedLanguageCodes: source.detectedLanguageCodes,
  tentativeAuthorNames: source.tentativeAuthorNames,
  contentTypes: source.contentTypes,
  canOpenDetails: source.canOpenDetails,
  result: {
    title: source.result.title,
    detailUrl: source.result.detailUrl,
    authorUrl: source.result.authorUrl,
    thumbnailUrl: source.result.thumbnailUrl,
    summary: source.result.summary,
    pageCount: source.result.pageCount,
  },
});

export const buildMultiSearchExportPayload = ({
  query,
  viewMode,
  runs,
  mergedResults,
  sourceCount,
}: MultiSearchExportOptions) => ({
  exportedAt: new Date().toISOString(),
  query,
  viewMode,
  mergeStrategy: "strict-title-alternatives",
  counts: {
    scrapers: runs.length,
    sources: sourceCount,
    mergedCards: mergedResults.length,
  },
  runs: runs.map((run) => ({
    scraper: {
      id: run.scraper.id,
      name: run.scraper.name,
      baseUrl: run.scraper.baseUrl,
      sourceLanguages: run.scraper.globalConfig.sourceLanguages,
      contentTypes: run.scraper.globalConfig.contentTypes,
    },
    status: run.status,
    error: run.error,
    loadedPages: run.loadedPages,
    hasNextPage: run.hasNextPage,
    currentPageUrl: run.currentPageUrl,
    nextPageUrl: run.nextPageUrl,
    searchTerms: run.searchTerms,
    results: run.results.map(buildSourceSnapshot),
  })),
  mergedResults: mergedResults.map((result) => ({
    id: result.id,
    title: result.title,
    coverUrl: result.coverUrl,
    summary: result.summary,
    pageCount: result.pageCount,
    sourceLanguageCodes: result.sourceLanguageCodes,
    tentativeAuthorNames: result.tentativeAuthorNames,
    contentTypes: result.contentTypes,
    sourceCount: result.sources.length,
    sources: result.sources.map(buildSourceSnapshot),
  })),
});

export const buildMultiSearchMergedResultsExportPayload = (
  mergedResults: MultiSearchMergedResult[],
) => ({
  exportedAt: new Date().toISOString(),
  mergeStrategy: "strict-title-alternatives",
  counts: {
    mergedCards: mergedResults.length,
    sources: mergedResults.reduce((count, result) => count + result.sources.length, 0),
  },
  mergedResults: mergedResults.map((result) => ({
    id: result.id,
    title: result.title,
    coverUrl: result.coverUrl,
    summary: result.summary,
    pageCount: result.pageCount,
    sourceLanguageCodes: result.sourceLanguageCodes,
    tentativeAuthorNames: result.tentativeAuthorNames,
    contentTypes: result.contentTypes,
    sourceCount: result.sources.length,
    sources: result.sources.map(buildSourceSnapshot),
  })),
});
