import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ScraperBookmarkMetadataField,
  SaveScraperBookmarkRequest,
  ScraperBookmarkRecord,
  ScraperRecord,
} from '@/shared/scraper';
import {
  removeScraperBookmark,
  saveScraperBookmark,
  useScraperBookmark,
} from '@/renderer/stores/scraperBookmarks';
import {
  extractScraperDetailsFromDocument,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  hasRenderableDetails,
  isScraperFeatureConfigured,
  resolveScraperDetailsTargetUrl,
} from '@/renderer/utils/scraperRuntime';
import './style.scss';

type Props = {
  scraperId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  cover?: string | null;
  summary?: string | null;
  description?: string | null;
  authors?: string[];
  tags?: string[];
  mangaStatus?: string | null;
  excludedFields?: ScraperBookmarkMetadataField[];
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  autoSyncWhenBookmarked?: boolean;
  stopPropagation?: boolean;
};

const normalizeOptional = (value: string | null | undefined): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
};

const normalizeStringList = (values: string[] | undefined): string[] => (
  Array.isArray(values)
    ? Array.from(new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0),
    ))
    : []
);

const BOOKMARK_METADATA_FIELDS = new Set<ScraperBookmarkMetadataField>([
  'cover',
  'summary',
  'description',
  'authors',
  'tags',
  'mangaStatus',
]);

