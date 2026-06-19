import {
  hasScraperFieldSelectorValue,
  type FetchScraperDocumentResult,
} from "@/shared/scraper";
import {
  extractScraperDetailsFromDocumentWithImageFallbacks,
  formatScraperValueForDisplay,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  isScraperFeatureConfigured,
  resolveScraperDetailsTargetUrl,
} from "@/renderer/utils/scraperRuntime";
import {
  getPaceConfig,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { collectScraperDetailsTagsForTagListCacheSafe } from "@/renderer/utils/scraperTagListCache";
import type {
  MultiSearchPaceMode,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

export type MultiSearchAuthorDiscoveryMethod = "card" | "details";

export type MultiSearchAuthorResult = {
  key: string;
  scraperId: string;
  scraperName: string;
  name: string;
  url: string;
  sourceTitle: string;
  discoveryMethod: MultiSearchAuthorDiscoveryMethod;
};

export type MultiSearchAuthorExtractionProgress = {
  processedSourceCount: number;
  totalSourceCount: number;
  detailsSourceCount: number;
};

export type MultiSearchAuthorExtractionResult = {
  authors: MultiSearchAuthorResult[];
  detailsSourceCount: number;
  failedDetailsSourceCount: number;
};

const wait = (delayMs: number): Promise<void> => (
  delayMs > 0
    ? new Promise((resolve) => window.setTimeout(resolve, delayMs))
    : Promise.resolve()
);

const normalizeAuthorUrl = (value: string | null | undefined): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

const getFallbackAuthorName = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const lastPathPart = pathParts[pathParts.length - 1];
    return formatScraperValueForDisplay(lastPathPart || parsedUrl.hostname || url);
  } catch {
    return formatScraperValueForDisplay(url);
  }
};

const normalizeAuthorName = (name: string | null | undefined, url: string): string => {
  const trimmedName = formatScraperValueForDisplay(String(name ?? "").trim());
  return trimmedName || getFallbackAuthorName(url) || url;
};

const buildAuthorKey = (scraperId: string, url: string): string => (
  `${scraperId}::${normalizeAuthorUrl(url)}`
);

const addAuthorResult = (
  authorsByKey: Map<string, MultiSearchAuthorResult>,
  source: MultiSearchSourceResult,
  url: string | null | undefined,
  name: string | null | undefined,
  discoveryMethod: MultiSearchAuthorDiscoveryMethod,
): boolean => {
  const normalizedUrl = normalizeAuthorUrl(url);
  if (!normalizedUrl) {
    return false;
  }

  const key = buildAuthorKey(source.scraper.id, normalizedUrl);
  if (!authorsByKey.has(key)) {
    authorsByKey.set(key, {
      key,
      scraperId: source.scraper.id,
      scraperName: source.scraper.name,
      name: normalizeAuthorName(name, normalizedUrl),
      url: normalizedUrl,
      sourceTitle: source.result.title,
      discoveryMethod,
    });
  }

  return true;
};

const addCardAuthors = (
  authorsByKey: Map<string, MultiSearchAuthorResult>,
  source: MultiSearchSourceResult,
): boolean => {
  const authorUrls = source.result.authorUrls?.length
    ? source.result.authorUrls
    : source.result.authorUrl
      ? [source.result.authorUrl]
      : [];

  if (!authorUrls.length) {
    return false;
  }

  return authorUrls.reduce((hasAuthor, authorUrl, index) => (
    addAuthorResult(
      authorsByKey,
      source,
      authorUrl,
      source.result.authorNames?.[index] ?? source.result.authorNames?.[0],
      "card",
    ) || hasAuthor
  ), false);
};

const canExtractDetailsAuthors = (source: MultiSearchSourceResult): boolean => {
  if (!source.result.detailUrl) {
    return false;
  }

  const detailsFeature = getScraperFeature(source.scraper, "details");
  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);
  return Boolean(
    isScraperFeatureConfigured(detailsFeature)
    && detailsConfig
    && hasScraperFieldSelectorValue(detailsConfig.titleSelector)
    && hasScraperFieldSelectorValue(detailsConfig.authorUrlSelector),
  );
};

