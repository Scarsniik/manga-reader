import React from 'react';
import ScraperCard from '@/renderer/components/ScraperCard/ScraperCard';
import { ScraperSearchResultItem } from '@/shared/scraper';

type Props = {
  result: ScraperSearchResultItem;
  canOpenResult: boolean;
  canOpenSearchResultsAsDetails: boolean;
  bookmarkButton?: React.ReactNode;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
    result: ScraperSearchResultItem,
  ) => void;
  onOpenResultImage: (
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
    result: ScraperSearchResultItem,
  ) => void;
};

export default function ScraperSearchResultCard({
  result,
  canOpenResult,
  canOpenSearchResultsAsDetails,
  bookmarkButton,
  onOpenResult,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
}: Props) {
  const previewAction = result.thumbnailUrl ? (
    <button
      type="button"
      className="scraper-card__preview-button"
      onClick={(event) => onOpenResultImage(event, result)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onOpenResultImage(event, result);
        } else {
          event.stopPropagation();
        }
      }}
      aria-label={`Agrandir l'image de ${result.title}`}
    >
      Agrandir image
    </button>
  ) : null;

  const contentActions = canOpenResult ? (
    <>
      <button
        type="button"
        className="scraper-card__action-button"
        onClick={(event) => onOpenResultAction(event, result)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            onOpenResultAction(event, result);
          } else {
            event.stopPropagation();
          }
        }}
        aria-label={`Ouvrir la fiche ${result.title}`}
      >
        Ouvrir la fiche
      </button>
      {previewAction}
    </>
  ) : result.detailUrl && !canOpenSearchResultsAsDetails ? (
    <>
      <span className="scraper-card__action-hint is-muted">
        Configure `Fiche` pour ouvrir
      </span>
      {previewAction}
    </>
  ) : previewAction;

  const actions = bookmarkButton || contentActions ? (
    <>
      {bookmarkButton}
      {contentActions}
    </>
  ) : null;

  return (
    <ScraperCard
      title={result.title}
      coverUrl={result.thumbnailUrl}
      coverAlt={result.title}
      summary={result.summary}
      actions={actions}
      isActionable={canOpenResult}
      onClick={canOpenResult ? () => onOpenResult(result) : undefined}
      onKeyDown={canOpenResult ? (event) => onResultKeyDown(event, result) : undefined}
      aria-label={canOpenResult ? `Ouvrir la fiche ${result.title}` : undefined}
    />
  );
}
