import React from 'react';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperSearchResultItem } from '@/shared/scraper';
import ScraperSearchPagination from '@/renderer/components/ScraperBrowser/ScraperSearchPagination';
import ScraperSearchResultCard from '@/renderer/components/ScraperBrowser/components/ScraperSearchResultCard';

type Props = {
  visibleSearchResults: ScraperSearchResultItem[];
  searchResultsCount: number;
  query: string;
  searchPage: ScraperRuntimeSearchPageResult | null;
  searchPageIndex: number;
  shouldShowSearchPagination: boolean;
  currentSearchPageLabel: string;
  paginationInfoLabel: string;
  loading: boolean;
  usesSearchTemplatePaging: boolean;
  canOpenSearchResultsAsDetails: boolean;
  renderBookmarkAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (result: ScraperSearchResultItem) => void;
  onOpenResultImage: (result: ScraperSearchResultItem) => void;
};

export default function ScraperSearchResultsSection({
  visibleSearchResults,
  searchResultsCount,
  query,
  searchPage,
  searchPageIndex,
  shouldShowSearchPagination,
  currentSearchPageLabel,
  paginationInfoLabel,
  loading,
  usesSearchTemplatePaging,
  canOpenSearchResultsAsDetails,
  renderBookmarkAction,
  onPreviousPage,
  onNextPage,
  onOpenResult,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
}: Props) {
  if (!visibleSearchResults.length) {
    return null;
  }

  return (
    <section className="scraper-browser__results">
      <div className="scraper-browser__results-head">
        <div>
          <h3>Resultats de recherche</h3>
          <p>
            {query.trim()
              ? (
                <>
                  {searchResultsCount} resultat(s) extrait(s) pour <strong>{query.trim()}</strong>.
                </>
              )
              : (
                <>
                  {searchResultsCount} resultat(s) extrait(s) sans terme de recherche.
                </>
              )}
          </p>
        </div>

        <div className="scraper-browser__results-side">
          {searchPage ? (
            <span className="scraper-browser__results-count">
              Page {searchPageIndex + 1}
            </span>
          ) : null}
          {searchResultsCount > visibleSearchResults.length ? (
            <span className="scraper-browser__results-count">
              {visibleSearchResults.length} / {searchResultsCount}
            </span>
          ) : null}
        </div>
      </div>

      {shouldShowSearchPagination ? (
        <ScraperSearchPagination
          currentPageLabel={currentSearchPageLabel}
          infoLabel={paginationInfoLabel}
          onPrevious={onPreviousPage}
          onNext={onNextPage}
          previousDisabled={loading || searchPageIndex <= 0}
          nextDisabled={loading || (!usesSearchTemplatePaging && !searchPage?.nextPageUrl)}
        />
      ) : null}

      <div className="scraper-browser__results-grid">
        {visibleSearchResults.map((result) => {
          const canOpenResult = Boolean(result.detailUrl && canOpenSearchResultsAsDetails);

          return (
            <ScraperSearchResultCard
              key={`${result.detailUrl ?? result.title}-${result.title}`}
              result={result}
              canOpenResult={canOpenResult}
              canOpenSearchResultsAsDetails={canOpenSearchResultsAsDetails}
              bookmarkAction={renderBookmarkAction ? renderBookmarkAction(result) : null}
              onOpenResult={onOpenResult}
              onResultKeyDown={onResultKeyDown}
              onOpenResultAction={onOpenResultAction}
              onOpenResultImage={onOpenResultImage}
            />
          );
        })}
      </div>

      {shouldShowSearchPagination ? (
        <ScraperSearchPagination
          currentPageLabel={currentSearchPageLabel}
          infoLabel={paginationInfoLabel}
          onPrevious={onPreviousPage}
          onNext={onNextPage}
          previousDisabled={loading || searchPageIndex <= 0}
          nextDisabled={loading || (!usesSearchTemplatePaging && !searchPage?.nextPageUrl)}
        />
      ) : null}
    </section>
  );
}
