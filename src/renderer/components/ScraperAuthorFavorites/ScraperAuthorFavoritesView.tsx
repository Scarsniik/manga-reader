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
  saveScraperAuthorFavorite,
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
import AuthorCorrespondenceDialog from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceDialog";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "./style.scss";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { ListingBackgroundResult } from "@/renderer/backgroundSearch/types";
import type { ScraperAuthorWorkspaceTarget } from "@/renderer/types/workspace";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import { buildAuthorListingSearchInput } from "@/renderer/searchEngines/authorListingSearchInput";

type Props = {
  scrapers: ScraperRecord[];
  backgroundSearchJobId?: string;
  initialFavoriteId?: string;
  routeSyncEnabled?: boolean;
  favoriteOverride?: ScraperAuthorFavoriteRecord;
  initialPageCountOverride?: number;
  onBackFromFavoriteOverride?: () => void;
  onInvalidateFavoriteOverrideSource?: (source: ScraperAuthorFavoriteSource) => void;
  onOpenAuthorTarget?: (target: ScraperAuthorWorkspaceTarget) => void;
  resultOnly?: boolean;
};

const RESULT_TEXT_FILTER_DELAY_MS = 350;

export default function ScraperAuthorFavoritesView({
  scrapers,
  backgroundSearchJobId,
  initialFavoriteId,
  routeSyncEnabled = true,
  favoriteOverride,
  initialPageCountOverride,
  onBackFromFavoriteOverride,
  onInvalidateFavoriteOverrideSource,
  onOpenAuthorTarget,
  resultOnly = false,
}: Props) {
  const { openModal, closeModal } = useModal();
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
    initialFavoriteId,
    routeSyncEnabled,
    readFavoriteRouteId: readScraperAuthorFavoriteRouteId,
    writeFavoriteRouteState: writeScraperAuthorFavoriteRouteState,
  });
  const attachedInput = attachedSearch.job?.input as ListingBackgroundInput | undefined;
  const selectedFavoriteId = favoriteOverride?.id
    ?? attachedInput?.favoriteId
    ?? routeSelectedFavoriteId;
  const selectedFavorite = favoriteOverride
    ?? favorites.find((favorite) => favorite.id === selectedFavoriteId)
    ?? routeSelectedFavorite;
  const [readingStatusFilters, setReadingStatusFilters] = useState<MultiSearchReadingStatusFilter[]>([]);
  const [resultTextFilter, setResultTextFilter] = useState("");
  const [debouncedResultTextFilter, setDebouncedResultTextFilter] = useState("");
  const [refreshingAllFavorites, setRefreshingAllFavorites] = useState(false);
  const [refreshAllMessage, setRefreshAllMessage] = useState<string | null>(null);
  const automaticallyStartedFavoriteIdRef = React.useRef<string | null>(null);
  const initialPageCount = Math.max(
    1,
    Math.floor(initialPageCountOverride ?? params?.scraperAuthorFavoritePageCount ?? 1),
  );
  const selectedFavoriteStartKey = selectedFavorite
    ? favoriteOverride
      ? `${selectedFavorite.id}:${selectedFavorite.sources
        .map((source) => `${source.scraperId}:${source.authorUrl}`)
        .join("|")}:pages=${initialPageCount}`
      : `${selectedFavorite.id}:pages=${initialPageCount}`
    : null;
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
      initialPageCount,
      cacheResults: !favoriteOverride && params?.scraperAuthorFavoriteCacheResults === true,
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
  const effectiveRuns = useMemo(() => {
    const currentRuns = attachedSearch.attached ? attachedRuns : runs;
    if (!favoriteOverride) {
      return currentRuns;
    }

    const sourceKeys = new Set(favoriteOverride.sources.map(
      (source) => `${source.scraperId}::${source.authorUrl}`,
    ));
    return currentRuns.filter((run) => sourceKeys.has(run.key));
  }, [attachedRuns, attachedSearch.attached, favoriteOverride, runs]);
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
  const mergeOptions = useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [
    params?.multiSearchEnableRomajiPhoneticMerge,
    params?.multiSearchMergedTitleLanguagePriority,
  ]);
  const mergedResults = useMemo(
    () => mergeMultiSearchResults(loadedSources, mergeOptions),
    [loadedSources, mergeOptions],
  );
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
    if (onOpenAuthorTarget) {
      onOpenAuthorTarget({
        kind: "scraper.author",
        scraperId: source.scraperId,
        query: source.authorUrl,
        title: source.name,
        templateContext: source.templateContext,
      });
      return;
    }

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
  }, [location.pathname, location.search, location.state, navigate, onOpenAuthorTarget]);

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

  const handleOpenAuthorCorrespondence = useCallback(() => {
    if (!selectedFavorite) return;
    openModal({
      title: "Trouver les correspondances auteur",
      content: (
        <AuthorCorrespondenceDialog
          initialName={selectedFavorite.name}
          initialNames={selectedFavorite.sources.map((source) => source.name)}
          referenceSources={selectedFavorite.sources.map((source) => ({
            scraperId: source.scraperId,
            authorUrl: source.authorUrl,
            name: source.name,
            templateContext: source.templateContext,
          }))}
          onCancel={closeModal}
          onQueued={() => closeModal()}
        />
      ),
      className: "manga-correspondence-modal-shell",
    });
  }, [closeModal, openModal, selectedFavorite]);

  const buildFavoriteRefreshInput = useCallback((
    favorite: ScraperAuthorFavoriteRecord,
  ): ListingBackgroundInput => buildAuthorListingSearchInput(
    [favorite],
    scrapersById,
    "authorFavoriteRefresh",
    {
      maxPages: null,
      concurrency: Math.max(1, Math.floor(params?.scraperLatestConcurrency ?? 2)),
      includedLanguageCodes: [],
      scrapeDetailsWithCards: params?.scraperScrapeDetailsWithCards === true,
    },
  ), [params?.scraperLatestConcurrency, params?.scraperScrapeDetailsWithCards, scrapersById]);

  const enqueueSelectedFavoriteRefresh = useCallback(async () => {
    if (!selectedFavorite) return;
    await enqueueBackgroundSearch({
      kind: "authorFavoriteRefresh",
      title: `Auteur favori · ${selectedFavorite.name}`,
      primaryTerm: selectedFavorite.name,
      input: buildFavoriteRefreshInput(selectedFavorite),
      params,
    });
  }, [buildFavoriteRefreshInput, params, selectedFavorite]);

  const handleRefreshAllFavorites = useCallback(async () => {
    const refreshableFavorites = favorites
      .map((favorite) => ({
        favorite,
        input: buildFavoriteRefreshInput(favorite),
      }))
      .filter(({ input }) => input.sources.length > 0);

    if (!refreshableFavorites.length) {
      setRefreshAllMessage("Aucun auteur favori ne dispose d'une source actuellement utilisable.");
      return;
    }

    setRefreshingAllFavorites(true);
    setRefreshAllMessage(null);
    try {
      await Promise.all(refreshableFavorites.map(({ favorite, input }) => enqueueBackgroundSearch({
        kind: "authorFavoriteRefresh",
        title: `Auteur favori · ${favorite.name}`,
        primaryTerm: favorite.name,
        input,
        params,
      })));
      setRefreshAllMessage(
        `${refreshableFavorites.length} mise(s) à jour ajoutée(s) à la file d'arrière-plan.`,
      );
    } catch (refreshError) {
      setRefreshAllMessage(refreshError instanceof Error
        ? refreshError.message
        : "Impossible d'ajouter les mises à jour à la file d'arrière-plan.");
    } finally {
      setRefreshingAllFavorites(false);
    }
  }, [buildFavoriteRefreshInput, favorites, params]);

  useEffect(() => {
    if (!selectedFavorite) {
      automaticallyStartedFavoriteIdRef.current = null;
      return;
    }
    if (attachedSearch.attached || automaticallyStartedFavoriteIdRef.current === selectedFavoriteStartKey) return;
    automaticallyStartedFavoriteIdRef.current = selectedFavoriteStartKey;
    setLanguageFilterModes({});
    setReadingStatusFilters([]);
    setResultTextFilter("");
    setDebouncedResultTextFilter("");
    if (!favoriteOverride && params?.scraperAuthorFavoriteRefreshBackgroundEnabled === true) {
      void enqueueSelectedFavoriteRefresh().catch((enqueueError) => {
        console.warn("Failed to enqueue author favorite refresh", enqueueError);
      });
    } else {
      void start();
    }
  }, [
    attachedSearch.attached,
    enqueueSelectedFavoriteRefresh,
    favoriteOverride,
    params?.scraperAuthorFavoriteRefreshBackgroundEnabled,
    selectedFavorite,
    selectedFavoriteStartKey,
    start,
  ]);

  const handleReloadSelectedFavorite = useCallback(() => {
    if (attachedSearch.attached) {
      void attachedSearch.reload();
    } else if (!favoriteOverride && params?.scraperAuthorFavoriteRefreshBackgroundEnabled === true) {
      void enqueueSelectedFavoriteRefresh().catch((enqueueError) => {
        console.warn("Failed to enqueue author favorite refresh", enqueueError);
      });
    } else {
      void start();
    }
  }, [
    attachedSearch,
    enqueueSelectedFavoriteRefresh,
    favoriteOverride,
    params?.scraperAuthorFavoriteRefreshBackgroundEnabled,
    start,
  ]);

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

  const handleOpenFavoriteInWorkspace = useCallback((favorite: ScraperAuthorFavoriteRecord) => {
    void openWorkspaceTarget({
      kind: "manga-manager.view",
      viewId: "author-favorites",
      title: favorite.name,
      locationState: {
        authorFavoriteId: favorite.id,
      },
    });
  }, []);

  const handleSelectFavoriteCover = useCallback(async (cover: string) => {
    if (!selectedFavorite || selectedFavorite.cover === cover) {
      return;
    }

    const source = selectedFavorite.sources[0];
    if (!source) {
      setOpenError("Aucune source auteur n'est disponible pour enregistrer cette couverture.");
      return;
    }

    setOpenError(null);
    try {
      await saveScraperAuthorFavorite({
        favoriteId: selectedFavorite.id,
        name: selectedFavorite.name,
        cover,
        source: {
          scraperId: source.scraperId,
          authorUrl: source.authorUrl,
          name: source.name,
          cover: source.cover,
          templateContext: source.templateContext,
        },
      });
    } catch (saveError) {
      setOpenError(saveError instanceof Error
        ? saveError.message
        : "Impossible d'enregistrer la couverture de cet auteur favori.");
    }
  }, [selectedFavorite, setOpenError]);

  const handleToggleReadingStatusFilter = useCallback((status: MultiSearchReadingStatusFilter) => {
    setReadingStatusFilters((currentStatuses) => (
      toggleMultiSearchReadingStatusFilter(currentStatuses, status)
    ));
  }, []);

  if (selectedFavorite) {
    return (
      <>
        {!resultOnly && !favoriteOverride ? <label className="background-search-toggle scraper-author-favorite__background-toggle">
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
        </label> : null}
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
        resultOnly={resultOnly}
        backLabel={favoriteOverride ? "Retour aux correspondances auteur" : undefined}
        correspondenceAction={!resultOnly && !favoriteOverride ? (
          <button
            type="button"
            className="scraper-author-favorites-view__multi-search"
            onClick={handleOpenAuthorCorrespondence}
            title="Trouver les pages correspondantes de cet auteur"
          >
            <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
            <span>Trouver les correspondances</span>
          </button>
        ) : null}
        renderSourceAction={favoriteOverride && onInvalidateFavoriteOverrideSource
          ? (run) => (
            <button
              type="button"
              className="scraper-author-favorites-view__source-more"
              onClick={() => onInvalidateFavoriteOverrideSource(run.favoriteSource)}
            >
              Invalider
            </button>
          )
          : undefined}
        onBack={favoriteOverride
          ? () => onBackFromFavoriteOverride?.()
          : () => handleSelectFavorite(null)}
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
        selectedCoverUrl={!favoriteOverride && !resultOnly ? selectedFavorite.cover : undefined}
        onSelectCover={!favoriteOverride && !resultOnly
          ? (cover) => void handleSelectFavoriteCover(cover)
          : undefined}
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
      headerAction={(
        <button
          type="button"
          className="scraper-author-favorites-view__multi-search"
          onClick={() => void handleRefreshAllFavorites()}
          disabled={refreshingAllFavorites || loading || !favorites.length}
        >
          {refreshingAllFavorites ? "Ajout en cours..." : "Mettre à jour tous les auteurs"}
        </button>
      )}
      statusMessage={refreshAllMessage}
      onSelectFavorite={handleSelectFavorite}
      onOpenFavoriteInWorkspace={handleOpenFavoriteInWorkspace}
      onRemoveFavorite={(favorite) => void handleRemoveFavorite(favorite)}
    />
  );
}
