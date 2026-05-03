import React from 'react';
import { ScraperSearchResultItem } from '@/shared/scraper';
import LanguageFlags from '@/renderer/components/LanguageFlags/LanguageFlags';
import {
  formatScraperPageCountForDisplay,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

type Props = {
  previewCards: ScraperSearchResultItem[];
  previewPage: ScraperRuntimeSearchPageResult | null;
  previewPageIndex: number;
  usesTemplatePaging: boolean;
  validating: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export default function SearchFeaturePreview({
  previewCards,
  previewPage,
  previewPageIndex,
  usesTemplatePaging,
  validating,
  onPreviousPage,
  onNextPage,
}: Props) {
  if (!previewCards.length) {
    return null;
  }

  return (
    <>
      {previewPage?.nextPageUrl ? (
        <div className="scraper-config-preview">
          <span>Page suivante detectee</span>
          <strong>{previewPage.nextPageUrl}</strong>
        </div>
      ) : null}

      {(usesTemplatePaging || previewPageIndex > 0 || previewPage?.nextPageUrl) ? (
        <div className="scraper-search-preview-pagination">
          <button
            type="button"
            className="secondary"
            onClick={onPreviousPage}
            disabled={validating || previewPageIndex <= 0}
          >
            Tester page precedente
          </button>
          <span>
            Page testee : {previewPageIndex + 1}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={onNextPage}
            disabled={validating || (!usesTemplatePaging && !previewPage?.nextPageUrl)}
          >
            Tester page suivante
          </button>
        </div>
      ) : null}

      <div className="scraper-fake-search-results">
        {previewCards.map((result) => {
          const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);

          return (
            <article
              key={`${result.detailUrl ?? result.title}-${result.title}`}
              className="scraper-fake-search-card"
            >
              <div className="scraper-fake-search-card__media">
                {result.thumbnailUrl ? (
                  <img src={result.thumbnailUrl} alt={result.title} />
                ) : (
                  <div className="scraper-fake-search-card__media-placeholder">Image</div>
                )}
              </div>

              <div className="scraper-fake-search-card__content">
                <h5>{result.title}</h5>
                {result.summary ? <p>{result.summary}</p> : null}
                {pageCountLabel ? (
                  <div className="scraper-fake-search-card__meta">{pageCountLabel}</div>
                ) : null}
                {result.languageCodes?.length ? (
                  <div className="scraper-fake-search-card__meta">
                    Langue <LanguageFlags languageCodes={result.languageCodes} />
                  </div>
                ) : null}
                {result.detailUrl ? (
                  <div className="scraper-fake-search-card__meta">Lien de fiche detecte</div>
                ) : (
                  <div className="scraper-fake-search-card__meta is-muted">Aucun lien de fiche detecte</div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
