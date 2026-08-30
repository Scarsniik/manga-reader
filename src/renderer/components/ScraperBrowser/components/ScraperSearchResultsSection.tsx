import React from 'react';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperSearchResultItem, type ScraperRecord, type ScraperViewHistoryRecord } from '@/shared/scraper';
import ScraperSearchPagination from '@/renderer/components/ScraperBrowser/ScraperSearchPagination';
import ScraperSearchResultCard from '@/renderer/components/ScraperBrowser/components/ScraperSearchResultCard';
import {
  getBlacklistedScraperTags,
  type ScraperTagBlacklistEntry,
} from '@/renderer/utils/scraperTagBlacklist';
import type { ScraperTagFavoriteSourceTarget } from '@/renderer/utils/scraperTagFavorites';
import { appendScraperSearchResultTag } from '@/renderer/utils/scraperSearchResultTags';
import BlacklistedCardsDisplayToggle, {
  useLocalBlacklistedCardsDisplay,
} from '@/renderer/components/BlacklistedCardsDisplayToggle';
import {
  getScraperCardPotentialMatchKey,
  type ScraperCardPotentialMatchResult,
} from '@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches';
import type { ScraperPotentialMangaMatch } from '@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes';
import OriginalWorksFilterToggle from '@/renderer/components/OriginalWorksFilterToggle/OriginalWorksFilterToggle';
import { isScraperResultOriginal } from '@/renderer/utils/scraperOriginalWorks';
import ResultFilterToggle from '@/renderer/components/ResultFilterToggle/ResultFilterToggle';
import {
  buildSearchResultViewHistoryIdentity,
  filterByScraperViewHistoryNewState,
} from '@/renderer/utils/scraperViewHistory';
import useFrozenScraperUnseenFilter from '@/renderer/hooks/useFrozenScraperUnseenFilter';

