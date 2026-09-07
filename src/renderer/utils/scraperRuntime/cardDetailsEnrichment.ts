import {
  hasScraperFieldSelectorValue,
  type ScraperDetailsFeatureConfig,
  type ScraperRecord,
  type ScraperSearchResultItem,
} from "@/shared/scraper";
import { extractScraperDetailsFromDocument } from "@/renderer/utils/scraperRuntime/detailsExtraction";
import { hasRenderableDetails } from "@/renderer/utils/scraperRuntime/detailsRenderable";
import { resolveScraperDetailsTargetUrl } from "@/renderer/utils/scraperRuntime/urlResolution";
import { mergeScraperTagValuePairs } from "@/renderer/utils/scraperRuntime/tagValuePairs";
import { collectScraperDetailsTagsForTagListCacheSafe } from "@/renderer/utils/scraperTagListCache";
import type {
  ScraperDocumentFetcher,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from "@/renderer/utils/scraperRuntime/types";
import { runTasksWithConcurrency } from "@/renderer/utils/runWithConcurrency";

const SCRAPER_CARD_DETAILS_CONCURRENCY = 3;

export type ScraperCardDetailsCache = Map<string, Promise<ScraperRuntimeDetailsResult | null>>;

export type ScraperCardDetailsProgress = {
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export type CardDetailsEnrichmentOptions = {
  enabled: boolean;
  scraper: ScraperRecord;
  detailsConfig: ScraperDetailsFeatureConfig | null | undefined;
  fetchDocument: ScraperDocumentFetcher | undefined;
  concurrency?: number;
  detailsCache?: ScraperCardDetailsCache;
  onProgress?: (progress: ScraperCardDetailsProgress) => void;
};

const uniqueTextValues = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((result, value) => {
    const normalized = String(value ?? "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return result;
    }

    seen.add(key);
    result.push(normalized);
    return result;
  }, []);
};

const optionalText = (value: string | null | undefined): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

export const mergeScraperCardWithDetails = (
  item: ScraperSearchResultItem,
  details: ScraperRuntimeDetailsResult,
): ScraperSearchResultItem => {
  const authorUrls = uniqueTextValues([
    ...(item.authorUrls ?? []),
    item.authorUrl,
    ...details.authorUrls,
  ]);
  const authorNames = uniqueTextValues([
    ...(item.authorNames ?? []),
    ...details.authors,
  ]);
  const languageCodes = uniqueTextValues([
    ...details.languageCodes,
  ]);
  const fallbackLanguageCodes = uniqueTextValues(item.languageCodes ?? []);
  const nextLanguageCodes = languageCodes.length ? languageCodes : fallbackLanguageCodes;
  const tagValues = mergeScraperTagValuePairs(
    { tags: item.tags, tagUrls: item.tagUrls },
    { tags: details.tags, tagUrls: details.tagUrls },
  );
  const sourceValues = mergeScraperTagValuePairs(
    { tags: item.sourceNames, tagUrls: item.sourceUrls },
    { tags: details.sources, tagUrls: details.sourceUrls },
  );
  const thumbnailCandidates = uniqueTextValues([
    ...(item.thumbnailCandidates ?? []),
    item.thumbnailUrl,
    ...(details.coverCandidates ?? []),
    details.cover,
  ]);

  return {
    ...item,
    title: optionalText(item.title) || optionalText(details.title) || item.title,
    detailsMetadataFetched: true,
    detailsTitle: optionalText(details.title) || item.detailsTitle,
    detailsSourceUrl: optionalText(details.finalUrl)
      || optionalText(details.requestedUrl)
      || item.detailsSourceUrl,
    authorUrl: optionalText(item.authorUrl) || authorUrls[0],
    authorUrls: authorUrls.length ? authorUrls : item.authorUrls,
    authorNames: authorNames.length ? authorNames : item.authorNames,
    tags: tagValues.tags.length ? tagValues.tags : item.tags,
    tagUrls: tagValues.tagUrls.length ? tagValues.tagUrls : item.tagUrls,
    sourceNames: sourceValues.tags.length ? sourceValues.tags : item.sourceNames,
    sourceUrls: sourceValues.tagUrls.length ? sourceValues.tagUrls : item.sourceUrls,
    thumbnailUrl: thumbnailCandidates[0],
    thumbnailCandidates: thumbnailCandidates.length > 1 ? thumbnailCandidates : undefined,
    summary: optionalText(item.summary) || optionalText(details.description),
    pageCount: optionalText(item.pageCount) || optionalText(details.pageCount),
    languageCodes: nextLanguageCodes.length ? nextLanguageCodes : item.languageCodes,
  };
};

export const createScraperCardDetailsCache = (): ScraperCardDetailsCache => new Map();

export const resolveScraperCardDetails = async (options: {
  scraper: ScraperRecord;
  detailsConfig: ScraperDetailsFeatureConfig | null | undefined;
  detailUrl: string | null | undefined;
  fetchDocument: ScraperDocumentFetcher | undefined;
  detailsCache?: ScraperCardDetailsCache;
}): Promise<ScraperRuntimeDetailsResult | null> => {
  const { scraper, detailsConfig, detailUrl, fetchDocument, detailsCache } = options;
  if (!detailUrl || !fetchDocument || !canEnrichScraperCardsWithDetails(detailsConfig)) return null;

  const targetUrl = resolveScraperDetailsTargetUrl(scraper.baseUrl, detailsConfig, detailUrl);
  const cacheKey = `${scraper.id}::${targetUrl}`;
  const existing = detailsCache?.get(cacheKey);
  if (existing) return existing;

  const request = (async (): Promise<ScraperRuntimeDetailsResult | null> => {
    const documentResult = await fetchDocument({
      scraperId: scraper.id,
      baseUrl: scraper.baseUrl,
      targetUrl,
    });
    if (!documentResult?.ok || !documentResult.html) return null;

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, "text/html");
    const details = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      html: documentResult.html,
    });
    if (!hasRenderableDetails(details)) return null;
    collectScraperDetailsTagsForTagListCacheSafe(scraper, details);
    return details;
  })();

  detailsCache?.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    if (detailsCache?.get(cacheKey) === request) detailsCache.delete(cacheKey);
    throw error;
  }
};

