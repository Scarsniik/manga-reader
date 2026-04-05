import React from 'react';

type Props = {
  currentPageLabel: string;
  infoLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
};

export default function ScraperSearchPagination({
  currentPageLabel,
  infoLabel,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
}: Props) {
  return (
    <div className="scraper-browser__results-pagination">
      <div className="scraper-browser__pagination-spacer" aria-hidden="true" />

      <div className="scraper-browser__pagination-nav">
        <button
          type="button"
          className="scraper-browser__pagination-button"
          onClick={onPrevious}
          disabled={previousDisabled}
        >
          Page precedente
        </button>

        <span className="scraper-browser__pagination-current">
          {currentPageLabel}
        </span>

        <button
          type="button"
          className="scraper-browser__pagination-button"
          onClick={onNext}
          disabled={nextDisabled}
        >
          Page suivante
        </button>
      </div>

      <span
        className="scraper-browser__pagination-help"
        title={infoLabel}
        aria-label={infoLabel}
        tabIndex={0}
      >
        i
      </span>
    </div>
  );
}
