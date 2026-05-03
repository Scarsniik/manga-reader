import type {
  SaveScraperBookmarkRequest,
  ScraperBookmarkMetadataField,
  ScraperBookmarkRecord,
  ScraperRecord,
} from "@/shared/scraper";
import { hasScraperFieldSelectorValue } from "@/shared/scraper";
import {
  extractScraperDetailsFromDocument,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  hasRenderableDetails,
  isScraperFeatureConfigured,
  resolveScraperDetailsTargetUrl,
} from "@/renderer/utils/scraperRuntime";
import { uniqueLanguageCodes } from "@/renderer/utils/languageDetection";

const BOOKMARK_METADATA_FIELDS = new Set<ScraperBookmarkMetadataField>([
  "cover",
  "summary",
  "description",
  "authors",
  "tags",
  "mangaStatus",
  "pageCount",
  "languageCodes",
]);

let scrapersCache: ScraperRecord[] | null = null;
let scrapersCachePromise: Promise<ScraperRecord[]> | null = null;
let hasBoundScrapersCacheInvalidation = false;

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

const invalidateScrapersCache = () => {
  scrapersCache = null;
  scrapersCachePromise = null;
};

const bindScrapersCacheInvalidation = () => {
  if (hasBoundScrapersCacheInvalidation || typeof window === "undefined") {
    return;
  }

  window.addEventListener("scrapers-updated", invalidateScrapersCache as EventListener);
  hasBoundScrapersCacheInvalidation = true;
};

const loadScrapers = async (): Promise<ScraperRecord[]> => {
  bindScrapersCacheInvalidation();

  if (scrapersCache) {
    return scrapersCache;
  }

  if (scrapersCachePromise) {
    return scrapersCachePromise;
  }

  const api = getApi();
  if (!api || typeof api.getScrapers !== "function") {
    return [];
  }

  scrapersCachePromise = (async () => {
    try {
      const data = await api.getScrapers();
      scrapersCache = Array.isArray(data) ? data as ScraperRecord[] : [];
      return scrapersCache;
    } finally {
      scrapersCachePromise = null;
    }
  })();

  return scrapersCachePromise;
};

const loadScraperById = async (scraperId: string): Promise<ScraperRecord | null> => {
  const scrapers = await loadScrapers();
  return scrapers.find((scraper) => scraper.id === scraperId) ?? null;
};

export const normalizeBookmarkOptionalText = (value: string | null | undefined): string | undefined => {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
};

export const normalizeBookmarkStringList = (values: string[] | undefined): string[] => (
  Array.isArray(values)
    ? Array.from(new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ))
    : []
);

export const normalizeBookmarkLanguageCodes = (values: string[] | undefined): string[] => (
  uniqueLanguageCodes(normalizeBookmarkStringList(values))
);

export const getScraperSingleSourceLanguageCodes = (
  scraper: ScraperRecord | null | undefined,
): string[] => {
  const sourceLanguages = normalizeBookmarkLanguageCodes(scraper?.globalConfig.sourceLanguages);
  return sourceLanguages.length === 1 ? sourceLanguages : [];
};

export const getScraperBookmarkLanguageCodes = (
  bookmark: Pick<ScraperBookmarkRecord, "languageCodes">,
  scraper: ScraperRecord | null | undefined,
): string[] => {
  const bookmarkLanguageCodes = normalizeBookmarkLanguageCodes(bookmark.languageCodes);
  return bookmarkLanguageCodes.length
    ? bookmarkLanguageCodes
    : getScraperSingleSourceLanguageCodes(scraper);
};

export const normalizeBookmarkExcludedFields = (
  values: ScraperBookmarkMetadataField[] | undefined,
): ScraperBookmarkMetadataField[] => (
  Array.isArray(values)
    ? Array.from(new Set(
      values.filter((value): value is ScraperBookmarkMetadataField => (
        BOOKMARK_METADATA_FIELDS.has(String(value ?? "").trim() as ScraperBookmarkMetadataField)
      )),
    ))
    : []
);

const areSameStringLists = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

const bookmarkHasExcludedFieldData = (
  bookmark: ScraperBookmarkRecord,
  field: ScraperBookmarkMetadataField,
): boolean => {
  if (field === "authors" || field === "tags" || field === "languageCodes") {
    return (bookmark[field] ?? []).length > 0;
  }

  return Boolean(bookmark[field]);
};

