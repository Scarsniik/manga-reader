import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ScraperRecord,
  type ScraperTagFavoriteRecord,
  type ScraperTagFavoriteSource,
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
import { useModal } from "@/renderer/hooks/useModal";
import useParams from "@/renderer/hooks/useParams";
import {
  removeScraperTagFavorite,
  useScraperTagFavorites,
} from "@/renderer/stores/scraperTagFavorites";
import {
  readScraperTagFavoriteRouteId,
  writeScraperRouteState,
  writeScraperTagFavoriteRouteState,
} from "@/renderer/utils/scraperBrowserNavigation";
import ScraperSourceFavoritesList from "@/renderer/components/ScraperSourceFavorites/ScraperSourceFavoritesList";
import useScraperSourceFavoriteResults from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteResults";
import useScraperSourceFavoriteSelection from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteSelection";
import ScraperTagFavoriteResults from "@/renderer/components/ScraperTagFavorites/ScraperTagFavoriteResults";
import ScraperSimilarTagsDialog from "@/renderer/components/ScraperTagFavorites/ScraperSimilarTagsDialog";
import useTagFavoriteRuns from "@/renderer/components/ScraperTagFavorites/useTagFavoriteRuns";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "@/renderer/components/ScraperAuthorFavorites/style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

const RESULT_TEXT_FILTER_DELAY_MS = 350;

