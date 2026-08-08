import {
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
  enrichScraperSearchPageWithDetails,
  attachScraperRequestDiagnostics,
  fetchResolvedScraperListingPage,
  fetchScraperPageWithRetry,
  getScraperFeature,
  getScraperAuthorFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperHomepageFeatureConfig,
  getScraperSearchFeatureConfig,
  getScraperTagFeatureConfig,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  hasTagPagePlaceholder,
  resolveScraperHomepageRequestConfig,
  resolveScraperHomepageTargetUrl,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  resolveScraperAuthorTargetUrl,
  resolveScraperTagTargetUrl,
  type ScraperDocumentFetcher,
  type ScraperCardDetailsCache,
  ScraperRuntimeSearchPageResult,
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
import { runTasksWithConcurrency } from "@/renderer/utils/runWithConcurrency";

export type PaceConfig = {
  concurrency: number;
  pageDelayMs: number;
  retryCount: number;
};

export type ScraperCardDetailsFetchOptions = {
  scrapeDetailsWithCards?: boolean;
  detailConcurrency?: number;
  diagnostics?: ScraperRequestDiagnosticContext;
  detailsCache?: ScraperCardDetailsCache;
  fetchDocument?: ScraperDocumentFetcher;
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

const fetchPageWithRetry = async (
  pageIndex: number,
  paceConfig: PaceConfig,
  loadPage: () => Promise<ScraperRuntimeSearchPageResult>,
  failureMessage: string,
  diagnostics?: ScraperRequestDiagnosticContext,
): Promise<ScraperRuntimeSearchPageResult> => fetchScraperPageWithRetry({
  pageIndex,
  retryCount: paceConfig.retryCount,
  pageDelayMs: paceConfig.pageDelayMs,
  loadPage,
  failureMessage,
  diagnostics,
});

export const runWithConcurrency = runTasksWithConcurrency;

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
    detailsCache: options?.detailsCache,
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
  const usesTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const targetUrl = usesTemplatePaging || pageIndex === 0
    ? resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig, query, { pageIndex })
    : nextPageUrl;

  throwIfScraperListingNextPageUnavailable({ pageIndex, usesTemplatePaging, nextPageUrl });
  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  return fetchResolvedScraperListingPage({
    scraper,
    config: searchConfig,
    targetUrl,
    pageIndex,
    usesTemplatePaging,
    requestConfig: resolveScraperSearchRequestConfig(searchConfig, query, { pageIndex }),
    responseLabel: "La recherche",
    failureMessage: "Impossible de charger la page de recherche.",
    ...options,
  });
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
    detailsCache?: ScraperCardDetailsCache;
    fetchDocument?: ScraperDocumentFetcher;
  },
): Promise<ScraperRuntimeSearchPageResult> => {
  const usesTemplatePaging = options.hasPagePlaceholder(config);
  const targetUrl = usesTemplatePaging || pageIndex === 0
    ? options.resolveTargetUrl(scraper.baseUrl, config, query, pageIndex)
    : nextPageUrl;

  throwIfScraperListingNextPageUnavailable({ pageIndex, usesTemplatePaging, nextPageUrl });
  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  return fetchResolvedScraperListingPage({
    scraper,
    config,
    targetUrl,
    pageIndex,
    usesTemplatePaging,
    requestConfig: options.resolveRequestConfig?.(config, query, pageIndex),
    responseLabel: `La page ${options.label}`,
    failureMessage: `Impossible de charger la page ${options.label}.`,
    scrapeDetailsWithCards: options.scrapeDetailsWithCards,
    detailConcurrency: options.detailConcurrency,
    diagnostics: options.diagnostics,
    detailsCache: options.detailsCache,
    fetchDocument: options.fetchDocument,
  });
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
    detailsCache: options?.detailsCache,
    fetchDocument: options?.fetchDocument,
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
    detailsCache: options?.detailsCache,
    fetchDocument: options?.fetchDocument,
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
    detailsCache: options?.detailsCache,
    fetchDocument: options?.fetchDocument,
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

  const fetchScraperDocument = options?.fetchDocument ?? (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const enrichedPage = await enrichListingPageWithDetails(scraper, {
    currentPageUrl: "",
    items: sources.map((source) => source.result),
  }, async (request) => fetchScraperDocument(
    attachScraperRequestDiagnostics(request, options?.diagnostics),
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