const normalizeExcludedFields = (values: ScraperBookmarkMetadataField[] | undefined): ScraperBookmarkMetadataField[] => (
  Array.isArray(values)
    ? Array.from(new Set(
      values.filter((value): value is ScraperBookmarkMetadataField => (
        BOOKMARK_METADATA_FIELDS.has(String(value ?? '').trim() as ScraperBookmarkMetadataField)
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
  if (field === 'authors' || field === 'tags') {
    return bookmark[field].length > 0;
  }

  return Boolean(bookmark[field]);
};

const shouldSyncBookmarkMetadata = (
  bookmark: ScraperBookmarkRecord | null,
  request: SaveScraperBookmarkRequest,
): boolean => {
  if (!bookmark) {
    return false;
  }

  const excludedFields = new Set(normalizeExcludedFields(request.excludedFields));

  if (Array.from(excludedFields).some((field) => bookmarkHasExcludedFieldData(bookmark, field))) {
    return true;
  }

  const nextTitle = normalizeOptional(request.title);
  if (nextTitle && nextTitle !== bookmark.title) {
    return true;
  }

  const nextCover = normalizeOptional(request.cover);
  if (!excludedFields.has('cover') && nextCover && nextCover !== bookmark.cover) {
    return true;
  }

  const nextSummary = normalizeOptional(request.summary);
  if (!excludedFields.has('summary') && nextSummary && nextSummary !== bookmark.summary) {
    return true;
  }

  const nextDescription = normalizeOptional(request.description);
  if (!excludedFields.has('description') && nextDescription && nextDescription !== bookmark.description) {
    return true;
  }

  const nextMangaStatus = normalizeOptional(request.mangaStatus);
  if (!excludedFields.has('mangaStatus') && nextMangaStatus && nextMangaStatus !== bookmark.mangaStatus) {
    return true;
  }

  const nextAuthors = normalizeStringList(request.authors);
  if (!excludedFields.has('authors') && nextAuthors.length && !areSameStringLists(nextAuthors, bookmark.authors)) {
    return true;
  }

  const nextTags = normalizeStringList(request.tags);
  if (!excludedFields.has('tags') && nextTags.length && !areSameStringLists(nextTags, bookmark.tags)) {
    return true;
  }

  return false;
};

let scrapersCache: ScraperRecord[] | null = null;
let scrapersCachePromise: Promise<ScraperRecord[]> | null = null;
let hasBoundScrapersCacheInvalidation = false;

const getApi = (): any => (
  typeof window !== 'undefined' ? (window as any).api : null
);

const invalidateScrapersCache = () => {
  scrapersCache = null;
  scrapersCachePromise = null;
};

const bindScrapersCacheInvalidation = () => {
  if (hasBoundScrapersCacheInvalidation || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('scrapers-updated', invalidateScrapersCache as EventListener);
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
  if (!api || typeof api.getScrapers !== 'function') {
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

const enrichBookmarkRequestFromDetails = async (
  request: SaveScraperBookmarkRequest,
): Promise<SaveScraperBookmarkRequest> => {
  const scraper = await loadScraperById(request.scraperId);
  if (!scraper) {
    return request;
  }

  const requestWithGlobalConfig: SaveScraperBookmarkRequest = {
    ...request,
    excludedFields: normalizeExcludedFields(request.excludedFields).length
      ? normalizeExcludedFields(request.excludedFields)
      : scraper.globalConfig.bookmark.excludedFields,
  };

  const detailsFeature = getScraperFeature(scraper, 'details');
  if (!isScraperFeatureConfigured(detailsFeature)) {
    return requestWithGlobalConfig;
  }

  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);
  if (!detailsConfig?.titleSelector) {
    return requestWithGlobalConfig;
  }

  const api = getApi();
  if (!api || typeof api.fetchScraperDocument !== 'function') {
    return requestWithGlobalConfig;
  }

  try {
    const targetUrl = resolveScraperDetailsTargetUrl(
      scraper.baseUrl,
      detailsConfig,
      requestWithGlobalConfig.sourceUrl,
    );
    const documentResult = await api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!documentResult?.ok || !documentResult.html) {
      return requestWithGlobalConfig;
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    const extractedDetails = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      html: documentResult.html,
    });

    if (!hasRenderableDetails(extractedDetails)) {
      return requestWithGlobalConfig;
    }

    return {
      ...requestWithGlobalConfig,
      title: normalizeOptional(extractedDetails.title) || requestWithGlobalConfig.title,
      cover: normalizeOptional(extractedDetails.cover) || requestWithGlobalConfig.cover,
      description: normalizeOptional(extractedDetails.description) || requestWithGlobalConfig.description,
      authors: normalizeStringList(extractedDetails.authors).length
        ? normalizeStringList(extractedDetails.authors)
        : requestWithGlobalConfig.authors,
      tags: normalizeStringList(extractedDetails.tags).length
        ? normalizeStringList(extractedDetails.tags)
        : requestWithGlobalConfig.tags,
      mangaStatus: normalizeOptional(extractedDetails.mangaStatus) || requestWithGlobalConfig.mangaStatus,
    };
  } catch (error) {
    console.warn('Failed to enrich scraper bookmark from details page', error);
    return requestWithGlobalConfig;
  }
};

export default function ScraperBookmarkButton({
  scraperId,
  sourceUrl,
  title,
  cover,
  summary,
  description,
  authors,
  tags,
  mangaStatus,
  excludedFields,
  className = '',
  size = 'md',
  disabled = false,
  autoSyncWhenBookmarked = true,
  stopPropagation = true,
}: Props) {
  const normalizedScraperId = String(scraperId ?? '').trim();
  const normalizedSourceUrl = String(sourceUrl ?? '').trim();
  const normalizedTitle = normalizeOptional(title) || normalizeOptional(sourceUrl) || 'Bookmark';
  const normalizedAuthors = useMemo(() => normalizeStringList(authors), [authors]);
  const normalizedTags = useMemo(() => normalizeStringList(tags), [tags]);
  const normalizedExcludedFields = useMemo(() => normalizeExcludedFields(excludedFields), [excludedFields]);
  const bookmarkRequest = useMemo<SaveScraperBookmarkRequest | null>(() => {
    if (!normalizedScraperId || !normalizedSourceUrl) {
      return null;
    }

    return {
      scraperId: normalizedScraperId,
      sourceUrl: normalizedSourceUrl,
      title: normalizedTitle,
      cover: normalizeOptional(cover),
      summary: normalizeOptional(summary),
      description: normalizeOptional(description),
      authors: normalizedAuthors,
      tags: normalizedTags,
      mangaStatus: normalizeOptional(mangaStatus),
      excludedFields: normalizedExcludedFields,
    };
  }, [
    cover,
    description,
    normalizedExcludedFields,
    mangaStatus,
    normalizedAuthors,
    normalizedScraperId,
    normalizedSourceUrl,
    normalizedTags,
    normalizedTitle,
    summary,
  ]);
  const { bookmark, isBookmarked } = useScraperBookmark(normalizedScraperId, normalizedSourceUrl);
  const [pending, setPending] = useState(false);
  const syncInFlightRef = useRef(false);

  const label = isBookmarked
    ? `Retirer ${normalizedTitle} des bookmarks`
    : `Ajouter ${normalizedTitle} aux bookmarks`;

  useEffect(() => {
    if (!autoSyncWhenBookmarked || !bookmarkRequest || !isBookmarked || syncInFlightRef.current) {
      return;
    }

    if (!shouldSyncBookmarkMetadata(bookmark, bookmarkRequest)) {
      return;
    }

    let cancelled = false;
    syncInFlightRef.current = true;

    void (async () => {
      try {
        await saveScraperBookmark(bookmarkRequest);
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to sync scraper bookmark metadata', error);
        }
      } finally {
        syncInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoSyncWhenBookmarked, bookmark, bookmarkRequest, isBookmarked]);

  const handleToggle = useCallback(async (
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    if (!bookmarkRequest || disabled || pending) {
      return;
    }

    setPending(true);

    try {
      if (isBookmarked) {
        await removeScraperBookmark({
          scraperId: bookmarkRequest.scraperId,
          sourceUrl: bookmarkRequest.sourceUrl,
        });
      } else {
        const enrichedBookmarkRequest = await enrichBookmarkRequestFromDetails(bookmarkRequest);
        await saveScraperBookmark(enrichedBookmarkRequest);
      }
    } catch (error) {
      console.error('Failed to toggle scraper bookmark', error);
    } finally {
      setPending(false);
    }
  }, [bookmarkRequest, disabled, isBookmarked, pending, stopPropagation]);

  if (!bookmarkRequest) {
    return null;
  }

  return (
    <button
      type="button"
      className={[
        'scraper-bookmark-button',
        `is-${size}`,
        isBookmarked ? 'is-bookmarked' : '',
        pending ? 'is-pending' : '',
        className,
      ].join(' ').trim()}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
      aria-label={label}
      title={label}
      aria-pressed={isBookmarked}
      aria-busy={pending}
      disabled={disabled || pending}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.75 3.75h10.5A1.75 1.75 0 0 1 19 5.5v14.629a.75.75 0 0 1-1.196.604L12 16.45l-5.804 4.283A.75.75 0 0 1 5 20.129V5.5a1.75 1.75 0 0 1 1.75-1.75Z" />
      </svg>
      {pending ? (
        <svg
          className="scraper-bookmark-button__spinner"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="scraper-bookmark-button__spinner-track" cx="12" cy="12" r="7" />
          <path className="scraper-bookmark-button__spinner-head" d="M12 5a7 7 0 0 1 7 7" />
        </svg>
      ) : null}
    </button>
  );
}
