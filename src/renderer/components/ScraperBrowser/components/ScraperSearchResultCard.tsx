import React from 'react';
import { ScraperSearchResultItem } from '@/shared/scraper';

type Props = {
  result: ScraperSearchResultItem;
  canOpenResult: boolean;
  canOpenSearchResultsAsDetails: boolean;
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
  onOpenResult,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
}: Props) {
  const resultActions = canOpenResult ? (
    <>
      <button
        type="button"
        className="scraper-browser__result-action-button"
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
      {result.thumbnailUrl ? (
        <button
          type="button"
          className="scraper-browser__result-preview-button"
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
      ) : null}
    </>
  ) : result.detailUrl && !canOpenSearchResultsAsDetails ? (
    <>
      <span className="scraper-browser__result-action-hint is-muted">
        Configure `Fiche` pour ouvrir
      </span>
      {result.thumbnailUrl ? (
        <button
          type="button"
          className="scraper-browser__result-preview-button"
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
      ) : null}
    </>
  ) : result.thumbnailUrl ? (
    <button
      type="button"
      className="scraper-browser__result-preview-button"
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

  return (
    <article
      className={[
        'scraper-browser__result-card',
        canOpenResult ? 'is-actionable' : '',
      ].join(' ').trim()}
      onClick={canOpenResult ? () => onOpenResult(result) : undefined}
      onKeyDown={canOpenResult ? (event) => onResultKeyDown(event, result) : undefined}
      role={canOpenResult ? 'button' : undefined}
      tabIndex={canOpenResult ? 0 : undefined}
      aria-label={canOpenResult ? `Ouvrir la fiche ${result.title}` : undefined}
    >
      <div className="scraper-browser__result-media">
        {result.thumbnailUrl ? (
          <img src={result.thumbnailUrl} alt={result.title} />
        ) : (
          <div className="scraper-browser__result-placeholder">Pas d&apos;image</div>
        )}
      </div>

      <div className="scraper-browser__result-body">
        <h4>{result.title}</h4>
        {result.summary ? (
          <p className="scraper-browser__result-summary">{result.summary}</p>
        ) : (
          <p className="scraper-browser__result-summary is-muted">
            Aucun resume extrait pour ce resultat.
          </p>
        )}
      </div>

      {resultActions ? (
        <div className="scraper-browser__result-actions">
          {resultActions}
        </div>
      ) : null}
    </article>
  );
}
