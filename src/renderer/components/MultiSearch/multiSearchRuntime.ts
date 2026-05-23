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
  getScraperFeature,
  getScraperAuthorFeatureConfig,
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

const fetchPageWithRetry = async (
  pageIndex: number,
  paceConfig: PaceConfig,
  loadPage: () => Promise<ScraperRuntimeSearchPageResult>,
  failureMessage: string,
): Promise<ScraperRuntimeSearchPageResult> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= paceConfig.retryCount; attempt += 1) {
    try {
      if (attempt > 0 || pageIndex > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      return await loadPage();
    } catch (error) {
      lastError = error;
      if (attempt < paceConfig.retryCount) {
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
  return extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, searchConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  }, async (request) => fetchScraperDocument(request));
};

export const fetchSearchPageWithRetry = async (
  scraper: ScraperRecord,
  searchConfig: ScraperSearchFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchSearchPage(scraper, searchConfig, query, pageIndex, nextPageUrl),
  "Impossible de charger la page de recherche.",
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

  if (!targetUrl) {
    throw new Error("Aucune page suivante n'est disponible pour ce scrapper.");
  }

  const documentResult = await fetchScraperDocument({
    baseUrl: scraper.baseUrl,
    targetUrl,
    requestConfig: options.resolveRequestConfig?.(config, query, pageIndex),
  }) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La page ${options.label} a repondu avec le code HTTP ${documentResult.status}.`
        : `Impossible de charger la page ${options.label}.`),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  return extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, config, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  }, async (request) => fetchScraperDocument(request));
};

const fetchAuthorPage = async (
  scraper: ScraperRecord,
  authorConfig: ScraperAuthorFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
  templateContext?: ScraperTemplateContext | null,
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
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchAuthorPage(scraper, authorConfig, query, pageIndex, nextPageUrl, templateContext),
  "Impossible de charger la page auteur.",
);

const fetchHomepagePage = async (
  scraper: ScraperRecord,
  homepageConfig: ScraperHomepageFeatureConfig,
  pageIndex: number,
  nextPageUrl?: string,
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
  },
);

export const fetchHomepagePageWithRetry = async (
  scraper: ScraperRecord,
  homepageConfig: ScraperHomepageFeatureConfig,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchHomepagePage(scraper, homepageConfig, pageIndex, nextPageUrl),
  "Impossible de charger la page homepage.",
);

const fetchTagPage = async (
  scraper: ScraperRecord,
  tagConfig: ScraperTagFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl?: string,
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
  },
);

export const fetchTagPageWithRetry = async (
  scraper: ScraperRecord,
  tagConfig: ScraperTagFeatureConfig,
  query: string,
  pageIndex: number,
  nextPageUrl: string | undefined,
  paceConfig: PaceConfig,
): Promise<ScraperRuntimeSearchPageResult> => fetchPageWithRetry(
  pageIndex,
  paceConfig,
  () => fetchTagPage(scraper, tagConfig, query, pageIndex, nextPageUrl),
  "Impossible de charger la page tag.",
);

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
      advancedRomanizedTitleVariants: [],
      advancedRomanizedTentativeAuthorNameVariants: [],
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
): MultiSearchSourceResult[] => (
  items.flatMap((result, index) => buildSourceResults(scraper, {
    currentPageUrl: "",
    items: [result],
  }, getPageIndex(result, index), getSearchTerm(result, index)))
);

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
