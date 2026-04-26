import {
  FetchScraperDocumentResult,
  ScraperRecord,
  ScraperSearchFeatureConfig,
} from "@/shared/scraper";
import {
  extractScraperSearchPageFromDocument,
  getScraperFeature,
  getScraperSearchFeatureConfig,
  hasSearchPagePlaceholder,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  ScraperRuntimeSearchPageResult,
} from "@/renderer/utils/scraperRuntime";
import {
  canOpenScraperDetails,
  detectLanguageCodesFromTitle,
  getScraperContentTypes,
  getScraperSourceLanguages,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchPaceMode,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

export type PaceConfig = {
  concurrency: number;
  pageDelayMs: number;
  retryCount: number;
};

export const getPaceConfig = (paceMode: MultiSearchPaceMode): PaceConfig => (
  paceMode === "careful"
    ? {
      concurrency: 2,
      pageDelayMs: 650,
      retryCount: 1,
    }
    : {
      concurrency: 4,
      pageDelayMs: 0,
      retryCount: 0,
    }
);

const wait = (delayMs: number): Promise<void> => (
  delayMs > 0
    ? new Promise((resolve) => window.setTimeout(resolve, delayMs))
    : Promise.resolve()
);

export const runWithConcurrency = async (
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> => {
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), tasks.length) },
    async () => {
      while (nextIndex < tasks.length) {
        const taskIndex = nextIndex;
        nextIndex += 1;
        await tasks[taskIndex]();
      }
    },
  );

  await Promise.all(workers);
};

export const getSearchConfig = (scraper: ScraperRecord): ScraperSearchFeatureConfig => {
  const searchConfig = getScraperSearchFeatureConfig(getScraperFeature(scraper, "search"));
  if (!searchConfig?.urlTemplate || !searchConfig.resultItemSelector || !searchConfig.titleSelector) {
    throw new Error("Le composant Recherche n'est pas suffisamment configure.");
  }

  return searchConfig;
};

const fetchSearchPage = async (
  scraper: ScraperRecord,
  searchConfig: ScraperSearchFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
): Promise<ScraperRuntimeSearchPageResult> => {
  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const usesTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const targetUrl = usesTemplatePaging || pageIndex === 0
    ? resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig, query, { pageIndex })
    : nextPageUrl;

  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  const documentResult = await fetchScraperDocument({
    baseUrl: scraper.baseUrl,
    targetUrl,
    requestConfig: resolveScraperSearchRequestConfig(searchConfig, query, { pageIndex }),
  }) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La recherche a repondu avec le code HTTP ${documentResult.status}.`
        : "Impossible de charger la page de recherche."),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  return extractScraperSearchPageFromDocument(documentNode, searchConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  });
};

export const fetchSearchPageWithRetry = async (
  scraper: ScraperRecord,
  searchConfig: ScraperSearchFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
): Promise<ScraperRuntimeSearchPageResult> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= paceConfig.retryCount; attempt += 1) {
    try {
      if (attempt > 0 || pageIndex > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      return await fetchSearchPage(scraper, searchConfig, query, pageIndex, nextPageUrl);
    } catch (error) {
      lastError = error;
      if (attempt < paceConfig.retryCount) {
        await wait(paceConfig.pageDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Impossible de charger la page de recherche.");
};

export const buildSourceResults = (
  scraper: ScraperRecord,
  page: ScraperRuntimeSearchPageResult,
  pageIndex: number,
): MultiSearchSourceResult[] => {
  const scraperLanguageCodes = getScraperSourceLanguages(scraper);
  const contentTypes = getScraperContentTypes(scraper);
  const canOpenDetails = canOpenScraperDetails(scraper);

  return page.items.map((result) => {
    const detectedLanguageCodes = detectLanguageCodesFromTitle(result.title);
    const fallbackLanguageCodes = scraperLanguageCodes.length === 1 ? scraperLanguageCodes : [];

    return {
      scraper,
      result,
      pageIndex,
      sourceLanguageCodes: detectedLanguageCodes.length
        ? detectedLanguageCodes
        : fallbackLanguageCodes,
      detectedLanguageCodes,
      contentTypes,
      canOpenDetails,
    };
  });
};

export const resolveHasNextPage = (
  searchConfig: ScraperSearchFeatureConfig,
  page: ScraperRuntimeSearchPageResult,
): boolean => (
  hasSearchPagePlaceholder(searchConfig)
    ? searchConfig.nextPageSelector
      ? Boolean(page.nextPageUrl)
      : page.items.length > 0
    : Boolean(page.nextPageUrl)
);
