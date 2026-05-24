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

type Props = {
  scrapers: ScraperRecord[];
};

const RESULT_TEXT_FILTER_DELAY_MS = 350;

export default function ScraperAuthorFavoritesView({
  scrapers,
}: Props) {
  const { openModal } = useModal();
  const { params } = useParams();
  const { favorites, loading, error } = useScraperAuthorFavorites();
  const {
    location,
    navigate,
    selectedFavoriteId,
    selectedFavorite,
    scrapersById,
    handleSelectFavorite,
  } = useScraperSourceFavoriteSelection({
    scrapers,
    favorites,
    loading,
    readFavoriteRouteId: readScraperAuthorFavoriteRouteId,
    writeFavoriteRouteState: writeScraperAuthorFavoriteRouteState,
  });
  const [readingStatusFilters, setReadingStatusFilters] = useState<MultiSearchReadingStatusFilter[]>([]);
  const [resultTextFilter, setResultTextFilter] = useState("");
  const [debouncedResultTextFilter, setDebouncedResultTextFilter] = useState("");
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
    selectedFavorite,
    scrapersById,
    {
      initialPageCount: params?.scraperAuthorFavoritePageCount ?? 1,
      cacheResults: params?.scraperAuthorFavoriteCacheResults === true,
    },
  );
  const loadedSources = useMemo(() => flattenMultiSearchSources(runs), [runs]);
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

  useEffect(() => {
    if (!selectedFavorite) {
      return;
    }

    setLanguageFilterModes({});
    setReadingStatusFilters([]);
    setResultTextFilter("");
    setDebouncedResultTextFilter("");
    void start();
  }, [selectedFavorite, start]);

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
      <ScraperAuthorFavoriteResults
        favorite={selectedFavorite}
        runs={runs}
        displayedResults={displayedMergedResults}
        visibleResultCount={visibleMergedResults.length}
        loadedSourceCount={loadedSources.length}
        resultLanguageCodes={resultLanguageCodes}
        languageFilterModes={languageFilterModes}
        readingStatusFilters={readingStatusFilters}
        textFilter={resultTextFilter}
        loading={loadingRuns}
        message={runMessage}
        error={runError || openError}
        canLoadMore={canLoadMore}
        selectedFavoriteMultiSearchQuery={selectedFavoriteMultiSearchQuery}
        libraryMangas={libraryMangas}
        bookmarkedSourceKeys={bookmarkedSourceKeys}
        sourceProgressIndex={sourceProgressIndex}
        viewHistoryRecordsById={viewHistoryRecordsById}
        newViewHistoryIds={newSourceHistoryIds}
        onBack={() => handleSelectFavorite(null)}
        onReload={() => void start()}
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
        onOpenProgressReader={(source, page, totalPages, readerMangaId) => void handleOpenProgressReader(
          source,
          page,
          totalPages,
          readerMangaId,
        )}
        onSetSourcesRead={(identities, read) => void handleSetSourcesRead(identities, read)}
      />
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
