import React from 'react';
import ScraperCard, { type ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import { ScraperSearchResultItem } from '@/shared/scraper';
import { DetailsCardIcon, ImageExpandIcon } from '@/renderer/components/icons';

type Props = {
  result: ScraperSearchResultItem;
  canOpenResult: boolean;
  canOpenSearchResultsAsDetails: boolean;
  bookmarkAction?: ScraperCardAction | null;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (result: ScraperSearchResultItem) => void;
  onOpenResultImage: (result: ScraperSearchResultItem) => void;
};

export default function ScraperSearchResultCard({
  result,
  canOpenResult,
  canOpenSearchResultsAsDetails,
  bookmarkAction,
  onOpenResult,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
}: Props) {
  const actions: ScraperCardAction[] = [];

  if (bookmarkAction) {
    actions.push(bookmarkAction);
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
      actions={actions}
      isActionable={canOpenResult}
      onClick={canOpenResult ? () => onOpenResult(result) : undefined}
      onKeyDown={canOpenResult ? (event) => onResultKeyDown(event, result) : undefined}
      aria-label={canOpenResult ? `Ouvrir la fiche ${result.title}` : undefined}
    />
  );
}
