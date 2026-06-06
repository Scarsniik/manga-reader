import React from 'react';
import ScraperCard, { type ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
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

type Props = {
  scraperId: string;
  result: ScraperSearchResultItem;
  canOpenResult: boolean;
  canOpenSearchResultsAsDetails: boolean;
  canOpenSearchResultsAsAuthor: boolean;
  canOpenAuthorResult: boolean;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistEntries?: ScraperTagBlacklistEntry[];
  viewHistoryRecordingDisabled?: boolean;
  readAction?: ScraperCardAction | null;
  bookmarkAction?: ScraperCardAction | null;
  addToLibraryAction?: ScraperCardAction | null;
  downloadAction?: ScraperCardAction | null;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onOpenAuthorResultAction: (result: ScraperSearchResultItem) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (result: ScraperSearchResultItem) => void;
  onOpenResultImage: (result: ScraperSearchResultItem) => void;
  onOpenResultInWorkspace?: (result: ScraperSearchResultItem) => void;
  onOpenAuthorInWorkspace?: (result: ScraperSearchResultItem) => void;
};

export default function ScraperSearchResultCard({
  scraperId,
  result,
  canOpenResult,
  canOpenSearchResultsAsDetails,
  canOpenSearchResultsAsAuthor,
  canOpenAuthorResult,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistEntries = [],
  viewHistoryRecordingDisabled = false,
  readAction,
  bookmarkAction,
  addToLibraryAction,
  downloadAction,
  onOpenResult,
  onOpenAuthorResultAction,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
  onOpenResultInWorkspace,
  onOpenAuthorInWorkspace,
}: Props) {
  const actions: ScraperCardAction[] = [];
  const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);
  const hasLanguageCodes = Boolean(result.languageCodes?.length);
  const blacklistedTagMatches = React.useMemo(
    () => getBlacklistedScraperTags(tagBlacklistEntries, result.tags, result.tagUrls),
    [result.tagUrls, result.tags, tagBlacklistEntries],
  );
  const hasBlacklistedTags = blacklistedTagMatches.length > 0;
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
          metadata={pageCountLabel || hasLanguageCodes || hasBlacklistedTags ? (
            <div className="scraper-card__metadata">
              {hasLanguageCodes ? (
                <span>
                  Langue <LanguageFlags languageCodes={result.languageCodes} />
                </span>
              ) : null}
              {pageCountLabel ? <span>{pageCountLabel}</span> : null}
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