export const shouldSyncBookmarkMetadata = (
  bookmark: ScraperBookmarkRecord | null,
  request: SaveScraperBookmarkRequest,
): boolean => {
  if (!bookmark) {
    return false;
  }

  const excludedFields = new Set(normalizeBookmarkExcludedFields(request.excludedFields));

  if (Array.from(excludedFields).some((field) => bookmarkHasExcludedFieldData(bookmark, field))) {
    return true;
  }

  const nextTitle = normalizeBookmarkOptionalText(request.title);
  if (nextTitle && nextTitle !== bookmark.title) {
    return true;
  }

  const nextCover = normalizeBookmarkOptionalText(request.cover);
  if (!excludedFields.has("cover") && nextCover && nextCover !== bookmark.cover) {
    return true;
  }

  const nextSummary = normalizeBookmarkOptionalText(request.summary);
  if (!excludedFields.has("summary") && nextSummary && nextSummary !== bookmark.summary) {
    return true;
  }

  const nextDescription = normalizeBookmarkOptionalText(request.description);
  if (!excludedFields.has("description") && nextDescription && nextDescription !== bookmark.description) {
    return true;
  }

  const nextMangaStatus = normalizeBookmarkOptionalText(request.mangaStatus);
  if (!excludedFields.has("mangaStatus") && nextMangaStatus && nextMangaStatus !== bookmark.mangaStatus) {
    return true;
  }

  const nextPageCount = normalizeBookmarkOptionalText(request.pageCount);
  if (!excludedFields.has("pageCount") && nextPageCount && nextPageCount !== bookmark.pageCount) {
    return true;
  }

  const nextAuthors = normalizeBookmarkStringList(request.authors);
  if (!excludedFields.has("authors") && nextAuthors.length && !areSameStringLists(nextAuthors, bookmark.authors)) {
    return true;
  }

  const nextTags = normalizeBookmarkStringList(request.tags);
  if (!excludedFields.has("tags") && nextTags.length && !areSameStringLists(nextTags, bookmark.tags)) {
    return true;
  }

  const nextLanguageCodes = normalizeBookmarkLanguageCodes(request.languageCodes);
  if (
    !excludedFields.has("languageCodes")
    && nextLanguageCodes.length
    && !areSameStringLists(nextLanguageCodes, bookmark.languageCodes ?? [])
  ) {
    return true;
  }

  return false;
};

export const buildScraperBookmarkRequestFromRecord = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null | undefined,
): SaveScraperBookmarkRequest => ({
  scraperId: bookmark.scraperId,
  sourceUrl: bookmark.sourceUrl,
  title: bookmark.title,
  cover: bookmark.cover,
  summary: bookmark.summary,
  description: bookmark.description,
  authors: bookmark.authors,
  tags: bookmark.tags,
  mangaStatus: bookmark.mangaStatus,
  pageCount: bookmark.pageCount,
  languageCodes: getScraperBookmarkLanguageCodes(bookmark, scraper),
  excludedFields: scraper?.globalConfig.bookmark.excludedFields,
});

const applyScraperLanguageFallback = (
  request: SaveScraperBookmarkRequest,
  scraper: ScraperRecord,
): SaveScraperBookmarkRequest => {
  const excludedFields = new Set(normalizeBookmarkExcludedFields(request.excludedFields));
  const languageCodes = normalizeBookmarkLanguageCodes(request.languageCodes);
  const fallbackLanguageCodes = excludedFields.has("languageCodes") || languageCodes.length
    ? []
    : getScraperSingleSourceLanguageCodes(scraper);

  return fallbackLanguageCodes.length
    ? {
      ...request,
      languageCodes: fallbackLanguageCodes,
    }
    : request;
};

export const enrichScraperBookmarkRequestFromDetails = async (
  request: SaveScraperBookmarkRequest,
  scraperOverride?: ScraperRecord | null,
): Promise<SaveScraperBookmarkRequest> => {
  const scraper = scraperOverride ?? await loadScraperById(request.scraperId);
  if (!scraper) {
    return request;
  }

  const requestWithGlobalConfig: SaveScraperBookmarkRequest = {
    ...request,
    excludedFields: normalizeBookmarkExcludedFields(request.excludedFields).length
      ? normalizeBookmarkExcludedFields(request.excludedFields)
      : scraper.globalConfig.bookmark.excludedFields,
  };
  const requestWithLanguageFallback = applyScraperLanguageFallback(requestWithGlobalConfig, scraper);

  const detailsFeature = getScraperFeature(scraper, "details");
  if (!isScraperFeatureConfigured(detailsFeature)) {
    return requestWithLanguageFallback;
  }

  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);
  if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.titleSelector)) {
    return requestWithLanguageFallback;
  }

  const api = getApi();
  if (!api || typeof api.fetchScraperDocument !== "function") {
    return requestWithLanguageFallback;
  }

  try {
    const targetUrl = resolveScraperDetailsTargetUrl(
      scraper.baseUrl,
      detailsConfig,
      requestWithLanguageFallback.sourceUrl,
    );
    const documentResult = await api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!documentResult?.ok || !documentResult.html) {
      return requestWithLanguageFallback;
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, "text/html");
    const extractedDetails = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      html: documentResult.html,
    });

    if (!hasRenderableDetails(extractedDetails)) {
      return requestWithLanguageFallback;
    }

    const authors = normalizeBookmarkStringList(extractedDetails.authors);
    const tags = normalizeBookmarkStringList(extractedDetails.tags);
    const languageCodes = normalizeBookmarkLanguageCodes(extractedDetails.languageCodes);

    return {
      ...requestWithLanguageFallback,
      title: normalizeBookmarkOptionalText(extractedDetails.title) || requestWithLanguageFallback.title,
      cover: normalizeBookmarkOptionalText(extractedDetails.cover) || requestWithLanguageFallback.cover,
      description: normalizeBookmarkOptionalText(extractedDetails.description) || requestWithLanguageFallback.description,
      authors: authors.length ? authors : requestWithLanguageFallback.authors,
      tags: tags.length ? tags : requestWithLanguageFallback.tags,
      mangaStatus: normalizeBookmarkOptionalText(extractedDetails.mangaStatus) || requestWithLanguageFallback.mangaStatus,
      pageCount: normalizeBookmarkOptionalText(extractedDetails.pageCount) || requestWithLanguageFallback.pageCount,
      languageCodes: languageCodes.length ? languageCodes : requestWithLanguageFallback.languageCodes,
    };
  } catch (error) {
    console.warn("Failed to enrich scraper bookmark from details page", error);
    return requestWithLanguageFallback;
  }
};
