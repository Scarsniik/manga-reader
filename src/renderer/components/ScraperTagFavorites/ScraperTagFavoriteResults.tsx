import React from "react";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import type {
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  buildSearchResultViewHistoryIdentity,
  filterByScraperViewHistoryNewState,
  sortByScraperViewHistoryNewState,
} from "@/renderer/utils/scraperViewHistory";
import ResultFilterToggle from "@/renderer/components/ResultFilterToggle/ResultFilterToggle";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
import {
  countBlacklistedMultiSearchResults,
  filterBlacklistedMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchTagBlacklist";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import type { Manga } from "@/renderer/types";
import type { TagFavoriteSourceRun } from "@/renderer/components/ScraperTagFavorites/useTagFavoriteRuns";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import { applyManualMultiSearchSplits } from "@/renderer/components/MultiSearch/multiSearchManualSplit";
import BlacklistedCardsDisplayToggle, {
  useLocalBlacklistedCardsDisplay,
} from "@/renderer/components/BlacklistedCardsDisplayToggle";
import ScraperPageAppendControl from "@/renderer/components/ScraperPageAppendControl/ScraperPageAppendControl";
import useFrozenScraperUnseenFilter from "@/renderer/hooks/useFrozenScraperUnseenFilter";
import QuickReviewLauncher from "@/renderer/components/QuickReview/QuickReviewLauncher";
import { buildQuickReviewItemsFromMergedResults } from "@/renderer/components/QuickReview/quickReviewItems";

type Props = {
  favorite: ScraperTagFavoriteRecord;
  runs: TagFavoriteSourceRun[];
  pageIndex: number;
  visiblePageEndIndex: number;
  mergedResults: MultiSearchMergedResult[];
  totalResultCount: number;
  visibleSourceCount: number;
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  textFilter: string;
  loading: boolean;
  message: string | null;
  error: string | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
  canAppendPages: boolean;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  hideBlacklistedCards?: boolean;
  showUnseenFirst: boolean;
  backLabel?: string | null;
  description?: string;
  headerAction?: React.ReactNode;
  onBack?: () => void;
  onReload: () => void;
  onFindSimilarTags?: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onAppendPages: (pageCount: number) => void;
  onToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
  onTextFilterChange: (value: string) => void;
  onFillTextFilterFromBaseQuery: () => void;
  onClearTextFilter: () => void;
  onOpenFavoriteSource: (source: ScraperTagFavoriteSource) => void;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onOpenProgressReader: (
    source: MultiSearchSourceResult,
    page: number,
    totalPages: number | null,
    readerMangaId?: string,
    openInWorkspace?: boolean,
  ) => void;
  onSetSourcesRead: (identities: ScraperViewHistoryCardIdentity[], read: boolean) => void;
};

type TagFavoritePaginationActionsProps = {
  loading: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

function TagFavoritePaginationActions({
  loading,
  canGoPrevious,
  canGoNext,
  onPreviousPage,
  onNextPage,
}: TagFavoritePaginationActionsProps) {
  return (
    <div className="scraper-author-favorites-view__source-actions">
      <button
        type="button"
        className="multi-search__export-json-button secondary"
        onClick={onPreviousPage}
        disabled={loading || !canGoPrevious}
      >
        Page precedente
      </button>
      <button
        type="button"
        className="multi-search__export-json-button"
        onClick={onNextPage}
        disabled={loading || !canGoNext}
      >
        Page suivante
      </button>
    </div>
  );
}

export default function ScraperTagFavoriteResults({
  favorite,
  runs,
  pageIndex,
  visiblePageEndIndex,
  mergedResults,
  totalResultCount,
  visibleSourceCount,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  textFilter,
  loading,
  message,
  error,
  canGoPrevious,
  canGoNext,
  canAppendPages,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  tagFavorites = [],
  hideBlacklistedCards = false,
  showUnseenFirst,
  backLabel = "Retour aux tags favoris",
  description,
  headerAction = null,
  onBack,
  onReload,
  onFindSimilarTags,
  onPreviousPage,
  onNextPage,
  onAppendPages,
  onToggleLanguageFilterMode,
  onTextFilterChange,
  onFillTextFilterFromBaseQuery,
  onClearTextFilter,
  onOpenFavoriteSource,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  const [splitResultIds, setSplitResultIds] = React.useState<Set<string>>(() => new Set());
  const {
    active: showUnseenOnly,
    recordsById: unseenFilterRecordsById,
    newCardIds: unseenFilterNewCardIds,
    setActive: setShowUnseenOnly,
  } = useFrozenScraperUnseenFilter(
    viewHistoryRecordsById,
    newViewHistoryIds,
    { resetKey: `${favorite.id}\u0000${pageIndex}` },
  );
  const {
    shouldHideBlacklistedCards,
    showBlacklistedCardsLocally,
    setShowBlacklistedCardsLocally,
  } = useLocalBlacklistedCardsDisplay(hideBlacklistedCards);
  const manuallySplitMergedResults = React.useMemo(
    () => applyManualMultiSearchSplits(mergedResults, splitResultIds),
    [mergedResults, splitResultIds],
  );
  const sortedMergedResults = React.useMemo(
    () => sortByScraperViewHistoryNewState(
      manuallySplitMergedResults,
      (result) => result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
      unseenFilterRecordsById,
      unseenFilterNewCardIds,
      showUnseenFirst,
    ),
    [
      manuallySplitMergedResults,
      newViewHistoryIds,
      showUnseenFirst,
      viewHistoryRecordsById,
    ],
  );
  const blacklistFilteredMergedResults = React.useMemo(
    () => filterBlacklistedMultiSearchResults(
      sortedMergedResults,
      tagBlacklistByScraper,
      shouldHideBlacklistedCards,
    ),
    [
      shouldHideBlacklistedCards,
      sortedMergedResults,
      tagBlacklistByScraper,
    ],
  );
  const displayedMergedResults = React.useMemo(
    () => filterByScraperViewHistoryNewState(
      blacklistFilteredMergedResults,
      (result) => result.sources.map((source) => (
        buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)
      )),
      unseenFilterRecordsById,
      unseenFilterNewCardIds,
      showUnseenOnly,
    ),
    [
      blacklistFilteredMergedResults,
      showUnseenOnly,
      unseenFilterNewCardIds,
      unseenFilterRecordsById,
    ],
  );
  const blacklistedMergedResultCount = React.useMemo(
    () => countBlacklistedMultiSearchResults(sortedMergedResults, tagBlacklistByScraper),
    [sortedMergedResults, tagBlacklistByScraper],
  );
  const visiblePageLabel = pageIndex === visiblePageEndIndex
    ? `Page ${pageIndex + 1}`
    : `Pages ${pageIndex + 1} a ${visiblePageEndIndex + 1} fusionnees`;
  const quickReviewItems = React.useMemo(
    () => buildQuickReviewItemsFromMergedResults(displayedMergedResults),
    [displayedMergedResults],
  );

  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          {backLabel && onBack ? (
            <button
              type="button"
              className="scraper-author-favorites-view__back"
              onClick={onBack}
            >
              {backLabel}
            </button>
          ) : null}
          <h2>{favorite.name}</h2>
          <p>{description ?? `${favorite.sources.length} source(s) tag associee(s).`}</p>
        </div>
        <div className="scraper-author-favorites-view__header-actions">
          {headerAction}
          {onFindSimilarTags ? (
            <button
              type="button"
              className="scraper-author-favorites-view__multi-search"
              onClick={onFindSimilarTags}
            >
              <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
              <span>Tags similaires</span>
            </button>
          ) : null}
          <button
            type="button"
            className="scraper-author-favorites-view__clear"
            onClick={onReload}
            disabled={loading}
          >
            Recharger
          </button>
        </div>
      </div>

      {message ? <div className="multi-search__message is-info">{message}</div> : null}
      {error ? <div className="multi-search__message is-error">{error}</div> : null}

      <section className="scraper-author-favorites-view__sources">
        <div className="multi-search__section-head">
          <div>
            <h3>Sources</h3>
            <p>{runs.length} source(s), {loadedSourceCount} resultat(s) charge(s).</p>
          </div>
        </div>
        <div className="scraper-author-favorites-view__source-list">
          {runs.map((run) => (
            <div key={run.key} className={`scraper-author-favorites-view__source is-${run.status}`}>
              <button
                type="button"
                className="scraper-author-favorites-view__source-link"
                onClick={() => onOpenFavoriteSource(run.favoriteSource)}
                aria-label={`Ouvrir la page tag ${run.favoriteSource.name} dans ${run.scraper.name}`}
                title={`Ouvrir dans ${run.scraper.name}`}
              >
                <strong>{run.scraper.name}</strong>
                <span>{run.favoriteSource.name}</span>
                {run.error ? <small>{run.error}</small> : null}
              </button>
              <div>
                <span>{run.loadedPages} page(s)</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="multi-search__results">
        <div className="multi-search__section-head">
          <div>
            <h3>Resultats</h3>
            <p>
              {visiblePageLabel}, {displayedMergedResults.length} carte(s), {visibleSourceCount} resultat(s)
              source visible(s)
              {shouldHideBlacklistedCards && blacklistedMergedResultCount > 0
                ? `, ${blacklistedMergedResultCount} masquee(s)`
                : ""}.
            </p>
            <div className="multi-search__result-filter-stack">
              <MultiSearchTextFilterBar
                value={textFilter}
                baseQuery={favorite.name}
                onChange={onTextFilterChange}
                onFillFromBaseQuery={onFillTextFilterFromBaseQuery}
                onClear={onClearTextFilter}
              />
              <div className="multi-search__facet-filter-row">
                <MultiSearchLanguageFilterBar
                  languageCodes={resultLanguageCodes}
                  filterModes={languageFilterModes}
                  onToggleFilterMode={onToggleLanguageFilterMode}
                />
                <ResultFilterToggle
                  active={showUnseenOnly}
                  label="Non vus seulement"
                  inactiveTitle="Afficher les cards non vues au moment d'activer ce filtre"
                  activeTitle="Afficher aussi les cards déjà vues"
                  onChange={setShowUnseenOnly}
                  variant="result"
                />
              </div>
            </div>
          </div>
          <div className="multi-search__section-actions">
            <QuickReviewLauncher items={quickReviewItems} />
            <ScraperPageAppendControl
              loading={loading}
              disabled={!canAppendPages}
              onAppendPages={onAppendPages}
            />
            <BlacklistedCardsDisplayToggle
              blacklistedCardCount={blacklistedMergedResultCount}
              hideBlacklistedCards={hideBlacklistedCards}
              showBlacklistedCardsLocally={showBlacklistedCardsLocally}
              onShowBlacklistedCardsLocallyChange={setShowBlacklistedCardsLocally}
            />
            <TagFavoritePaginationActions
              loading={loading}
              canGoPrevious={canGoPrevious}
              canGoNext={canGoNext}
              onPreviousPage={onPreviousPage}
              onNextPage={onNextPage}
            />
          </div>
        </div>

        {displayedMergedResults.length ? (
          <div className="multi-search__results-grid">
            {displayedMergedResults.map((result) => (
              <MultiSearchResultCard
                key={result.id}
                result={result}
                libraryMangas={libraryMangas}
                bookmarkedSourceKeys={bookmarkedSourceKeys}
                sourceProgressIndex={sourceProgressIndex}
                viewHistoryRecordsById={viewHistoryRecordsById}
                newViewHistoryIds={newViewHistoryIds}
                tagBlacklistByScraper={tagBlacklistByScraper}
                tagFavorites={tagFavorites}
                viewHistoryRecordingDisabled={loading}
                onOpenSource={onOpenSource}
                onOpenSourceInWorkspace={onOpenSourceInWorkspace}
                onOpenProgressReader={onOpenProgressReader}
                onSetSourcesRead={onSetSourcesRead}
                onSplitResult={(resultId) => setSplitResultIds((currentIds) => {
                  const nextIds = new Set(currentIds);
                  nextIds.add(resultId);
                  return nextIds;
                })}
              />
            ))}
          </div>
        ) : loading ? (
          <div className="scraper-browser__message">Chargement du tag combine...</div>
        ) : totalResultCount > 0 ? (
          <div className="scraper-browser__message">Aucun resultat ne correspond aux filtres actifs.</div>
        ) : (
          <div className="scraper-browser__message">Aucun resultat sur cette page.</div>
        )}

        <div className="multi-search__section-head">
          <div>
            <p>{visiblePageLabel}</p>
          </div>
          <TagFavoritePaginationActions
            loading={loading}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
          />
        </div>
      </section>
    </section>
  );
}
