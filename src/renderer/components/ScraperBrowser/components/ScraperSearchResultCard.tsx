import React from 'react';
import ScraperCard, { type ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import { ScraperSearchResultItem } from '@/shared/scraper';
import { DetailsCardIcon, ImageExpandIcon } from '@/renderer/components/icons';
import type { ScraperCardViewState } from '@/renderer/utils/scraperViewHistory';
import { formatScraperPageCountForDisplay } from '@/renderer/utils/scraperRuntime';

type Props = {
  result: ScraperSearchResultItem;
  canOpenResult: boolean;
  canOpenSearchResultsAsDetails: boolean;
  canOpenSearchResultsAsAuthor: boolean;
  canOpenAuthorResult: boolean;
  viewState: ScraperCardViewState;
  readAction?: ScraperCardAction | null;
  bookmarkAction?: ScraperCardAction | null;
  downloadAction?: ScraperCardAction | null;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onOpenAuthorResultAction: (result: ScraperSearchResultItem) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (result: ScraperSearchResultItem) => void;
  onOpenResultImage: (result: ScraperSearchResultItem) => void;
  onOpenResultInWorkspace?: (result: ScraperSearchResultItem) => void;
  onOpenAuthorInWorkspace?: (result: ScraperSearchResultItem) => void;
  onViewed?: (result: ScraperSearchResultItem) => void;
};

export default function ScraperSearchResultCard({
  result,
  canOpenResult,
  canOpenSearchResultsAsDetails,
  canOpenSearchResultsAsAuthor,
  canOpenAuthorResult,
  viewState,
  readAction,
  bookmarkAction,
  downloadAction,
  onOpenResult,
  onOpenAuthorResultAction,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
  onOpenResultInWorkspace,
  onOpenAuthorInWorkspace,
  onViewed,
}: Props) {
  const actions: ScraperCardAction[] = [];
  const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);

  if (readAction) {
    actions.push(readAction);
  }

  if (bookmarkAction) {
    actions.push(bookmarkAction);
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
    <ScraperCard
      title={result.title}
      coverUrl={result.thumbnailUrl}
      coverAlt={result.title}
      summary={result.summary}
      metadata={pageCountLabel ? (
        <div className="scraper-card__metadata">
          <span>{pageCountLabel}</span>
        </div>
      ) : undefined}
      actions={actions}
      className={viewState === 'read' ? 'is-history-read' : viewState === 'new' ? 'is-history-new' : ''}
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
      onViewed={onViewed ? () => onViewed(result) : undefined}
      aria-label={canOpenResult ? `Ouvrir la fiche ${result.title}` : undefined}
    />
  );
}
