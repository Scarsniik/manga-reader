import React from 'react';
import ScraperCard, { type ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import { DetailsCardIcon } from '@/renderer/components/icons';
import LanguageFlags from '@/renderer/components/LanguageFlags/LanguageFlags';
import type { ScraperBookmarkRecord, ScraperRecord } from '@/shared/scraper';
import type { ScraperCardViewState } from '@/renderer/utils/scraperViewHistory';
import { buildRemoteThumbnailUrl } from '@/renderer/utils/remoteThumbnails';
import { formatScraperPageCountForDisplay } from '@/renderer/utils/scraperRuntime';
import {
  getBlacklistedScraperTags,
  normalizeScraperTagBlacklistValue,
  type ScraperTagBlacklistEntry,
} from '@/renderer/utils/scraperTagBlacklist';
import {
  getFavoriteScraperTags,
  normalizeScraperTagFavoriteValue,
  type ScraperTagFavoriteSourceTarget,
} from '@/renderer/utils/scraperTagFavorites';

type Props = {
  bookmark: ScraperBookmarkRecord;
  scraper?: ScraperRecord | null;
  languageCodes?: string[];
  viewState: ScraperCardViewState;
  readAction?: ScraperCardAction | null;
  addToLibraryAction?: ScraperCardAction | null;
  downloadAction?: ScraperCardAction | null;
  tagBlacklistEntries?: ScraperTagBlacklistEntry[];
  tagFavoriteSources?: ScraperTagFavoriteSourceTarget[];
  onOpenBookmark: (bookmark: ScraperBookmarkRecord) => void;
  onOpenBookmarkInWorkspace?: (bookmark: ScraperBookmarkRecord) => void;
  onViewed?: (bookmark: ScraperBookmarkRecord) => void;
};

const renderChipGroup = (
  values: string[],
  variant: 'author' | 'tag',
  blacklistedTagKeys?: Set<string>,
  favoriteTagKeys?: Set<string>,
) => {
  if (!values.length) {
    return null;
  }

  return (
    <div className="scraper-card__chips">
      {values.map((value) => (
        <span
          key={value}
          className={[
            'scraper-card__chip',
            `is-${variant}`,
            favoriteTagKeys?.has(normalizeScraperTagFavoriteValue(value)) ? 'is-favorite-tag' : '',
            blacklistedTagKeys?.has(normalizeScraperTagBlacklistValue(value)) ? 'is-blacklisted-tag' : '',
          ].filter(Boolean).join(' ')}
          title={blacklistedTagKeys?.has(normalizeScraperTagBlacklistValue(value))
            ? 'Tag blackliste'
            : favoriteTagKeys?.has(normalizeScraperTagFavoriteValue(value))
              ? 'Tag favori'
              : undefined}
        >
          {value}
        </span>
      ))}
    </div>
  );
};

const buildBookmarkCoverUrls = (
  coverUrl?: string | null,
  refererUrl?: string | null,
): string[] => {
  const normalizedCoverUrl = String(coverUrl ?? '').trim();
  if (!normalizedCoverUrl) {
    return [];
  }

  return [
    buildRemoteThumbnailUrl(normalizedCoverUrl, refererUrl),
    normalizedCoverUrl,
  ].reduce<string[]>((urls, url) => {
    const normalizedUrl = String(url ?? '').trim();
    if (normalizedUrl && !urls.includes(normalizedUrl)) {
      urls.push(normalizedUrl);
    }

    return urls;
  }, []);
};

export default function ScraperBookmarkCard({
  bookmark,
  scraper = null,
  languageCodes = [],
  viewState,
  readAction = null,
  addToLibraryAction = null,
  downloadAction = null,
  tagBlacklistEntries = [],
  tagFavoriteSources = [],
  onOpenBookmark,
  onOpenBookmarkInWorkspace,
  onViewed,
}: Props) {
  const canOpenBookmark = Boolean(scraper);
  const pageCountLabel = formatScraperPageCountForDisplay(bookmark.pageCount);
  const coverUrls = React.useMemo(() => (
    buildBookmarkCoverUrls(bookmark.cover, bookmark.sourceUrl || scraper?.baseUrl)
  ), [bookmark.cover, bookmark.sourceUrl, scraper?.baseUrl]);
  const coverUrlsKey = coverUrls.join('\n');
  const [coverIndex, setCoverIndex] = React.useState(0);
  const activeCoverUrl = coverIndex < coverUrls.length ? coverUrls[coverIndex] : null;
  const blacklistedTagMatches = React.useMemo(
    () => getBlacklistedScraperTags(tagBlacklistEntries, bookmark.tags),
    [bookmark.tags, tagBlacklistEntries],
  );
  const blacklistedTagKeys = React.useMemo(
    () => new Set(blacklistedTagMatches.map((match) => normalizeScraperTagBlacklistValue(match.tag))),
    [blacklistedTagMatches],
  );
  const favoriteTagMatches = React.useMemo(
    () => getFavoriteScraperTags(tagFavoriteSources, bookmark.tags),
    [bookmark.tags, tagFavoriteSources],
  );
  const favoriteTagKeys = React.useMemo(
    () => new Set(favoriteTagMatches.map((match) => normalizeScraperTagFavoriteValue(match.tag))),
    [favoriteTagMatches],
  );
  const hasBlacklistedTags = blacklistedTagMatches.length > 0;
  const actions: ScraperCardAction[] = [
    ...(readAction ? [readAction] : []),
    {
      id: 'bookmark-toggle',
      type: 'custom',
      label: 'Basculer le bookmark',
      render: () => (
        <ScraperBookmarkButton
          scraperId={bookmark.scraperId}
          sourceUrl={bookmark.sourceUrl}
          title={bookmark.title}
          cover={bookmark.cover}
          summary={bookmark.summary}
          description={bookmark.description}
          authors={bookmark.authors}
          tags={bookmark.tags}
          mangaStatus={bookmark.mangaStatus}
          pageCount={bookmark.pageCount}
          languageCodes={languageCodes}
          excludedFields={scraper?.globalConfig.bookmark.excludedFields}
          size="sm"
          autoSyncWhenBookmarked={false}
        />
      ),
    },
    ...(addToLibraryAction ? [addToLibraryAction] : []),
    ...(downloadAction ? [downloadAction] : []),
    canOpenBookmark
      ? {
        id: 'open-details',
        type: 'icon-primary',
        label: 'Ouvrir la fiche',
        icon: <DetailsCardIcon aria-hidden="true" focusable="false" />,
        onClick: () => onOpenBookmark(bookmark),
      }
      : {
        id: 'scraper-unavailable',
        type: 'hint',
        label: 'Scrapper indisponible',
      },
  ];

  React.useEffect(() => {
    setCoverIndex(0);
  }, [coverUrlsKey]);

  return (
    <ScraperCard
      title={bookmark.title}
      coverUrl={activeCoverUrl}
      coverAlt={bookmark.title}
      eyebrow={(
        <span className="scraper-bookmarks-view__scraper-label">
          {scraper?.name || `Scrapper indisponible (${bookmark.scraperId})`}
        </span>
      )}
      summary={bookmark.description || bookmark.summary}
      metadata={(
        <>
          {pageCountLabel ? (
            <div className="scraper-card__metadata">
              <span>{pageCountLabel}</span>
            </div>
          ) : null}
          {languageCodes.length ? (
            <div className="scraper-card__metadata">
              <span>Langue <LanguageFlags languageCodes={languageCodes} /></span>
            </div>
          ) : null}
          {renderChipGroup(bookmark.authors, 'author')}
          {renderChipGroup(bookmark.tags, 'tag', blacklistedTagKeys, favoriteTagKeys)}
        </>
      )}
      actions={actions}
      className={[
        'scraper-bookmarks-view__card',
        viewState === 'read' ? 'is-history-read' : viewState === 'new' ? 'is-history-new' : '',
        hasBlacklistedTags ? 'is-tag-blacklisted' : '',
      ].join(' ').trim()}
      isActionable={canOpenBookmark}
      onClick={canOpenBookmark ? () => onOpenBookmark(bookmark) : undefined}
      onMiddleClick={canOpenBookmark && onOpenBookmarkInWorkspace ? () => onOpenBookmarkInWorkspace(bookmark) : undefined}
      onKeyDown={canOpenBookmark ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        onOpenBookmark(bookmark);
      } : undefined}
      onViewed={onViewed ? () => onViewed(bookmark) : undefined}
      onCoverError={() => setCoverIndex((currentIndex) => currentIndex + 1)}
      ariaLabel={canOpenBookmark ? `Ouvrir la fiche ${bookmark.title}` : undefined}
    />
  );
}
