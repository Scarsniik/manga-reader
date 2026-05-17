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

export const getUniqueScraperViewHistoryIdentities = (
  identities: ScraperViewHistoryCardIdentity[],
): ScraperViewHistoryCardIdentity[] => {
  const seenIds = new Set<string>();

  return identities.reduce<ScraperViewHistoryCardIdentity[]>((uniqueIdentities, identity) => {
    const id = buildScraperViewHistoryCardId(identity);
    if (!id || seenIds.has(id)) {
      return uniqueIdentities;
    }

    seenIds.add(id);
    uniqueIdentities.push(identity);
    return uniqueIdentities;
  }, []);
};

export const getScraperCardsViewState = (
  recordsById: Map<string, ScraperViewHistoryRecord>,
  identities: ScraperViewHistoryCardIdentity[],
  newCardIds: Set<string>,
): ScraperCardViewState => {
  const states = getUniqueScraperViewHistoryIdentities(identities).map((identity) => {
    const id = buildScraperViewHistoryCardId(identity);
    const record = id ? recordsById.get(id) ?? null : null;
    return getScraperCardViewState(record, Boolean(id && newCardIds.has(id)));
  });

  if (!states.length) {
    return 'seen';
  }

  if (states.includes('new')) {
    return 'new';
  }

  if (states.every((state) => state === 'read')) {
    return 'read';
  }

  return 'seen';
};

export const getScraperCardViewStateClassName = (
  viewState: ScraperCardViewState,
): string => (
  viewState === 'read'
    ? 'is-history-read'
    : viewState === 'new'
      ? 'is-history-new'
      : ''
);

export const isScraperViewHistoryCardNew = (
  recordsById: Map<string, ScraperViewHistoryRecord>,
  identities: ScraperViewHistoryCardIdentity[],
  newCardIds: Set<string>,
): boolean => getScraperCardsViewState(recordsById, identities, newCardIds) === 'new';

export const sortByScraperViewHistoryNewState = <T,>(
  items: T[],
  getIdentities: (item: T) => ScraperViewHistoryCardIdentity[],
  recordsById: Map<string, ScraperViewHistoryRecord>,
  newCardIds: Set<string>,
  enabled: boolean,
): T[] => {
  if (!enabled) {
    return items;
  }

  return items
    .map((item, index) => ({
      item,
      index,
      isNew: isScraperViewHistoryCardNew(recordsById, getIdentities(item), newCardIds),
    }))
    .sort((left, right) => {
      if (left.isNew !== right.isNew) {
        return left.isNew ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
};
