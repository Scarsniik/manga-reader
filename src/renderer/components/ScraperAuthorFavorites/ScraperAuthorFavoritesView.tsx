import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ScraperAuthorFavoriteRecord,
  type ScraperAuthorFavoriteSource,
  type ScraperRecord,
} from "@/shared/scraper";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchSourceLanguageValues,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { filterMultiSearchMergedResultsByText } from "@/renderer/components/MultiSearch/multiSearchResultFilters";
import {
  flattenMultiSearchSources,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import {
  filterMultiSearchMergedResultsByReadingStatus,
  toggleMultiSearchReadingStatusFilter,
} from "@/renderer/components/MultiSearch/multiSearchReadingStatusFilters";
import type { MultiSearchReadingStatusFilter } from "@/renderer/components/MultiSearch/types";
import { useModal } from "@/renderer/hooks/useModal";
import useParams from "@/renderer/hooks/useParams";
import {
  removeScraperAuthorFavorite,
  useScraperAuthorFavorites,
} from "@/renderer/stores/scraperAuthorFavorites";
import { useScraperTagFavorites } from "@/renderer/stores/scraperTagFavorites";
import {
  readScraperAuthorFavoriteRouteId,
  SCRAPER_MULTI_SEARCH_VIEW_ID,
  writeScraperAuthorFavoriteRouteState,
  writeScraperRouteState,
} from "@/renderer/utils/scraperBrowserNavigation";
import {
  buildSearchResultViewHistoryIdentity,
  sortByScraperViewHistoryNewState,
} from "@/renderer/utils/scraperViewHistory";
import ScraperSourceFavoritesList from "@/renderer/components/ScraperSourceFavorites/ScraperSourceFavoritesList";
import useScraperSourceFavoriteResults from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteResults";
import useScraperSourceFavoriteSelection from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteSelection";
import ScraperAuthorFavoriteResults from "@/renderer/components/ScraperAuthorFavorites/ScraperAuthorFavoriteResults";
import useAuthorFavoriteRuns from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import { formatAuthorMultiSearchQuery } from "@/renderer/utils/authorSearchNames";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "./style.scss";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { ListingBackgroundResult } from "@/renderer/backgroundSearch/types";

type Props = {
  scrapers: ScraperRecord[];
  backgroundSearchJobId?: string;
};

const RESULT_TEXT_FILTER_DELAY_MS = 350;

export default function ScraperAuthorFavoritesView({
  scrapers,
  backgroundSearchJobId,
}: Props) {
  const { openModal } = useModal();
  const { params, setParams } = useParams();
  const { favorites, loading, error } = useScraperAuthorFavorites();
  const { favorites: tagFavorites } = useScraperTagFavorites();
  const attachedSearch = useBackgroundSearchJob(backgroundSearchJobId);
  const {
    location,
    navigate,
    selectedFavoriteId: routeSelectedFavoriteId,
    selectedFavorite: routeSelectedFavorite,
    scrapersById,
    handleSelectFavorite,
  } = useScraperSourceFavoriteSelection({
    scrapers,
    favorites,
    loading,
    readFavoriteRouteId: readScraperAuthorFavoriteRouteId,
    writeFavoriteRouteState: writeScraperAuthorFavoriteRouteState,
  });
  const attachedInput = attachedSearch.job?.input as ListingBackgroundInput | undefined;
  const selectedFavoriteId = attachedInput?.favoriteId ?? routeSelectedFavoriteId;
  const selectedFavorite = favorites.find((favorite) => favorite.id === selectedFavoriteId)
    ?? routeSelectedFavorite;
  const [readingStatusFilters, setReadingStatusFilters] = useState<MultiSearchReadingStatusFilter[]>([]);
  const [resultTextFilter, setResultTextFilter] = useState("");
  const [debouncedResultTextFilter, setDebouncedResultTextFilter] = useState("");
  const automaticallyStartedFavoriteIdRef = React.useRef<string | null>(null);
  const selectedFavoriteMultiSearchQuery = useMemo(() => (
    selectedFavorite
      ? formatAuthorMultiSearchQuery(selectedFavorite.sources.map((source) => source.name))
      : ""
  ), [selectedFavorite]);
  const canShowUnseenFirst = false;
  const showUnseenFirst = canShowUnseenFirst && params?.scraperAuthorFavoriteShowUnseenFirst === true;
  const {
    runs,
    loading: loadingRuns,
    message: runMessage,
    error: runError,
    canLoadMore,
    start,
    loadMoreForAll,
    loadAllForAll,
    loadMoreForRun,
  } = useAuthorFavoriteRuns(
    attachedSearch.attached ? null : selectedFavorite,
    scrapersById,
    {
      initialPageCount: params?.scraperAuthorFavoritePageCount ?? 1,
      cacheResults: params?.scraperAuthorFavoriteCacheResults === true,
      scrapeDetailsWithCards: params?.scraperScrapeDetailsWithCards === true,
    },
  );
  const attachedResult = attachedSearch.job?.result as ListingBackgroundResult | undefined;
  const attachedRuns = useMemo(() => {
    if (!selectedFavorite || !attachedResult?.runs) return [];
    return attachedResult.runs.map((run) => ({
      key: run.key,
      favoriteSource: selectedFavorite.sources.find((source) => (
        source.scraperId === run.scraper.id && source.authorUrl === run.query
      )) ?? {
        scraperId: run.scraper.id,
        authorUrl: run.query,
        name: run.name,
        createdAt: attachedSearch.job?.metadata.createdAt ?? new Date().toISOString(),
        updatedAt: attachedSearch.job?.metadata.updatedAt ?? new Date().toISOString(),
      },
      scraper: run.scraper,
      status: run.status === "cancelled" ? "done" as const : run.status,
      results: run.results,
      loadedPages: run.loadedPages,
      hasNextPage: run.hasNextPage,
      currentPageUrl: run.currentPageUrl,
      nextPageUrl: run.nextPageUrl,
      error: run.error,
    }));
  }, [attachedResult?.runs, attachedSearch.job?.metadata.createdAt, attachedSearch.job?.metadata.updatedAt, selectedFavorite]);
  const effectiveRuns = attachedSearch.attached ? attachedRuns : runs;
  const loadedSources = useMemo(() => flattenMultiSearchSources(effectiveRuns), [effectiveRuns]);
  const {
    libraryMangas,
    bookmarkedSourceKeys,
    sourceProgressIndex,
    viewHistoryRecordsById,
    newSourceHistoryIds,
    openError,
    setOpenError,
    languageFilterModes,
    setLanguageFilterModes,
    handleToggleLanguageFilterMode,
    handleOpenSource,
    handleOpenSourceInWorkspace,
    handleOpenProgressReader,
    handleSetSourcesRead,
  } = useScraperSourceFavoriteResults({
    selectedFavoriteId,
    trackedSources: loadedSources,
    logLabel: "author favorites",
  });
  const mergedResults = useMemo(() => mergeMultiSearchResults(loadedSources), [loadedSources]);
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(loadedSources),
    [loadedSources],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByText(
      filterMultiSearchMergedResultsByReadingStatus(
        filterMultiSearchMergedResultsByLanguage(mergedResults, languageFilterModes),
        readingStatusFilters,
        {
          libraryMangas,
          bookmarkedSourceKeys,
          sourceProgressIndex,
          viewHistoryRecordsById,
        },
      ),
      debouncedResultTextFilter,
      getMultiSearchSourceLanguageValues,
    ),
    [
      bookmarkedSourceKeys,
      debouncedResultTextFilter,
      languageFilterModes,
      libraryMangas,
      mergedResults,
      readingStatusFilters,
      sourceProgressIndex,
      viewHistoryRecordsById,
    ],
  );
  const displayedMergedResults = useMemo(
    () => sortByScraperViewHistoryNewState(
      visibleMergedResults,
      (result) => result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
      viewHistoryRecordsById,
      newSourceHistoryIds,
      showUnseenFirst,
    ),
    [newSourceHistoryIds, showUnseenFirst, viewHistoryRecordsById, visibleMergedResults],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedResultTextFilter(resultTextFilter);
    }, RESULT_TEXT_FILTER_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [resultTextFilter]);

  const handleOpenFavoriteSource = useCallback((source: ScraperAuthorFavoriteSource) => {
    const locationState = location.state && typeof location.state === "object"
      ? location.state as Record<string, unknown>
      : {};

    navigate(
      {
        pathname: location.pathname,
        search: writeScraperRouteState(location.search, {
          scraperId: source.scraperId,
          mode: "author",
          homepageActive: false,
          homepagePage: 1,
          searchActive: false,
          searchQuery: "",
          searchPage: 1,
          authorActive: true,
          authorQuery: source.authorUrl,
          authorPage: 1,
          mangaQuery: "",
          mangaUrl: "",
          bookmarksFilterScraperId: null,
        }),
      },
      {
        state: {
          ...locationState,
          scraperBrowserAuthorTemplateContext: source.templateContext ?? null,
        },
      },
    );
  }, [location.pathname, location.search, location.state, navigate]);

  const handleOpenSelectedFavoriteMultiSearch = useCallback(() => {
    if (!selectedFavoriteMultiSearchQuery) {
      setOpenError("Aucun nom auteur exploitable n'est disponible pour pre-remplir la recherche multi-sources.");
      return;
    }

    const multiSearch = writeScraperRouteState(location.search, {
      scraperId: SCRAPER_MULTI_SEARCH_VIEW_ID,
      mode: "search",
      homepageActive: false,
      homepagePage: 1,
      searchActive: false,
      searchQuery: "",
      searchPage: 1,
      authorActive: false,
      authorQuery: "",
      authorPage: 1,
      mangaQuery: "",
      mangaUrl: "",
      bookmarksFilterScraperId: null,
    });

    navigate(
      {
        pathname: location.pathname,
        search: multiSearch,
      },
      {
        state: {
          multiSearchPrefillQuery: selectedFavoriteMultiSearchQuery,
        },
      },
    );
  }, [location.pathname, location.search, navigate, selectedFavoriteMultiSearchQuery]);

  const enqueueSelectedFavoriteRefresh = useCallback(async () => {
    if (!selectedFavorite) return;
    const input: ListingBackgroundInput = {
      favoriteId: selectedFavorite.id,
      favoriteUpdatedAt: selectedFavorite.updatedAt,
      sources: selectedFavorite.sources.flatMap((source) => {
        const scraper = scrapersById.get(source.scraperId);
        return scraper ? [{
          id: `${source.scraperId}::${source.authorUrl}`,
          name: source.name,
          scraper,
          query: source.authorUrl,
          templateContext: source.templateContext ?? null,
        }] : [];
      }),
      maxPages: null,
      paceMode: "careful",
      includedLanguageCodes: [],
      scrapeDetailsWithCards: params?.scraperScrapeDetailsWithCards === true,
    };
    await enqueueBackgroundSearch({
      kind: "authorFavoriteRefresh",
      title: `Auteur favori · ${selectedFavorite.name}`,
      primaryTerm: selectedFavorite.name,
      input,
      params,
    });
  }, [params, scrapersById, selectedFavorite]);

  useEffect(() => {
    if (!selectedFavorite) {
      automaticallyStartedFavoriteIdRef.current = null;
      return;
    }
    if (attachedSearch.attached || automaticallyStartedFavoriteIdRef.current === selectedFavorite.id) return;
    automaticallyStartedFavoriteIdRef.current = selectedFavorite.id;
    setLanguageFilterModes({});
    setReadingStatusFilters([]);
    setResultTextFilter("");
    setDebouncedResultTextFilter("");
    if (params?.scraperAuthorFavoriteRefreshBackgroundEnabled === true) {
      void enqueueSelectedFavoriteRefresh().catch((enqueueError) => {
        console.warn("Failed to enqueue author favorite refresh", enqueueError);
      });
    } else {
      void start();
    }
  }, [attachedSearch.attached, enqueueSelectedFavoriteRefresh, params?.scraperAuthorFavoriteRefreshBackgroundEnabled, selectedFavorite, start]);

  const handleReloadSelectedFavorite = useCallback(() => {
    if (attachedSearch.attached) {
      void attachedSearch.reload();
    } else if (params?.scraperAuthorFavoriteRefreshBackgroundEnabled === true) {
      void enqueueSelectedFavoriteRefresh().catch((enqueueError) => {
        console.warn("Failed to enqueue author favorite refresh", enqueueError);
      });
    } else {
      void start();
    }
  }, [attachedSearch, enqueueSelectedFavoriteRefresh, params?.scraperAuthorFavoriteRefreshBackgroundEnabled, start]);

  const handleRemoveFavorite = useCallback((favorite: ScraperAuthorFavoriteRecord) => {
    openModal(buildConfirmActionModal({
      title: "Supprimer l'auteur favori",
      message: (
        <>
          Supprimer l'auteur favori <strong>{favorite.name}</strong> ?
        </>
      ),
      confirmLabel: "Supprimer",
      confirmVariant: "danger",
      onConfirm: async () => {
        await removeScraperAuthorFavorite({ favoriteId: favorite.id });
        if (selectedFavoriteId === favorite.id) {
          handleSelectFavorite(null);
        }
      },
    }));
  }, [handleSelectFavorite, openModal, selectedFavoriteId]);

  const handleToggleReadingStatusFilter = useCallback((status: MultiSearchReadingStatusFilter) => {
    setReadingStatusFilters((currentStatuses) => (
      toggleMultiSearchReadingStatusFilter(currentStatuses, status)
    ));
  }, []);

  if (selectedFavorite) {
    return (
      <>
        <label className="background-search-toggle scraper-author-favorite__background-toggle">
          <input
            type="checkbox"
            checked={attachedSearch.attached || params?.scraperAuthorFavoriteRefreshBackgroundEnabled === true}
            disabled={attachedSearch.attached}
            onChange={(event) => setParams({
              scraperAuthorFavoriteRefreshBackgroundEnabled: event.target.checked,
            }, { remount: false })}
          />
          <span>
            <strong>Mettre à jour en arrière-plan</strong>
            <small>{attachedSearch.attached ? "Rattaché à une mise à jour existante" : "Charge toutes les pages et actualise le cache de cet auteur"}</small>
          </span>
        </label>
      <ScraperAuthorFavoriteResults
        favorite={selectedFavorite}
        runs={effectiveRuns}
        displayedResults={displayedMergedResults}
        visibleResultCount={visibleMergedResults.length}
        loadedSourceCount={loadedSources.length}
        resultLanguageCodes={resultLanguageCodes}
        languageFilterModes={languageFilterModes}
        readingStatusFilters={readingStatusFilters}
        textFilter={resultTextFilter}
        loading={attachedSearch.attached
          ? attachedSearch.status === "queued" || attachedSearch.status === "running"
          : loadingRuns}
        message={attachedSearch.attached
          ? `Recherche en arrière-plan ${attachedSearch.status === "running" ? "en cours" : "chargée"}.`
          : runMessage}
        error={attachedSearch.error || attachedSearch.job?.metadata.error || runError || openError}
        canLoadMore={!attachedSearch.attached && canLoadMore}
        selectedFavoriteMultiSearchQuery={selectedFavoriteMultiSearchQuery}
        libraryMangas={libraryMangas}
        bookmarkedSourceKeys={bookmarkedSourceKeys}
        sourceProgressIndex={sourceProgressIndex}
        viewHistoryRecordsById={viewHistoryRecordsById}
        newViewHistoryIds={newSourceHistoryIds}
        tagBlacklistByScraper={params?.scraperBlacklistedTagsByScraper}
        tagFavorites={tagFavorites}
        hideBlacklistedCards={params?.scraperHideBlacklistedTagCards === true}
        onBack={() => handleSelectFavorite(null)}
        onReload={handleReloadSelectedFavorite}
        onOpenMultiSearch={handleOpenSelectedFavoriteMultiSearch}
        onLoadMoreForAll={() => void loadMoreForAll()}
        onLoadAllForAll={() => void loadAllForAll()}
        onLoadMoreForRun={(runKey) => void loadMoreForRun(runKey)}
        onToggleLanguageFilterMode={handleToggleLanguageFilterMode}
        onToggleReadingStatus={handleToggleReadingStatusFilter}
        onTextFilterChange={setResultTextFilter}
        onFillTextFilterFromBaseQuery={() => setResultTextFilter(selectedFavoriteMultiSearchQuery)}
        onClearTextFilter={() => setResultTextFilter("")}
        onOpenFavoriteSource={handleOpenFavoriteSource}
        onOpenSource={handleOpenSource}
        onOpenSourceInWorkspace={handleOpenSourceInWorkspace}
        onOpenProgressReader={(source, page, totalPages, readerMangaId, openInWorkspace) => void handleOpenProgressReader(
          source,
          page,
          totalPages,
          readerMangaId,
          openInWorkspace,
        )}
        onSetSourcesRead={(identities, read) => void handleSetSourcesRead(identities, read)}
      />
      </>
    );
  }

  return (
    <ScraperSourceFavoritesList
      favorites={favorites}
      loading={loading}
      error={error}
      scrapersById={scrapersById}
      title="Auteurs favoris"
      description="Cette vue regroupe les pages auteur sauvegardees depuis les scrappers."
      loadingMessage="Chargement des auteurs favoris..."
      emptyMessage="Aucun auteur favori. Ouvre une page auteur dans un scrapper puis utilise l'etoile."
      actionPrefix="author"
      favoriteKindLabel="l'auteur favori"
      onSelectFavorite={handleSelectFavorite}
      onRemoveFavorite={(favorite) => void handleRemoveFavorite(favorite)}
    />
  );
}
