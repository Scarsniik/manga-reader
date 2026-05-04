import {
  FetchScraperDocumentResult,
  hasScraperFieldSelectorValue,
  ScraperAuthorFeatureConfig,
  ScraperRecord,
  ScraperSearchFeatureConfig,
} from "@/shared/scraper";
import {
  extractScraperSearchPageFromDocument,
  getScraperFeature,
  getScraperAuthorFeatureConfig,
  getScraperSearchFeatureConfig,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  resolveScraperAuthorTargetUrl,
  ScraperRuntimeSearchPageResult,
} from "@/renderer/utils/scraperRuntime";
import {
  canOpenScraperDetails,
  detectLanguageCodesFromTitle,
  extractTentativeAuthorNamesFromTitle,
  getScraperContentTypes,
  getScraperSourceLanguages,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchPaceMode,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { ScraperTemplateContext } from "@/renderer/utils/scraperTemplateContext";

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
  if (
    !searchConfig?.urlTemplate
    || !searchConfig.resultItemSelector
    || !hasScraperFieldSelectorValue(searchConfig.titleSelector)
  ) {
    throw new Error("Le composant Recherche n'est pas suffisamment configure.");
  }

  return searchConfig;
};

export const getAuthorConfig = (scraper: ScraperRecord): ScraperAuthorFeatureConfig => {
  const authorConfig = getScraperAuthorFeatureConfig(getScraperFeature(scraper, "author"));
  if (
    !authorConfig?.resultItemSelector
    || !hasScraperFieldSelectorValue(authorConfig.titleSelector)
  ) {
    throw new Error("Le composant Auteur n'est pas suffisamment configure.");
  }

  return authorConfig;
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

const fetchAuthorPage = async (
  scraper: ScraperRecord,
  authorConfig: ScraperAuthorFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
  templateContext?: ScraperTemplateContext | null,
): Promise<ScraperRuntimeSearchPageResult> => {
  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const usesTemplatePaging = hasAuthorPagePlaceholder(authorConfig);
  const targetUrl = usesTemplatePaging || pageIndex === 0
    ? resolveScraperAuthorTargetUrl(scraper.baseUrl, authorConfig, query, {
      pageIndex,
      templateContext: templateContext ?? undefined,
    })
    : nextPageUrl;

  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  const documentResult = await fetchScraperDocument({
    baseUrl: scraper.baseUrl,
    targetUrl,
  }) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La page auteur a repondu avec le code HTTP ${documentResult.status}.`
        : "Impossible de charger la page auteur."),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  return extractScraperSearchPageFromDocument(documentNode, authorConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  });
};

export const fetchAuthorPageWithRetry = async (
  scraper: ScraperRecord,
  authorConfig: ScraperAuthorFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
  templateContext?: ScraperTemplateContext | null,
): Promise<ScraperRuntimeSearchPageResult> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= paceConfig.retryCount; attempt += 1) {
    try {
      if (attempt > 0 || pageIndex > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      return await fetchAuthorPage(
        scraper,
        authorConfig,
        query,
        pageIndex,
        nextPageUrl,
        templateContext,
      );
    } catch (error) {
      lastError = error;
      if (attempt < paceConfig.retryCount) {
        await wait(paceConfig.pageDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Impossible de charger la page auteur.");
};

export const buildSourceResults = (
  scraper: ScraperRecord,
  page: ScraperRuntimeSearchPageResult,
  pageIndex: number,
  searchTerm: string,
): MultiSearchSourceResult[] => {
  const scraperLanguageCodes = getScraperSourceLanguages(scraper);
  const contentTypes = getScraperContentTypes(scraper);
  const canOpenDetails = canOpenScraperDetails(scraper);

  return page.items.map((result) => {
    const configuredLanguageCodes = result.languageCodes ?? [];
    const detectedLanguageCodes = configuredLanguageCodes.length
      ? configuredLanguageCodes
      : detectLanguageCodesFromTitle(result.title);
    const fallbackLanguageCodes = scraperLanguageCodes.length === 1 ? scraperLanguageCodes : [];
    const tentativeAuthorNames = extractTentativeAuthorNamesFromTitle(result.title);

    return {
      scraper,
      result,
      searchTerm,
      pageIndex,
      sourceLanguageCodes: detectedLanguageCodes.length
        ? detectedLanguageCodes
        : fallbackLanguageCodes,
      detectedLanguageCodes,
      tentativeAuthorNames,
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
    ? hasScraperFieldSelectorValue(searchConfig.nextPageSelector)
      ? Boolean(page.nextPageUrl)
      : page.items.length > 0
    : Boolean(page.nextPageUrl)
);

export const resolveHasNextAuthorPage = (
  authorConfig: ScraperAuthorFeatureConfig,
  page: ScraperRuntimeSearchPageResult,
): boolean => (
  hasAuthorPagePlaceholder(authorConfig)
    ? hasScraperFieldSelectorValue(authorConfig.nextPageSelector)
      ? Boolean(page.nextPageUrl)
      : page.items.length > 0
    : Boolean(page.nextPageUrl)
);