const fetchDetailsAuthors = async (
  authorsByKey: Map<string, MultiSearchAuthorResult>,
  source: MultiSearchSourceResult,
): Promise<boolean> => {
  const api = (window as any).api;
  if (!api || typeof api.fetchScraperDocument !== "function" || !source.result.detailUrl) {
    return false;
  }

  const detailsFeature = getScraperFeature(source.scraper, "details");
  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);
  if (!detailsConfig) {
    return false;
  }

  const targetUrl = resolveScraperDetailsTargetUrl(
    source.scraper.baseUrl,
    detailsConfig,
    source.result.detailUrl,
  );
  const documentResult = await api.fetchScraperDocument({
    baseUrl: source.scraper.baseUrl,
    targetUrl,
  }) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    return false;
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  const details = await extractScraperDetailsFromDocumentWithImageFallbacks(documentNode, detailsConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
    status: documentResult.status,
    contentType: documentResult.contentType,
    html: documentResult.html,
  }, async (request) => api.fetchScraperDocument(request));
  collectScraperDetailsTagsForTagListCacheSafe(source.scraper, details);

  return details.authorUrls.reduce((hasAuthor, authorUrl, index) => (
    addAuthorResult(
      authorsByKey,
      source,
      authorUrl,
      details.authors[index] ?? details.authors[0],
      "details",
    ) || hasAuthor
  ), false);
};

const fetchDetailsAuthorsWithRetry = async (
  authorsByKey: Map<string, MultiSearchAuthorResult>,
  source: MultiSearchSourceResult,
  paceConfig: PaceConfig,
): Promise<boolean> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= paceConfig.retryCount; attempt += 1) {
    try {
      if (attempt > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      return await fetchDetailsAuthors(authorsByKey, source);
    } catch (error) {
      lastError = error;
      if (attempt < paceConfig.retryCount) {
        await wait(paceConfig.pageDelayMs);
      }
    }
  }

  console.warn("Failed to extract authors from multi-search details page", lastError);
  return false;
};

export const extractMultiSearchAuthors = async (
  sources: MultiSearchSourceResult[],
  paceMode: MultiSearchPaceMode,
  onProgress?: (progress: MultiSearchAuthorExtractionProgress) => void,
): Promise<MultiSearchAuthorExtractionResult> => {
  const authorsByKey = new Map<string, MultiSearchAuthorResult>();
  const sourcesWithoutCardAuthors: MultiSearchSourceResult[] = [];
  let processedSourceCount = 0;

  sources.forEach((source) => {
    const hasCardAuthor = addCardAuthors(authorsByKey, source);
    if (!hasCardAuthor && canExtractDetailsAuthors(source)) {
      sourcesWithoutCardAuthors.push(source);
      return;
    }

    processedSourceCount += 1;
  });

  const paceConfig = getPaceConfig(paceMode);
  const totalSourceCount = sources.length;
  let failedDetailsSourceCount = 0;
  onProgress?.({
    processedSourceCount,
    totalSourceCount,
    detailsSourceCount: sourcesWithoutCardAuthors.length,
  });

  await runWithConcurrency(
    sourcesWithoutCardAuthors.map((source) => async () => {
      if (paceConfig.pageDelayMs > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      const foundDetailsAuthor = await fetchDetailsAuthorsWithRetry(authorsByKey, source, paceConfig);
      if (!foundDetailsAuthor) {
        failedDetailsSourceCount += 1;
      }

      processedSourceCount += 1;
      onProgress?.({
        processedSourceCount,
        totalSourceCount,
        detailsSourceCount: sourcesWithoutCardAuthors.length,
      });
    }),
    paceConfig.concurrency,
  );

  return {
    authors: Array.from(authorsByKey.values()).sort((left, right) => (
      left.name.localeCompare(right.name) || left.scraperName.localeCompare(right.scraperName)
    )),
    detailsSourceCount: sourcesWithoutCardAuthors.length,
    failedDetailsSourceCount,
  };
};