export default function ScraperTagFavoritesView({
  scrapers,
}: Props) {
  const { openModal } = useModal();
  const { params } = useParams();
  const { favorites, loading, error } = useScraperTagFavorites();
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
    readFavoriteRouteId: readScraperTagFavoriteRouteId,
    writeFavoriteRouteState: writeScraperTagFavoriteRouteState,
  });
  const [resultTextFilter, setResultTextFilter] = useState("");
  const [debouncedResultTextFilter, setDebouncedResultTextFilter] = useState("");
  const showUnseenFirst = params?.scraperTagFavoriteShowUnseenFirst !== false;
  const {
    runs,
    visibleSources,
    pageIndex,
    loading: loadingRuns,
    message: runMessage,
    error: runError,
    canGoPrevious,
    canGoNext,
    start,
    reload,
    goToPreviousPage,
    goToNextPage,
  } = useTagFavoriteRuns(selectedFavorite, scrapersById, {
    scrapeDetailsWithCards: params?.scraperScrapeDetailsWithCards === true,
  });
  const loadedSources = useMemo(() => flattenMultiSearchSources(runs), [runs]);
  const {
    libraryMangas,
    bookmarkedSourceKeys,
    sourceProgressIndex,
    viewHistoryRecordsById,
    newSourceHistoryIds,
    openError,
    languageFilterModes,
    setLanguageFilterModes,
    handleToggleLanguageFilterMode,
    handleOpenSource,
    handleOpenSourceInWorkspace,
    handleOpenProgressReader,
    handleSetSourcesRead,
  } = useScraperSourceFavoriteResults({
    selectedFavoriteId,
    trackedSources: visibleSources,
    logLabel: "tag favorites",
  });
  const mergeOptions = useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [
    params?.multiSearchEnableRomajiPhoneticMerge,
    params?.multiSearchMergedTitleLanguagePriority,
  ]);
  const mergedResults = useMemo(
    () => mergeMultiSearchResults(visibleSources, mergeOptions),
    [mergeOptions, visibleSources],
  );
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(visibleSources),
    [visibleSources],
  );
  const languageFilteredMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(mergedResults, languageFilterModes),
    [languageFilterModes, mergedResults],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByText(
      languageFilteredMergedResults,
      debouncedResultTextFilter,
      getMultiSearchSourceLanguageValues,
    ),
    [debouncedResultTextFilter, languageFilteredMergedResults],
  );
  const visibleMergedResultSourceCount = useMemo(
    () => visibleMergedResults.reduce((count, result) => count + result.sources.length, 0),
    [visibleMergedResults],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedResultTextFilter(resultTextFilter);
    }, RESULT_TEXT_FILTER_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [resultTextFilter]);

  useEffect(() => {
    if (!selectedFavorite) {
      return;
    }

    setLanguageFilterModes({});
    setResultTextFilter("");
    setDebouncedResultTextFilter("");
    void start();
  }, [selectedFavorite, start]);

  const handleRemoveFavorite = useCallback((favorite: ScraperTagFavoriteRecord) => {
    openModal(buildConfirmActionModal({
      title: "Supprimer le tag favori",
      message: (
        <>
          Supprimer le tag favori <strong>{favorite.name}</strong> ?
        </>
      ),
      confirmLabel: "Supprimer",
      confirmVariant: "danger",
      onConfirm: async () => {
        await removeScraperTagFavorite({ favoriteId: favorite.id });
        if (selectedFavoriteId === favorite.id) {
          handleSelectFavorite(null);
        }
      },
    }));
  }, [handleSelectFavorite, openModal, selectedFavoriteId]);

  const handleOpenFavoriteSource = useCallback((source: ScraperTagFavoriteSource) => {
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: source.scraperId,
        mode: "tag",
        searchActive: false,
        searchQuery: "",
        searchPage: 1,
        authorActive: false,
        authorQuery: "",
        authorPage: 1,
        tagActive: true,
        tagQuery: source.tagUrl,
        tagPage: 1,
        mangaQuery: "",
        mangaUrl: "",
        bookmarksFilterScraperId: null,
      }),
    });
  }, [location.pathname, location.search, navigate]);

  const handleFindSimilarTags = useCallback((favorite: ScraperTagFavoriteRecord) => {
    openModal({
      title: `Tags similaires a ${favorite.name}`,
      content: (
        <ScraperSimilarTagsDialog
          favoriteId={favorite.id}
          searchTerms={[
            favorite.name,
            ...favorite.sources.map((source) => source.name),
          ]}
          scrapers={scrapers}
        />
      ),
      actions: [{
        label: "Fermer",
      }],
      className: "scraper-similar-tags-modal",
    });
  }, [openModal, scrapers]);

  if (selectedFavorite) {
    return (
      <ScraperTagFavoriteResults
        favorite={selectedFavorite}
        runs={runs}
        pageIndex={pageIndex}
        mergedResults={visibleMergedResults}
        totalResultCount={mergedResults.length}
        visibleSourceCount={visibleMergedResultSourceCount}
        loadedSourceCount={loadedSources.length}
        resultLanguageCodes={resultLanguageCodes}
        languageFilterModes={languageFilterModes}
        textFilter={resultTextFilter}
        loading={loadingRuns}
        message={runMessage}
        error={runError || openError}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        libraryMangas={libraryMangas}
        bookmarkedSourceKeys={bookmarkedSourceKeys}
        sourceProgressIndex={sourceProgressIndex}
        viewHistoryRecordsById={viewHistoryRecordsById}
        newViewHistoryIds={newSourceHistoryIds}
        tagBlacklistByScraper={params?.scraperBlacklistedTagsByScraper}
        tagFavorites={favorites}
        hideBlacklistedCards={params?.scraperHideBlacklistedTagCards === true}
        showUnseenFirst={showUnseenFirst}
        onBack={() => handleSelectFavorite(null)}
        onReload={() => void reload()}
        onFindSimilarTags={() => handleFindSimilarTags(selectedFavorite)}
        onPreviousPage={() => void goToPreviousPage()}
        onNextPage={() => void goToNextPage()}
        onToggleLanguageFilterMode={handleToggleLanguageFilterMode}
        onTextFilterChange={setResultTextFilter}
        onFillTextFilterFromBaseQuery={() => setResultTextFilter(selectedFavorite.name)}
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
    );
  }

  return (
    <ScraperSourceFavoritesList
      favorites={favorites}
      loading={loading}
      error={error}
      scrapersById={scrapersById}
      title="Tags favoris"
      description="Cette vue regroupe les pages tag sauvegardees depuis les scrappers."
      loadingMessage="Chargement des tags favoris..."
      emptyMessage="Aucun tag favori. Ouvre une page tag dans un scrapper puis utilise l'etoile."
      actionPrefix="tag"
      favoriteKindLabel="le tag favori"
      onSelectFavorite={handleSelectFavorite}
      onRemoveFavorite={(favorite) => void handleRemoveFavorite(favorite)}
    />
  );
}
