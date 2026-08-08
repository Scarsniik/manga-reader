import {
  hasScraperFieldSelectorValue,
} from "@/shared/scraper";
import {
  createScraperCardDetailsCache,
  doesScraperCardNeedMetadata,
  formatScraperValueForDisplay,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  isScraperFeatureConfigured,
  resolveScraperCardDetails,
  SCRAPER_METADATA_REQUIREMENTS_BY_PHASE,
  type ScraperCardDetailsCache,
  type ScraperDocumentFetcher,
} from "@/renderer/utils/scraperRuntime";
import {
  getPaceConfig,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
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

export type MultiSearchAuthorExtractionRuntimeOptions = {
  concurrency?: number;
  signal?: AbortSignal;
  detailsCache?: ScraperCardDetailsCache;
  fetchDocument?: ScraperDocumentFetcher;
};

const throwIfAuthorExtractionAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new DOMException("Extraction des auteurs annulée", "AbortError");
  }
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

const getSourceAuthorUrls = (source: MultiSearchSourceResult): string[] => (
  source.result.authorUrls?.length
    ? source.result.authorUrls
    : source.result.authorUrl
      ? [source.result.authorUrl]
      : []
);

const sortAuthorResults = (authors: MultiSearchAuthorResult[]): MultiSearchAuthorResult[] => (
  authors.sort((left, right) => (
    left.name.localeCompare(right.name) || left.scraperName.localeCompare(right.scraperName)
  ))
);

export const buildMultiSearchAuthorsSourceFingerprint = (
  sources: MultiSearchSourceResult[],
): string => JSON.stringify(
  sources.map((source) => {
    const authorEntries = getSourceAuthorUrls(source).map((authorUrl, index) => ([
      normalizeAuthorUrl(authorUrl),
      String(source.result.authorNames?.[index] ?? source.result.authorNames?.[0] ?? "").trim(),
    ])).sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));

    return JSON.stringify({
      scraperId: source.scraper.id,
      scraperName: source.scraper.name,
      scraperBaseUrl: source.scraper.baseUrl,
      scraperUpdatedAt: source.scraper.updatedAt,
      detailUrl: normalizeAuthorUrl(source.result.detailUrl),
      title: source.result.title,
      authorEntries,
      authorNames: [...(source.result.authorNames ?? [])].sort(),
      detailsMetadataFetched: source.result.detailsMetadataFetched === true,
    });
  }).sort(),
);

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
  const authorUrls = getSourceAuthorUrls(source);

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
  if (
    !source.result.detailUrl
    || !doesScraperCardNeedMetadata(
      source.result,
      SCRAPER_METADATA_REQUIREMENTS_BY_PHASE.authorDiscovery,
    )
  ) {
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

type CollectedMultiSearchAuthors = {
  authorsByKey: Map<string, MultiSearchAuthorResult>;
  sourcesRequiringDetails: MultiSearchSourceResult[];
};

const collectMultiSearchCardAuthors = (
  sources: MultiSearchSourceResult[],
): CollectedMultiSearchAuthors => {
  const authorsByKey = new Map<string, MultiSearchAuthorResult>();
  const sourcesRequiringDetails: MultiSearchSourceResult[] = [];

  sources.forEach((source) => {
    const hasCardAuthor = addCardAuthors(authorsByKey, source);
    if (!hasCardAuthor && canExtractDetailsAuthors(source)) {
      sourcesRequiringDetails.push(source);
    }
  });

  return {
    authorsByKey,
    sourcesRequiringDetails,
  };
};

export const buildMultiSearchAuthorExtractionFromLoadedMetadata = (
  sources: MultiSearchSourceResult[],
): MultiSearchAuthorExtractionResult | null => {
  const {
    authorsByKey,
    sourcesRequiringDetails,
  } = collectMultiSearchCardAuthors(sources);

  if (sourcesRequiringDetails.length > 0) {
    return null;
  }

  return {
    authors: sortAuthorResults(Array.from(authorsByKey.values())),
    detailsSourceCount: 0,
    failedDetailsSourceCount: 0,
  };
};

const fetchDetailsAuthors = async (
  authorsByKey: Map<string, MultiSearchAuthorResult>,
  source: MultiSearchSourceResult,
  detailsCache: ScraperCardDetailsCache,
  fetchDocument?: ScraperDocumentFetcher,
): Promise<boolean> => {
  const api = (window as any).api;
  const fetcher = fetchDocument ?? api?.fetchScraperDocument;
  if (typeof fetcher !== "function" || !source.result.detailUrl) {
    return false;
  }

  const detailsFeature = getScraperFeature(source.scraper, "details");
  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);
  if (!detailsConfig) {
    return false;
  }

  const details = await resolveScraperCardDetails({
    scraper: source.scraper,
    detailsConfig,
    detailUrl: source.result.detailUrl,
    fetchDocument: fetcher,
    detailsCache,
  });
  if (!details) return false;

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
  detailsCache: ScraperCardDetailsCache,
  signal?: AbortSignal,
  fetchDocument?: ScraperDocumentFetcher,
): Promise<boolean> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= paceConfig.retryCount; attempt += 1) {
    throwIfAuthorExtractionAborted(signal);
    try {
      if (attempt > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      return await fetchDetailsAuthors(authorsByKey, source, detailsCache, fetchDocument);
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
  runtimeOptions?: MultiSearchAuthorExtractionRuntimeOptions,
): Promise<MultiSearchAuthorExtractionResult> => {
  const {
    authorsByKey,
    sourcesRequiringDetails,
  } = collectMultiSearchCardAuthors(sources);
  let processedSourceCount = sources.length - sourcesRequiringDetails.length;

  const paceConfig = {
    ...getPaceConfig(paceMode),
    concurrency: Math.max(1, Math.floor(runtimeOptions?.concurrency ?? getPaceConfig(paceMode).concurrency)),
  };
  const totalSourceCount = sources.length;
  let failedDetailsSourceCount = 0;
  const detailsCache = runtimeOptions?.detailsCache ?? createScraperCardDetailsCache();
  onProgress?.({
    processedSourceCount,
    totalSourceCount,
    detailsSourceCount: sourcesRequiringDetails.length,
  });

  await runWithConcurrency(
    sourcesRequiringDetails.map((source) => async () => {
      throwIfAuthorExtractionAborted(runtimeOptions?.signal);
      if (paceConfig.pageDelayMs > 0) {
        await wait(paceConfig.pageDelayMs);
      }

      const foundDetailsAuthor = await fetchDetailsAuthorsWithRetry(
        authorsByKey,
        source,
        paceConfig,
        detailsCache,
        runtimeOptions?.signal,
        runtimeOptions?.fetchDocument,
      );
      if (!foundDetailsAuthor) {
        failedDetailsSourceCount += 1;
      }

      processedSourceCount += 1;
      onProgress?.({
        processedSourceCount,
        totalSourceCount,
        detailsSourceCount: sourcesRequiringDetails.length,
      });
    }),
    paceConfig.concurrency,
  );

  return {
    authors: sortAuthorResults(Array.from(authorsByKey.values())),
    detailsSourceCount: sourcesRequiringDetails.length,
    failedDetailsSourceCount,
  };
};
