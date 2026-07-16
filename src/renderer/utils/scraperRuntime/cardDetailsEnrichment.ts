import {
  hasScraperFieldSelectorValue,
  type ScraperDetailsFeatureConfig,
  type ScraperRecord,
  type ScraperSearchResultItem,
} from "@/shared/scraper";
import { extractScraperDetailsFromDocumentWithImageFallbacks } from "@/renderer/utils/scraperRuntime/detailsExtraction";
import { hasRenderableDetails } from "@/renderer/utils/scraperRuntime/detailsRenderable";
import { resolveScraperDetailsTargetUrl } from "@/renderer/utils/scraperRuntime/urlResolution";
import { mergeScraperTagValuePairs } from "@/renderer/utils/scraperRuntime/tagValuePairs";
import { collectScraperDetailsTagsForTagListCacheSafe } from "@/renderer/utils/scraperTagListCache";
import type {
  ScraperDocumentFetcher,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from "@/renderer/utils/scraperRuntime/types";

const SCRAPER_CARD_DETAILS_CONCURRENCY = 3;

type CardDetailsEnrichmentOptions = {
  enabled: boolean;
  scraper: ScraperRecord;
  detailsConfig: ScraperDetailsFeatureConfig | null | undefined;
  fetchDocument: ScraperDocumentFetcher | undefined;
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

const mergeCardWithDetails = (
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

  return {
    ...item,
    title: optionalText(item.title) || optionalText(details.title) || item.title,
    detailsMetadataFetched: true,
    authorUrl: optionalText(item.authorUrl) || authorUrls[0],
    authorUrls: authorUrls.length ? authorUrls : item.authorUrls,
    authorNames: authorNames.length ? authorNames : item.authorNames,
    tags: tagValues.tags.length ? tagValues.tags : item.tags,
    tagUrls: tagValues.tagUrls.length ? tagValues.tagUrls : item.tagUrls,
    thumbnailUrl: optionalText(item.thumbnailUrl) || optionalText(details.cover),
    summary: optionalText(item.summary) || optionalText(details.description),
    pageCount: optionalText(item.pageCount) || optionalText(details.pageCount),
    languageCodes: nextLanguageCodes.length ? nextLanguageCodes : item.languageCodes,
  };
};

const runCardDetailTasks = async (tasks: Array<() => Promise<void>>): Promise<void> => {
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(SCRAPER_CARD_DETAILS_CONCURRENCY, tasks.length) },
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

  const tasks = page.items.map((item, index) => async () => {
    if (!item.detailUrl) {
      skipped += 1;
      return;
    }

    try {
      const targetUrl = resolveScraperDetailsTargetUrl(
        options.scraper.baseUrl,
        detailsConfig,
        item.detailUrl,
      );
      const documentResult = await fetchDocument({
        baseUrl: options.scraper.baseUrl,
        targetUrl,
      });

      if (!documentResult?.ok || !documentResult.html) {
        failed += 1;
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, "text/html");
      const details = await extractScraperDetailsFromDocumentWithImageFallbacks(documentNode, detailsConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
        status: documentResult.status,
        contentType: documentResult.contentType,
        html: documentResult.html,
      }, fetchDocument);

      if (!hasRenderableDetails(details)) {
        failed += 1;
        return;
      }

      collectScraperDetailsTagsForTagListCacheSafe(options.scraper, details);
      enrichedItems[index] = mergeCardWithDetails(item, details);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  });

  await runCardDetailTasks(tasks);

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
