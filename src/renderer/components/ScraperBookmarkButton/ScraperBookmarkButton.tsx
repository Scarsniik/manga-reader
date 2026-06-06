import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ScraperBookmarkMetadataField,
  SaveScraperBookmarkRequest,
} from '@/shared/scraper';
import {
  removeScraperBookmark,
  saveScraperBookmark,
  useScraperBookmark,
} from '@/renderer/stores/scraperBookmarks';
import {
  enrichScraperBookmarkRequestFromDetails as enrichBookmarkRequestFromDetails,
  normalizeBookmarkExcludedFields as normalizeExcludedFields,
  normalizeBookmarkLanguageCodes as normalizeLanguageCodes,
  normalizeBookmarkOptionalText as normalizeOptional,
  normalizeBookmarkStringList as normalizeStringList,
  shouldSyncBookmarkMetadata,
} from '@/renderer/utils/scraperBookmarkMetadata';
import { BookmarkRibbonIcon, LoadingSpinnerIcon } from '@/renderer/components/icons';
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
  pageCount?: string | null;
  languageCodes?: string[];
  excludedFields?: ScraperBookmarkMetadataField[];
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  autoSyncWhenBookmarked?: boolean;
  stopPropagation?: boolean;
  onBeforeToggle?: (nextIsBookmarked: boolean, proceed: () => void) => void;
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
  pageCount,
  languageCodes,
  excludedFields,
  className = '',
  size = 'md',
  disabled = false,
  autoSyncWhenBookmarked = true,
  stopPropagation = true,
  onBeforeToggle,
}: Props) {
  const normalizedScraperId = String(scraperId ?? '').trim();
  const normalizedSourceUrl = String(sourceUrl ?? '').trim();
  const normalizedTitle = normalizeOptional(title) || normalizeOptional(sourceUrl) || 'Bookmark';
  const normalizedAuthors = useMemo(() => normalizeStringList(authors), [authors]);
  const normalizedTags = useMemo(() => normalizeStringList(tags), [tags]);
  const normalizedLanguageCodes = useMemo(() => normalizeLanguageCodes(languageCodes), [languageCodes]);
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
      pageCount: normalizeOptional(pageCount),
      languageCodes: normalizedLanguageCodes,
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
    normalizedLanguageCodes,
    normalizedTitle,
    pageCount,
    summary,
  ]);
  const { bookmark, isBookmarked } = useScraperBookmark(normalizedScraperId, normalizedSourceUrl);
  const [pending, setPending] = useState(false);
  const syncInFlightRef = useRef(false);
  const skipNextAutoSyncRef = useRef(false);

  const label = isBookmarked
    ? `Retirer ${normalizedTitle} des bookmarks`
    : `Ajouter ${normalizedTitle} aux bookmarks`;

  useEffect(() => {
    if (!autoSyncWhenBookmarked || !bookmarkRequest || !isBookmarked || syncInFlightRef.current) {
      return;
    }

    if (skipNextAutoSyncRef.current) {
      skipNextAutoSyncRef.current = false;
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

  const runToggle = useCallback(async () => {
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
        skipNextAutoSyncRef.current = true;
        await saveScraperBookmark(enrichedBookmarkRequest);
      }
    } catch (error) {
      skipNextAutoSyncRef.current = false;
      console.error('Failed to toggle scraper bookmark', error);
    } finally {
      setPending(false);
    }
  }, [bookmarkRequest, disabled, isBookmarked, pending]);

  const handleToggle = useCallback((
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    if (!bookmarkRequest || disabled || pending) {
      return;
    }

    if (onBeforeToggle) {
      onBeforeToggle(!isBookmarked, () => {
        void runToggle();
      });
      return;
    }

    void runToggle();
  }, [bookmarkRequest, disabled, isBookmarked, onBeforeToggle, pending, runToggle, stopPropagation]);

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
      <BookmarkRibbonIcon aria-hidden="true" focusable="false" />
      {pending ? (
        <LoadingSpinnerIcon
          className="scraper-bookmark-button__spinner"
          aria-hidden="true"
          focusable="false"
        />
      ) : null}
    </button>
  );
}
