import {
  buildScraperViewHistoryCardId,
  type ScraperBookmarkRecord,
  type ScraperSearchResultItem,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
} from '@/shared/scraper';

export type ScraperCardViewState = 'new' | 'seen' | 'read';

export const buildSearchResultViewHistoryIdentity = (
  scraperId: string,
  result: ScraperSearchResultItem,
): ScraperViewHistoryCardIdentity => ({
  scraperId,
  sourceUrl: result.detailUrl || result.authorUrl || undefined,
  title: result.title,
  thumbnailUrl: result.thumbnailUrl,
});

export const buildBookmarkViewHistoryIdentity = (
  bookmark: ScraperBookmarkRecord,
): ScraperViewHistoryCardIdentity => ({
  scraperId: bookmark.scraperId,
  sourceUrl: bookmark.sourceUrl,
  title: bookmark.title,
  thumbnailUrl: bookmark.cover,
});

export const getScraperViewHistoryRecord = (
  recordsById: Map<string, ScraperViewHistoryRecord>,
  identity: ScraperViewHistoryCardIdentity,
): ScraperViewHistoryRecord | null => {
  const id = buildScraperViewHistoryCardId(identity);
  return id ? recordsById.get(id) ?? null : null;
};

export const getScraperCardViewState = (
  record: ScraperViewHistoryRecord | null | undefined,
  isNewInCurrentList: boolean,
): ScraperCardViewState => {
  if (record?.readAt) {
    return 'read';
  }

  if (isNewInCurrentList) {
    return 'new';
  }

  return record ? 'seen' : 'new';
};