export const canEnrichScraperCardsWithDetails = (
  detailsConfig: ScraperDetailsFeatureConfig | null | undefined,
): detailsConfig is ScraperDetailsFeatureConfig => (
  Boolean(detailsConfig && hasScraperFieldSelectorValue(detailsConfig.titleSelector))
);

export const enrichScraperSearchPageWithDetails = async (
  page: ScraperRuntimeSearchPageResult,
  options: CardDetailsEnrichmentOptions,
): Promise<ScraperRuntimeSearchPageResult> => {
  const detailsConfig = options.detailsConfig;
  const fetchDocument = options.fetchDocument;

  if (
    !options.enabled
    || !canEnrichScraperCardsWithDetails(detailsConfig)
    || !fetchDocument
    || page.items.length === 0
  ) {
    return page;
  }

  const startedAt = Date.now();
  const enrichedItems = [...page.items];
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;
  let completed = 0;
  const emitProgress = () => options.onProgress?.({
    completed,
    total: page.items.length,
    succeeded,
    failed,
    skipped,
  });

  emitProgress();

  const tasks = page.items.map((item, index) => async () => {
    if (!item.detailUrl) {
      skipped += 1;
      completed += 1;
      emitProgress();
      return;
    }

    try {
      const details = await resolveScraperCardDetails({
        scraper: options.scraper,
        detailsConfig,
        detailUrl: item.detailUrl,
        fetchDocument,
        detailsCache: options.detailsCache,
      });
      if (!details) {
        failed += 1;
        return;
      }
      enrichedItems[index] = mergeScraperCardWithDetails(item, details);
      succeeded += 1;
    } catch {
      failed += 1;
    } finally {
      completed += 1;
      emitProgress();
    }
  });

  const concurrency = Math.max(
    1,
    Math.floor(Number(options.concurrency) || SCRAPER_CARD_DETAILS_CONCURRENCY),
  );
  await runTasksWithConcurrency(tasks, concurrency);

  return {
    ...page,
    detailsScrape: {
      attempted: succeeded + failed,
      succeeded,
      failed,
      skipped,
      durationMs: Date.now() - startedAt,
    },
    items: enrichedItems,
  };
};
