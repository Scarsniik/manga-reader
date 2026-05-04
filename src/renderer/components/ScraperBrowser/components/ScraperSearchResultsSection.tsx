import React from 'react';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperSearchResultItem } from '@/shared/scraper';
import ScraperSearchPagination from '@/renderer/components/ScraperBrowser/ScraperSearchPagination';
import ScraperSearchResultCard from '@/renderer/components/ScraperBrowser/components/ScraperSearchResultCard';
import type { ScraperCardViewState } from '@/renderer/utils/scraperViewHistory';

type Props = {
  mode: 'search' | 'author';
  backLabel?: string | null;
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
  headerAction?: React.ReactNode;
  canOpenSearchResultsAsDetails: boolean;
  canOpenSearchResultsAsAuthor: boolean;
  getViewState?: (result: ScraperSearchResultItem) => ScraperCardViewState;
  renderReadAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  renderBookmarkAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  renderAddToLibraryAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  renderDownloadAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onBack?: () => void;
  onOpenResult: (result: ScraperSearchResultItem) => void;
  onOpenAuthorResultAction: (result: ScraperSearchResultItem) => void;
  onResultKeyDown: (event: React.KeyboardEvent<HTMLElement>, result: ScraperSearchResultItem) => void;
  onOpenResultAction: (result: ScraperSearchResultItem) => void;
  onOpenResultImage: (result: ScraperSearchResultItem) => void;
  onOpenResultInWorkspace?: (result: ScraperSearchResultItem) => void;
  onOpenAuthorInWorkspace?: (result: ScraperSearchResultItem) => void;
  onResultViewed?: (result: ScraperSearchResultItem) => void;
};

export default function ScraperSearchResultsSection({
  mode,
  backLabel = null,
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
  headerAction,
  canOpenSearchResultsAsDetails,
  canOpenSearchResultsAsAuthor,
  getViewState,
  renderReadAction,
  renderBookmarkAction,
  renderAddToLibraryAction,
  renderDownloadAction,
  onPreviousPage,
  onNextPage,
  onBack,
  onOpenResult,
  onOpenAuthorResultAction,
  onResultKeyDown,
  onOpenResultAction,
  onOpenResultImage,
  onOpenResultInWorkspace,
  onOpenAuthorInWorkspace,
  onResultViewed,
}: Props) {
  if (!visibleSearchResults.length && !backLabel) {
    return null;
  }

  const isAuthorMode = mode === 'author';

  return (
    <section className="scraper-browser__results">
      <div className="scraper-browser__results-head">
        <div>
          {backLabel && onBack ? (
            <div className="scraper-browser__results-back">
              <button
                type="button"
                className="scraper-browser__back-to-search"
                onClick={onBack}
              >
                {backLabel}
              </button>
            </div>
          ) : null}
          <h3>{isAuthorMode ? 'Resultats auteur' : 'Resultats de recherche'}</h3>
          <p>
            {query.trim()
              ? (
                <>
                  {searchResultsCount} resultat(s) extrait(s) pour <strong>{query.trim()}</strong>.
                </>
              )
              : isAuthorMode
                ? (
                  <>
                    {searchResultsCount} resultat(s) extrait(s) depuis la page auteur courante.
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
          {headerAction}
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
          const canOpenAuthorResult = Boolean(result.authorUrl && canOpenSearchResultsAsAuthor);

          return (
            <ScraperSearchResultCard
              key={`${result.detailUrl ?? result.title}-${result.title}`}
              result={result}
              canOpenResult={canOpenResult}
              canOpenSearchResultsAsDetails={canOpenSearchResultsAsDetails}
              canOpenSearchResultsAsAuthor={canOpenSearchResultsAsAuthor}
              canOpenAuthorResult={canOpenAuthorResult}
              viewState={getViewState ? getViewState(result) : 'seen'}
              readAction={renderReadAction ? renderReadAction(result) : null}
              bookmarkAction={renderBookmarkAction ? renderBookmarkAction(result) : null}
              addToLibraryAction={renderAddToLibraryAction ? renderAddToLibraryAction(result) : null}
              downloadAction={renderDownloadAction ? renderDownloadAction(result) : null}
              onOpenResult={onOpenResult}
              onOpenAuthorResultAction={onOpenAuthorResultAction}
              onResultKeyDown={onResultKeyDown}
              onOpenResultAction={onOpenResultAction}
              onOpenResultImage={onOpenResultImage}
              onOpenResultInWorkspace={onOpenResultInWorkspace}
              onOpenAuthorInWorkspace={onOpenAuthorInWorkspace}
              onViewed={onResultViewed}
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
