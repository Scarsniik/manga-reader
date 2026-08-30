import React from 'react';
import ScraperCard, { type ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import ScraperPotentialMangaMatches from '@/renderer/components/ScraperBrowser/components/ScraperPotentialMangaMatches';
import ScraperViewHistoryCard from '@/renderer/components/ScraperViewHistoryCard/ScraperViewHistoryCard';
import LanguageFlags from '@/renderer/components/LanguageFlags/LanguageFlags';
import { ScraperSearchResultItem, type ScraperViewHistoryRecord } from '@/shared/scraper';
import { DetailsCardIcon, ImageExpandIcon } from '@/renderer/components/icons';
import { buildSearchResultViewHistoryIdentity } from '@/renderer/utils/scraperViewHistory';
import { formatScraperPageCountForDisplay } from '@/renderer/utils/scraperRuntime';
import {
  getBlacklistedScraperTags,
  type ScraperTagBlacklistEntry,
} from '@/renderer/utils/scraperTagBlacklist';
import {
  getFavoriteScraperTags,
  normalizeScraperTagFavoriteValue,
  type ScraperTagFavoriteSourceTarget,
} from '@/renderer/utils/scraperTagFavorites';
import type { ScraperCardPotentialMatchResult } from '@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches';
import type { ScraperPotentialMangaMatch } from '@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes';
import { useScraperAuthorFavorites } from '@/renderer/stores/scraperAuthorFavorites';
import { getFavoriteScraperAuthors } from '@/renderer/utils/scraperAuthorFavorites';

type Props = {
  scraperId: string;
  result: ScraperSearchResultItem;
  canOpenResult: boolean;
  canOpenSearchResultsAsDetails: boolean;
  canOpenSearchResultsAsAuthor: boolean;
  canOpenSearchResultsAsSource: boolean;
  canResolveSourceName: boolean;
  canOpenAuthorResult: boolean;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistEntries?: ScraperTagBlacklistEntry[];
  tagFavoriteSources?: ScraperTagFavoriteSourceTarget[];
  viewHistoryRecordingDisabled?: boolean;
  readAction?: ScraperCardAction | null;
  bookmarkAction?: ScraperCardAction | null;
  addToLibraryAction?: ScraperCardAction | null;
  downloadAction?: ScraperCardAction | null;
  potentialMatches?: ScraperCardPotentialMatchResult | null;
  potentialMatchesLoading?: boolean;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onOpenAuthorResultAction: (result: ScraperSearchResultItem) => void;
  onOpenSource: (value: string, title: string) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (result: ScraperSearchResultItem) => void;
  onOpenResultImage: (result: ScraperSearchResultItem) => void;
  onOpenResultInWorkspace?: (result: ScraperSearchResultItem) => void;
  onOpenAuthorInWorkspace?: (result: ScraperSearchResultItem) => void;
  onOpenPotentialMatch?: (match: ScraperPotentialMangaMatch) => void;
  onOpenPotentialMatchInWorkspace?: (match: ScraperPotentialMangaMatch) => void;
};

export default function ScraperSearchResultCard({
  scraperId,
  result,
  canOpenResult,
  canOpenSearchResultsAsDetails,
  canOpenSearchResultsAsAuthor,
  canOpenSearchResultsAsSource,
  canResolveSourceName,
  canOpenAuthorResult,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistEntries = [],
  tagFavoriteSources = [],
  viewHistoryRecordingDisabled = false,
  readAction,
  bookmarkAction,
  addToLibraryAction,
  downloadAction,
  potentialMatches,
  potentialMatchesLoading = false,
  onOpenResult,
  onOpenAuthorResultAction,
  onOpenSource,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
  onOpenResultInWorkspace,
  onOpenAuthorInWorkspace,
  onOpenPotentialMatch,
  onOpenPotentialMatchInWorkspace,
}: Props) {
  const actions: ScraperCardAction[] = [];
  const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);
  const hasLanguageCodes = Boolean(result.languageCodes?.length);
  const { favorites: authorFavorites } = useScraperAuthorFavorites();
  const favoriteAuthorMatches = React.useMemo(() => getFavoriteScraperAuthors(
    authorFavorites,
    scraperId,
    result.authorNames,
    result.authorUrls ?? (result.authorUrl ? [result.authorUrl] : []),
  ), [authorFavorites, result.authorNames, result.authorUrl, result.authorUrls, scraperId]);
  const sourceEntries = React.useMemo(() => (
    (result.sourceNames ?? []).map((name, index) => ({
      name,
      url: result.sourceUrls?.[index],
    }))
  ), [result.sourceNames, result.sourceUrls]);
  const blacklistedTagMatches = React.useMemo(
    () => getBlacklistedScraperTags(tagBlacklistEntries, result.tags, result.tagUrls),
    [result.tagUrls, result.tags, tagBlacklistEntries],
  );
  const favoriteTagMatches = React.useMemo(
    () => getFavoriteScraperTags(tagFavoriteSources, result.tags, result.tagUrls),
    [result.tagUrls, result.tags, tagFavoriteSources],
  );
  const visibleFavoriteTagMatches = React.useMemo(() => {
    const blacklistedTagKeys = new Set(blacklistedTagMatches.map((match) => (
      normalizeScraperTagFavoriteValue(match.tagUrl || match.tag)
    )));

    return favoriteTagMatches.filter((match) => (
      !blacklistedTagKeys.has(normalizeScraperTagFavoriteValue(match.tagUrl || match.tag))
    ));
  }, [blacklistedTagMatches, favoriteTagMatches]);
  const hasBlacklistedTags = blacklistedTagMatches.length > 0;
  const hasFavoriteTags = visibleFavoriteTagMatches.length > 0;
  const viewHistoryIdentities = React.useMemo(
    () => [buildSearchResultViewHistoryIdentity(scraperId, result)],
    [result, scraperId],
  );

  if (readAction) {
    actions.push(readAction);
  }

  if (bookmarkAction) {
    actions.push(bookmarkAction);
  }

  if (addToLibraryAction) {
    actions.push(addToLibraryAction);
  }

  if (downloadAction) {
    actions.push(downloadAction);
  }

  if (canOpenResult) {
    actions.push({
      id: 'open-details',
      type: 'icon-primary',
      label: 'Ouvrir la fiche',
      icon: <DetailsCardIcon aria-hidden="true" focusable="false" />,
      onClick: () => onOpenResultAction(result),
    });
  } else if (result.detailUrl && !canOpenSearchResultsAsDetails) {
    actions.push({
      id: 'details-disabled',
      type: 'hint',
      label: 'Configure `Fiche` pour ouvrir',
    });
  }

  if (canOpenAuthorResult) {
    actions.push({
      id: 'open-author',
      type: 'secondary',
      label: 'Auteur',
      onClick: () => onOpenAuthorResultAction(result),
      onMiddleClick: onOpenAuthorInWorkspace ? () => onOpenAuthorInWorkspace(result) : undefined,
    });
  } else if (result.authorUrl && !canOpenSearchResultsAsAuthor) {
    actions.push({
      id: 'author-disabled',
      type: 'hint',
      label: 'Configure `Auteur` pour ouvrir',
    });
  }

  if (result.thumbnailUrl) {
    actions.push({
      id: 'preview-image',
      type: 'icon-secondary',
      label: 'Agrandir l\'image',
      icon: <ImageExpandIcon aria-hidden="true" focusable="false" />,
      onClick: () => onOpenResultImage(result),
    });
  }

  return (
    <ScraperViewHistoryCard
      identities={viewHistoryIdentities}
      recordsById={viewHistoryRecordsById}
      newCardIds={newViewHistoryIds}
      recordingDisabled={viewHistoryRecordingDisabled}
    >
      {({ historyClassName, onViewed }) => (
        <ScraperCard
          title={result.title}
          coverUrl={result.thumbnailUrl}
          coverAlt={result.title}
          summary={result.summary}
          metadata={pageCountLabel || hasLanguageCodes || hasBlacklistedTags || hasFavoriteTags
            || sourceEntries.length || favoriteAuthorMatches.length ? (
            <div className="scraper-card__metadata">
              {hasLanguageCodes ? (
                <span>
                  Langue <LanguageFlags languageCodes={result.languageCodes} />
                </span>
              ) : null}
              {pageCountLabel ? <span>{pageCountLabel}</span> : null}
              {sourceEntries.map((source, index) => {
                const target = source.url || source.name;
                const canOpenSource = canOpenSearchResultsAsSource && Boolean(
                  source.url || (canResolveSourceName && source.name),
                );
                return canOpenSource && target ? (
                  <button
                    key={`${target}-${index}`}
                    type="button"
                    className="scraper-card__chip is-source is-clickable"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenSource(target, source.name);
                    }}
                  >
                    {source.name}
                  </button>
                ) : (
                  <span
                    key={`${target}-${index}`}
                    className="scraper-card__chip is-source"
                    title={`Source : ${source.name}`}
                  >
                    {source.name}
                  </span>
                );
              })}
              {favoriteAuthorMatches.map((match) => (
                <span
                  key={match.favorite.id}
                  className="scraper-card__chip is-author is-favorite-author"
                  title={`Auteur favori : ${match.favorite.name}`}
                >
                  {match.name}
                </span>
              ))}
              {visibleFavoriteTagMatches.map((match, index) => (
                <span
                  key={`${match.source.tagUrl}-${match.tagUrl || match.tag}-${index}`}
                  className="is-favorite-tag"
                  title="Tag favori pour ce scraper"
                >
                  {match.tag}
                </span>
              ))}
              {blacklistedTagMatches.map((match, index) => (
                <span
                  key={`${match.entry.value}-${match.tagUrl || match.tag}-${index}`}
                  className="is-blacklisted-tag"
                  title="Tag blackliste pour ce scraper"
                >
                  {match.tag}
                </span>
              ))}
            </div>
          ) : undefined}
          notice={potentialMatches && onOpenPotentialMatch && onOpenPotentialMatchInWorkspace ? (
            <ScraperPotentialMangaMatches
              readingMatches={potentialMatches.readingMatches}
              bookmarkMatches={potentialMatches.bookmarkMatches}
              readingListMatches={potentialMatches.readingListMatches}
              fallbackCover={result.thumbnailUrl}
              fallbackCoverReferer={result.detailUrl}
              loading={potentialMatchesLoading}
              mode="combined"
              showCategoryLabels
              portalMenus
              onOpenMatch={onOpenPotentialMatch}
              onOpenMatchInWorkspace={onOpenPotentialMatchInWorkspace}
            />
          ) : undefined}
          actions={actions}
          className={[
            historyClassName,
            hasBlacklistedTags ? 'is-tag-blacklisted' : '',
          ].join(' ').trim()}
          isActionable={canOpenResult}
          onClick={canOpenResult ? () => onOpenResult(result) : undefined}
          onKeyDown={canOpenResult ? (event) => onResultKeyDown(event, result) : undefined}
          onMiddleClick={
            canOpenResult && onOpenResultInWorkspace
              ? () => onOpenResultInWorkspace(result)
              : canOpenAuthorResult && onOpenAuthorInWorkspace
                ? () => onOpenAuthorInWorkspace(result)
                : undefined
          }
          onViewed={onViewed}
          ariaLabel={canOpenResult ? `Ouvrir la fiche ${result.title}` : undefined}
        />
      )}
    </ScraperViewHistoryCard>
  );
}