type Props = {
  scraperId: string;
  scraper: ScraperRecord;
  mode: 'homepage' | 'search' | 'author' | 'tag' | 'source';
  backLabel?: string | null;
  authorTitle?: string | null;
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
  canOpenSearchResultsAsSource: boolean;
  canResolveSourceName: boolean;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistEntries?: ScraperTagBlacklistEntry[];
  tagFavoriteSources?: ScraperTagFavoriteSourceTarget[];
  hideBlacklistedCards?: boolean;
  searchOriginalOnly?: boolean;
  onSearchOriginalOnlyChange?: (value: boolean) => void;
  renderReadAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  renderBookmarkAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  renderAddToLibraryAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  renderDownloadAction?: (result: ScraperSearchResultItem) => ScraperCardAction | null;
  potentialMatchesByKey?: Map<string, ScraperCardPotentialMatchResult>;
  potentialMatchesLoading?: boolean;
  potentialMatchesLoadingKeys?: ReadonlySet<string>;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onBack?: () => void;
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

export default function ScraperSearchResultsSection({
  scraperId,
  scraper,
  mode,
  backLabel = null,
  authorTitle = null,
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
  canOpenSearchResultsAsSource,
  canResolveSourceName,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistEntries = [],
  tagFavoriteSources = [],
  hideBlacklistedCards = false,
  searchOriginalOnly = false,
  onSearchOriginalOnlyChange,
  renderReadAction,
  renderBookmarkAction,
  renderAddToLibraryAction,
  renderDownloadAction,
  potentialMatchesByKey,
  potentialMatchesLoading = false,
  potentialMatchesLoadingKeys,
  onPreviousPage,
  onNextPage,
  onBack,
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
  const [originalOnly, setOriginalOnly] = React.useState(false);
  const {
    active: showUnseenOnly,
    recordsById: unseenFilterRecordsById,
    newCardIds: unseenFilterNewCardIds,
    setActive: setShowUnseenOnly,
  } = useFrozenScraperUnseenFilter(
    viewHistoryRecordsById,
    newViewHistoryIds,
    { resetKey: `${scraperId}\u0000${mode}\u0000${query}\u0000${searchPageIndex}` },
  );
  const {
    shouldHideBlacklistedCards,
    showBlacklistedCardsLocally,
    setShowBlacklistedCardsLocally,
  } = useLocalBlacklistedCardsDisplay(hideBlacklistedCards);
  const resultsWithTagContext = React.useMemo(() => {
    if (mode !== 'tag') {
      return visibleSearchResults;
    }

    const tagValue = query.trim();
    const tagLabel = (authorTitle || tagValue).trim();
    if (!tagLabel && !tagValue) {
      return visibleSearchResults;
    }

    return visibleSearchResults.map((result) => (
      appendScraperSearchResultTag(result, tagLabel, tagValue)
    ));
  }, [authorTitle, mode, query, visibleSearchResults]);

  const originalFilteredResults = React.useMemo(() => (
    mode === 'author' && originalOnly
      ? resultsWithTagContext.filter((result) => isScraperResultOriginal(scraper, result))
      : resultsWithTagContext
  ), [mode, originalOnly, resultsWithTagContext, scraper]);

  const blacklistedSearchResultCount = React.useMemo(() => (
    originalFilteredResults.reduce((count, result) => (
      count + (getBlacklistedScraperTags(tagBlacklistEntries, result.tags, result.tagUrls).length > 0 ? 1 : 0)
    ), 0)
  ), [originalFilteredResults, tagBlacklistEntries]);

  const blacklistFilteredSearchResults = React.useMemo(() => {
    if (!shouldHideBlacklistedCards) {
      return originalFilteredResults;
    }

    return originalFilteredResults.filter((result) => (
      getBlacklistedScraperTags(tagBlacklistEntries, result.tags, result.tagUrls).length === 0
    ));
  }, [originalFilteredResults, shouldHideBlacklistedCards, tagBlacklistEntries]);
  const displayedSearchResults = React.useMemo(
    () => filterByScraperViewHistoryNewState(
      blacklistFilteredSearchResults,
      (result) => [buildSearchResultViewHistoryIdentity(scraperId, result)],
      unseenFilterRecordsById,
      unseenFilterNewCardIds,
      showUnseenOnly,
    ),
    [
      blacklistFilteredSearchResults,
      scraperId,
      showUnseenOnly,
      unseenFilterNewCardIds,
      unseenFilterRecordsById,
    ],
  );

  if (!visibleSearchResults.length && !backLabel) {
    return null;
  }

  const isAuthorMode = mode === 'author';
  const isTagMode = mode === 'tag';
  const isHomepageMode = mode === 'homepage';
  const isSourceMode = mode === 'source';
  const heading = isAuthorMode
    ? authorTitle || 'Resultats auteur'
    : isTagMode
      ? authorTitle || 'Resultats tag'
      : isSourceMode
        ? authorTitle || 'Resultats source'
      : isHomepageMode
        ? 'Homepage'
        : 'Resultats de recherche';

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
          <h3>{heading}</h3>
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
                : isTagMode
                  ? (
                    <>
                      {searchResultsCount} resultat(s) extrait(s) depuis la page tag courante.
                    </>
                  )
                : isSourceMode
                  ? (
                    <>
                      {searchResultsCount} resultat(s) extrait(s) depuis la page source courante.
                    </>
                  )
                : isHomepageMode
                  ? (
                    <>
                      {searchResultsCount} resultat(s) extrait(s) depuis la homepage.
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
          {isAuthorMode ? (
            <>
              <OriginalWorksFilterToggle
                active={searchOriginalOnly}
                onChange={(value) => onSearchOriginalOnlyChange?.(value)}
                disabled={!onSearchOriginalOnlyChange}
                label="Originaux · recherche"
                title="Relancer la recherche auteur en excluant les œuvres dérivées pendant la collecte"
                variant="result"
              />
              <OriginalWorksFilterToggle
                active={originalOnly}
                onChange={setOriginalOnly}
                label="Originaux · affichage"
                variant="result"
              />
            </>
          ) : null}
          <ResultFilterToggle
            active={showUnseenOnly}
            label="Non vus seulement"
            inactiveTitle="Afficher les cards non vues au moment d'activer ce filtre"
            activeTitle="Afficher aussi les cards déjà vues"
            onChange={setShowUnseenOnly}
            variant="result"
          />
          <BlacklistedCardsDisplayToggle
            blacklistedCardCount={blacklistedSearchResultCount}
            hideBlacklistedCards={hideBlacklistedCards}
            showBlacklistedCardsLocally={showBlacklistedCardsLocally}
            onShowBlacklistedCardsLocallyChange={setShowBlacklistedCardsLocally}
          />
          {searchPage ? (
            <span className="scraper-browser__results-count">
              Page {searchPageIndex + 1}
            </span>
          ) : null}
          {searchResultsCount > displayedSearchResults.length ? (
            <span className="scraper-browser__results-count">
              {displayedSearchResults.length} / {searchResultsCount}
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
        {displayedSearchResults.map((result) => {
          const canOpenResult = Boolean(result.detailUrl && canOpenSearchResultsAsDetails);
          const canOpenAuthorResult = Boolean(result.authorUrl && canOpenSearchResultsAsAuthor);
          const potentialMatchKey = getScraperCardPotentialMatchKey(
            scraperId,
            result.detailUrl,
            result.title,
          );

          return (
            <ScraperSearchResultCard
              key={`${result.detailUrl ?? result.title}-${result.title}`}
              scraperId={scraperId}
              result={result}
              canOpenResult={canOpenResult}
              canOpenSearchResultsAsDetails={canOpenSearchResultsAsDetails}
              canOpenSearchResultsAsAuthor={canOpenSearchResultsAsAuthor}
              canOpenSearchResultsAsSource={canOpenSearchResultsAsSource}
              canResolveSourceName={canResolveSourceName}
              canOpenAuthorResult={canOpenAuthorResult}
              viewHistoryRecordsById={viewHistoryRecordsById}
              newViewHistoryIds={newViewHistoryIds}
              tagBlacklistEntries={tagBlacklistEntries}
              tagFavoriteSources={tagFavoriteSources}
              viewHistoryRecordingDisabled={loading}
              readAction={renderReadAction ? renderReadAction(result) : null}
              bookmarkAction={renderBookmarkAction ? renderBookmarkAction(result) : null}
              addToLibraryAction={renderAddToLibraryAction ? renderAddToLibraryAction(result) : null}
              downloadAction={renderDownloadAction ? renderDownloadAction(result) : null}
              potentialMatches={potentialMatchesByKey?.get(potentialMatchKey)}
              potentialMatchesLoading={potentialMatchesLoadingKeys
                ? potentialMatchesLoadingKeys.has(potentialMatchKey)
                : potentialMatchesLoading}
              onOpenResult={onOpenResult}
              onOpenAuthorResultAction={onOpenAuthorResultAction}
              onOpenSource={onOpenSource}
              onResultKeyDown={onResultKeyDown}
              onOpenResultAction={onOpenResultAction}
              onOpenResultImage={onOpenResultImage}
              onOpenResultInWorkspace={onOpenResultInWorkspace}
              onOpenAuthorInWorkspace={onOpenAuthorInWorkspace}
              onOpenPotentialMatch={onOpenPotentialMatch}
              onOpenPotentialMatchInWorkspace={onOpenPotentialMatchInWorkspace}
            />
          );
        })}
      </div>
      {!displayedSearchResults.length && visibleSearchResults.length ? (
        <div className="scraper-browser__message">
          {shouldHideBlacklistedCards && blacklistedSearchResultCount > 0
            ? 'Tous les resultats visibles sont masques par la blacklist.'
            : 'Aucun resultat ne correspond aux filtres actifs.'}
        </div>
      ) : null}

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
