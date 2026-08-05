import {
  FetchScraperDocumentResult,
  hasScraperFieldSelectorValue,
  ScraperAuthorFeatureConfig,
  ScraperCardListConfig,
  ScraperHomepageFeatureConfig,
  ScraperRecord,
  ScraperRequestConfig,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
  ScraperTagFeatureConfig,
} from "@/shared/scraper";
import {
  extractScraperSearchPageFromDocumentWithImageFallbacks,
  enrichScraperSearchPageWithDetails,
  getScraperFeature,
  getScraperAuthorFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperHomepageFeatureConfig,
  getScraperSearchFeatureConfig,
  getScraperTagFeatureConfig,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  hasTagPagePlaceholder,
  isScraperListingPaginationEndError,
  resolveScraperHomepageRequestConfig,
  resolveScraperHomepageTargetUrl,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  resolveScraperAuthorTargetUrl,
  resolveScraperTagTargetUrl,
  type ScraperDocumentFetcher,
  ScraperRuntimeSearchPageResult,
  throwIfScraperListingPaginationEnded,
  throwIfScraperListingNextPageUnavailable,
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
import type { ScraperRequestDiagnosticContext } from "@/shared/scraperLatestDiagnostics";
import { appendScraperLatestDiagnosticEvent } from "@/renderer/utils/scraperLatestDiagnostics";

export type PaceConfig = {
  concurrency: number;
  pageDelayMs: number;
  retryCount: number;
};

export type ScraperCardDetailsFetchOptions = {
  scrapeDetailsWithCards?: boolean;
  detailConcurrency?: number;
  diagnostics?: ScraperRequestDiagnosticContext;
};

const attachRequestDiagnostics = <Request extends Record<string, unknown>>(
  request: Request,
  diagnostics?: ScraperRequestDiagnosticContext,
  purpose?: string,
): Request & { diagnostics?: ScraperRequestDiagnosticContext } => ({
  ...request,
  ...(diagnostics
    ? {
      diagnostics: {
        ...diagnostics,
        purpose: purpose ?? diagnostics.purpose,
      },
    }
    : {}),
});

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

const fetchPageWithRetry = async (
  pageIndex: number,
  paceConfig: PaceConfig,
  loadPage: () => Promise<ScraperRuntimeSearchPageResult>,
  failureMessage: string,
  diagnostics?: ScraperRequestDiagnosticContext,
): Promise<ScraperRuntimeSearchPageResult> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= paceConfig.retryCount; attempt += 1) {
    try {
      if (attempt > 0 || pageIndex > 0) {
        appendScraperLatestDiagnosticEvent(
          diagnostics ? { profileId: diagnostics.profileId } : null,
          "pace.wait",
          {
            pageIndex,
            attempt,
            delayMs: paceConfig.pageDelayMs,
            reason: attempt > 0 ? "retry-before-attempt" : "page-pacing",
          },
          diagnostics?.sourceKey,
        );
        await wait(paceConfig.pageDelayMs);
      }

      return await loadPage();
    } catch (error) {
      if (isScraperListingPaginationEndError(error)) {
        throw error;
      }

      lastError = error;
      if (attempt < paceConfig.retryCount) {
        appendScraperLatestDiagnosticEvent(
          diagnostics ? { profileId: diagnostics.profileId } : null,
          "pace.wait",
          {
            pageIndex,
            attempt,
            delayMs: paceConfig.pageDelayMs,
            reason: "retry-after-failure",
          },
          diagnostics?.sourceKey,
        );
        await wait(paceConfig.pageDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(failureMessage);
};

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

export const getHomepageConfig = (scraper: ScraperRecord): ScraperHomepageFeatureConfig => {
  const homepageConfig = getScraperHomepageFeatureConfig(getScraperFeature(scraper, "homepage"));
  if (
    !homepageConfig?.urlTemplate
    || !homepageConfig.resultItemSelector
    || !hasScraperFieldSelectorValue(homepageConfig.titleSelector)
  ) {
    throw new Error("Le composant Homepage n'est pas suffisamment configure.");
  }

  return homepageConfig;
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

export const getTagConfig = (scraper: ScraperRecord): ScraperTagFeatureConfig => {
  const tagConfig = getScraperTagFeatureConfig(getScraperFeature(scraper, "tag"));
  if (
    !tagConfig?.resultItemSelector
    || !hasScraperFieldSelectorValue(tagConfig.titleSelector)
  ) {
    throw new Error("Le composant Tag n'est pas suffisamment configure.");
  }

  return tagConfig;
};

const enrichListingPageWithDetails = (
  scraper: ScraperRecord,
  page: ScraperRuntimeSearchPageResult,
  fetchScraperDocument: ScraperDocumentFetcher,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => (
  enrichScraperSearchPageWithDetails(page, {
    enabled: options?.scrapeDetailsWithCards === true,
    scraper,
    detailsConfig: getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details")),
    fetchDocument: fetchScraperDocument,
    concurrency: options?.detailConcurrency,
  })
);

const fetchSearchPage = async (
  scraper: ScraperRecord,
  searchConfig: ScraperSearchFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => {
  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const usesTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const targetUrl = usesTemplatePaging || pageIndex === 0
    ? resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig, query, { pageIndex })
    : nextPageUrl;

  throwIfScraperListingNextPageUnavailable({ pageIndex, usesTemplatePaging, nextPageUrl });
  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  const documentResult = await fetchScraperDocument(attachRequestDiagnostics({
    baseUrl: scraper.baseUrl,
    targetUrl,
    requestConfig: resolveScraperSearchRequestConfig(searchConfig, query, { pageIndex }),
  }, options?.diagnostics)) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    throwIfScraperListingPaginationEnded(documentResult, {
      pageIndex,
      targetUrl,
      usesTemplatePaging,
    });

    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La recherche a repondu avec le code HTTP ${documentResult.status}.`
        : "Impossible de charger la page de recherche."),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, searchConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  }, async (request) => fetchScraperDocument(attachRequestDiagnostics(
    request,
    options?.diagnostics,
    `${options?.diagnostics?.purpose ?? "listing"}.asset`,
  )));

  return enrichListingPageWithDetails(scraper, page, async (request) => fetchScraperDocument(
    attachRequestDiagnostics(request, options?.diagnostics),
  ), options);
};

export const fetchSearchPageWithRetry = async (
  scraper: ScraperRecord,
  searchConfig: ScraperSearchFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchSearchPage(scraper, searchConfig, query, pageIndex, nextPageUrl, options),
  "Impossible de charger la page de recherche.",
  options?.diagnostics,
);

const fetchListingPage = async <TConfig extends ScraperCardListConfig>(
  scraper: ScraperRecord,
  config: TConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  options: {
    label: string;
    hasPagePlaceholder: (config: TConfig) => boolean;
    resolveTargetUrl: (
      baseUrl: string,
      config: TConfig,
      query: string,
      pageIndex: number,
    ) => string;
    resolveRequestConfig?: (
      config: TConfig,
      query: string,
      pageIndex: number,
    ) => ScraperRequestConfig | undefined;
    scrapeDetailsWithCards?: boolean;
    detailConcurrency?: number;
    diagnostics?: ScraperRequestDiagnosticContext;
  },
): Promise<ScraperRuntimeSearchPageResult> => {
  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const usesTemplatePaging = options.hasPagePlaceholder(config);
  const targetUrl = usesTemplatePaging || pageIndex === 0
    ? options.resolveTargetUrl(scraper.baseUrl, config, query, pageIndex)
    : nextPageUrl;

  throwIfScraperListingNextPageUnavailable({ pageIndex, usesTemplatePaging, nextPageUrl });
  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  const documentResult = await fetchScraperDocument(attachRequestDiagnostics({
    baseUrl: scraper.baseUrl,
    targetUrl,
    requestConfig: options.resolveRequestConfig?.(config, query, pageIndex),
  }, options.diagnostics)) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    throwIfScraperListingPaginationEnded(documentResult, {
      pageIndex,
      targetUrl,
      usesTemplatePaging,
    });

    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La page ${options.label} a repondu avec le code HTTP ${documentResult.status}.`
        : `Impossible de charger la page ${options.label}.`),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, config, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  }, async (request) => fetchScraperDocument(attachRequestDiagnostics(
    request,
    options.diagnostics,
    `${options.diagnostics?.purpose ?? "listing"}.asset`,
  )));

  return enrichListingPageWithDetails(scraper, page, async (request) => fetchScraperDocument(
    attachRequestDiagnostics(request, options.diagnostics),
  ), options);
};

const fetchAuthorPage = async (
  scraper: ScraperRecord,
  authorConfig: ScraperAuthorFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
  templateContext?: ScraperTemplateContext | null,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchListingPage(
  scraper,
  authorConfig,
  query,
  pageIndex,
  nextPageUrl,
  {
    label: "auteur",
    hasPagePlaceholder: hasAuthorPagePlaceholder,
    resolveTargetUrl: (baseUrl, config, value, targetPageIndex) => resolveScraperAuthorTargetUrl(
      baseUrl,
      config,
      value,
      {
        pageIndex: targetPageIndex,
        templateContext: templateContext ?? undefined,
      },
    ),
    scrapeDetailsWithCards: options?.scrapeDetailsWithCards,
    detailConcurrency: options?.detailConcurrency,
    diagnostics: options?.diagnostics,
  },
);

export const fetchAuthorPageWithRetry = async (
  scraper: ScraperRecord,
  authorConfig: ScraperAuthorFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
  templateContext?: ScraperTemplateContext | null,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchAuthorPage(scraper, authorConfig, query, pageIndex, nextPageUrl, templateContext, options),
  "Impossible de charger la page auteur.",
  options?.diagnostics,
);

const fetchHomepagePage = async (
  scraper: ScraperRecord,
  homepageConfig: ScraperHomepageFeatureConfig,
  pageIndex: number,
  nextPageUrl?: string,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchListingPage(
  scraper,
  homepageConfig,
  "",
  pageIndex,
  nextPageUrl,
  {
    label: "homepage",
    hasPagePlaceholder: hasSearchPagePlaceholder,
    resolveTargetUrl: (baseUrl, config, _value, targetPageIndex) => resolveScraperHomepageTargetUrl(
      baseUrl,
      config,
      { pageIndex: targetPageIndex },
    ),
    resolveRequestConfig: (config, _value, targetPageIndex) => resolveScraperHomepageRequestConfig(
      config,
      { pageIndex: targetPageIndex },
    ),
    scrapeDetailsWithCards: options?.scrapeDetailsWithCards,
    detailConcurrency: options?.detailConcurrency,
    diagnostics: options?.diagnostics,
  },
);

export const fetchHomepagePageWithRetry = async (
  scraper: ScraperRecord,
  homepageConfig: ScraperHomepageFeatureConfig,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchHomepagePage(scraper, homepageConfig, pageIndex, nextPageUrl, options),
  "Impossible de charger la page homepage.",
  options?.diagnostics,
);

const fetchTagPage = async (
  scraper: ScraperRecord,
  tagConfig: ScraperTagFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchListingPage(
  scraper,
  tagConfig,
  query,
  pageIndex,
  nextPageUrl,
  {
    label: "tag",
    hasPagePlaceholder: hasTagPagePlaceholder,
    resolveTargetUrl: (baseUrl, config, value, targetPageIndex) => resolveScraperTagTargetUrl(
      baseUrl,
      config,
      value,
      { pageIndex: targetPageIndex },
    ),
    scrapeDetailsWithCards: options?.scrapeDetailsWithCards,
    detailConcurrency: options?.detailConcurrency,
    diagnostics: options?.diagnostics,
  },
);

export const fetchTagPageWithRetry = async (
  scraper: ScraperRecord,
  tagConfig: ScraperTagFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
  options?: ScraperCardDetailsFetchOptions,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchTagPage(scraper, tagConfig, query, pageIndex, nextPageUrl, options),
  "Impossible de charger la page tag.",
  options?.diagnostics,
);

export const buildSourceResults = (
  scraper: ScraperRecord,
  page: ScraperRuntimeSearchPageResult,
  pageIndex: number,
  searchTerm: string,
  contextualAuthorNames: string[] = [],
): MultiSearchSourceResult[] => {
  const scraperLanguageCodes = getScraperSourceLanguages(scraper);
  const contentTypes = getScraperContentTypes(scraper);
  const canOpenDetails = canOpenScraperDetails(scraper);
  const normalizedContextualAuthorNames = Array.from(new Set(
    contextualAuthorNames.map((value) => value.trim()).filter(Boolean),
  ));

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
      contextualAuthorNames: normalizedContextualAuthorNames,
      advancedRomanizedTitleVariants: [],
      advancedRomanizedTentativeAuthorNameVariants: [],
      advancedRomanizedContextualAuthorNameVariants: [],
      contentTypes,
      canOpenDetails,
    };
  });
};

export const buildSourceResultsFromItems = (
  scraper: ScraperRecord,
  items: ScraperSearchResultItem[],
  getPageIndex: (result: ScraperSearchResultItem, index: number) => number,
  getSearchTerm: (result: ScraperSearchResultItem, index: number) => string,
  getContextualAuthorNames: (
    result: ScraperSearchResultItem,
    index: number,
  ) => string[] = () => [],
): MultiSearchSourceResult[] => (
  items.flatMap((result, index) => buildSourceResults(
    scraper,
    {
      currentPageUrl: "",
      items: [result],
    },
    getPageIndex(result, index),
    getSearchTerm(result, index),
    getContextualAuthorNames(result, index),
  ))
);

export const enrichSourceResultsWithCardDetails = async (
  scraper: ScraperRecord,
  sources: MultiSearchSourceResult[],
  options?: ScraperCardDetailsFetchOptions,
): Promise<MultiSearchSourceResult[]> => {
  if (options?.scrapeDetailsWithCards !== true || sources.length === 0) {
    return sources;
  }

  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const enrichedPage = await enrichListingPageWithDetails(scraper, {
    currentPageUrl: "",
    items: sources.map((source) => source.result),
  }, async (request) => fetchScraperDocument(
    attachRequestDiagnostics(request, options?.diagnostics),
  ), options);

  return buildSourceResultsFromItems(
    scraper,
    enrichedPage.items,
    (_result, index) => sources[index]?.pageIndex ?? 0,
    (_result, index) => sources[index]?.searchTerm ?? "",
    (_result, index) => sources[index]?.contextualAuthorNames ?? [],
  );
};

const resolveHasNextListingPage = (
  hasTemplatePaging: boolean,
  nextPageSelector: ScraperCardListConfig["nextPageSelector"],
  page: ScraperRuntimeSearchPageResult,
): boolean => (
  hasTemplatePaging
    ? hasScraperFieldSelectorValue(nextPageSelector)
      ? Boolean(page.nextPageUrl)
      : page.items.length > 0
    : Boolean(page.nextPageUrl)
);

export const resolveHasNextPage = (
  searchConfig: ScraperSearchFeatureConfig,
  page: ScraperRuntimeSearchPageResult,
): boolean => resolveHasNextListingPage(
  hasSearchPagePlaceholder(searchConfig),
  searchConfig.nextPageSelector,
  page,
);

export const resolveHasNextAuthorPage = (
  authorConfig: ScraperAuthorFeatureConfig,
  page: ScraperRuntimeSearchPageResult,
): boolean => resolveHasNextListingPage(
  hasAuthorPagePlaceholder(authorConfig),
  authorConfig.nextPageSelector,
  page,
);

export const resolveHasNextHomepagePage = (
  homepageConfig: ScraperHomepageFeatureConfig,
  page: ScraperRuntimeSearchPageResult,
): boolean => resolveHasNextListingPage(
  hasSearchPagePlaceholder(homepageConfig),
  homepageConfig.nextPageSelector,
  page,
);

export const resolveHasNextTagPage = (
  tagConfig: ScraperTagFeatureConfig,
  page: ScraperRuntimeSearchPageResult,
): boolean => resolveHasNextListingPage(
  hasTagPagePlaceholder(tagConfig),
  tagConfig.nextPageSelector,
  page,
);
