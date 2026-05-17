import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildScraperViewHistoryCardId,
  type ScraperViewHistoryRecord,
  type ScraperAuthorFavoriteRecord,
  type ScraperAuthorFavoriteSource,
  type ScraperReaderProgressRecord,
  type ScraperRecord,
  type ScraperViewHistoryCardIdentity,
} from "@/shared/scraper";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import MultiSearchReadingStatusFilterBar from "@/renderer/components/MultiSearch/MultiSearchReadingStatusFilterBar";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  flattenMultiSearchSources,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import { buildMultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import {
  filterMultiSearchMergedResultsByReadingStatus,
  toggleMultiSearchReadingStatusFilter,
} from "@/renderer/components/MultiSearch/multiSearchReadingStatusFilters";
import { openMultiSearchSourceReader } from "@/renderer/components/MultiSearch/multiSearchReader";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchReadingStatusFilter,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { Manga } from "@/renderer/types";
import { useModal } from "@/renderer/hooks/useModal";
import useParams from "@/renderer/hooks/useParams";
import { getScraperBookmarkKey, useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import {
  setScraperCardRead,
  useScraperViewHistory,
} from "@/renderer/stores/scraperViewHistory";
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
import useAuthorFavoriteRuns from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import { formatAuthorMultiSearchQuery } from "@/renderer/utils/authorSearchNames";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "./style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

const formatSourceSummary = (favorite: ScraperAuthorFavoriteRecord, scrapersById: Map<string, ScraperRecord>) => (
  favorite.sources
    .map((source) => {
      const scraperName = scrapersById.get(source.scraperId)?.name ?? "Scrapper inconnu";
      return `${scraperName}: ${source.name}`;
    })
    .join("\n")
);

export default function ScraperAuthorFavoritesView({
  scrapers,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { params } = useParams();
  const { favorites, loading, error } = useScraperAuthorFavorites();
  const { bookmarks } = useScraperBookmarks();
  const {
    loaded: viewHistoryLoaded,
    recordsById: viewHistoryRecordsById,
  } = useScraperViewHistory();
  const routeFavoriteId = useMemo(
    () => readScraperAuthorFavoriteRouteId(location.search),
    [location.search],
  );
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(routeFavoriteId);
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [readerProgressRecords, setReaderProgressRecords] = useState<ScraperReaderProgressRecord[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const [readingStatusFilters, setReadingStatusFilters] = useState<MultiSearchReadingStatusFilter[]>([]);
  const [newSourceHistoryIds, setNewSourceHistoryIds] = useState<Set<string>>(() => new Set());
  const viewHistoryRecordsByIdRef = useRef<Map<string, ScraperViewHistoryRecord>>(new Map());
  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const selectedFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === selectedFavoriteId) ?? null,
    [favorites, selectedFavoriteId],
  );
  const selectedFavoriteMultiSearchQuery = useMemo(() => (
    selectedFavorite
      ? formatAuthorMultiSearchQuery(selectedFavorite.sources.map((source) => source.name))
      : ""
  ), [selectedFavorite]);
  const canShowUnseenFirst = false;
  const showUnseenFirst = canShowUnseenFirst && params?.scraperAuthorFavoriteShowUnseenFirst === true;
  const bookmarkedSourceKeys = useMemo(
    () => new Set(bookmarks.map((bookmark) => getScraperBookmarkKey(bookmark.scraperId, bookmark.sourceUrl))),
    [bookmarks],
  );
  const sourceProgressIndex = useMemo(
    () => buildMultiSearchProgressIndex(readerProgressRecords),
    [readerProgressRecords],
  );
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
  const loadedSourceHistoryIds = useMemo(
    () => loadedSources
      .map((source) => buildScraperViewHistoryCardId(
        buildSearchResultViewHistoryIdentity(source.scraper.id, source.result),
      ))
      .filter((id) => id.length > 0),
    [loadedSources],
  );
  const loadedSourceHistoryKey = useMemo(
    () => loadedSourceHistoryIds.join("|"),
    [loadedSourceHistoryIds],
  );
  const mergedResults = useMemo(() => mergeMultiSearchResults(loadedSources), [loadedSources]);
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(loadedSources),
    [loadedSources],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByReadingStatus(
      filterMultiSearchMergedResultsByLanguage(mergedResults, languageFilterModes),
      readingStatusFilters,
      {
        libraryMangas,
        bookmarkedSourceKeys,
        sourceProgressIndex,
        viewHistoryRecordsById,
      },
    ),
    [
      bookmarkedSourceKeys,
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
    viewHistoryRecordsByIdRef.current = viewHistoryRecordsById;
  }, [viewHistoryRecordsById]);

  useEffect(() => {
    setNewSourceHistoryIds(new Set());
  }, [selectedFavoriteId]);

  useEffect(() => {
    if (!loadedSourceHistoryIds.length) {
      setNewSourceHistoryIds(new Set());
      return;
    }

    if (!viewHistoryLoaded) {
      return;
    }

    const historySnapshot = viewHistoryRecordsByIdRef.current;
    const sourceIds = new Set(loadedSourceHistoryIds);

    setNewSourceHistoryIds((currentIds) => {
      const nextIds = new Set(Array.from(currentIds).filter((id) => sourceIds.has(id)));

      loadedSourceHistoryIds.forEach((id) => {
        if (!historySnapshot.has(id)) {
          nextIds.add(id);
        }
      });

      const hasChanged = nextIds.size !== currentIds.size
        || Array.from(nextIds).some((id) => !currentIds.has(id));

      return hasChanged ? nextIds : currentIds;
    });
  }, [loadedSourceHistoryIds, loadedSourceHistoryKey, viewHistoryLoaded]);

  useEffect(() => {
    if (routeFavoriteId === selectedFavoriteId) {
      return;
    }

    if (!routeFavoriteId) {
      setSelectedFavoriteId(null);
      return;
    }

    if (loading || favorites.some((favorite) => favorite.id === routeFavoriteId)) {
      setSelectedFavoriteId(routeFavoriteId);
    }
  }, [favorites, loading, routeFavoriteId, selectedFavoriteId]);

  useEffect(() => {
    if (!selectedFavoriteId || loading || favorites.some((favorite) => favorite.id === selectedFavoriteId)) {
      return;
    }

    if (routeFavoriteId === selectedFavoriteId) {
      navigate(
        {
          pathname: location.pathname,
          search: writeScraperAuthorFavoriteRouteState(location.search, null),
        },
        { replace: true },
      );
    }

    setSelectedFavoriteId(null);
  }, [favorites, loading, location.pathname, location.search, navigate, routeFavoriteId, selectedFavoriteId]);

  const handleSelectFavorite = useCallback((favoriteId: string | null) => {
    setSelectedFavoriteId(favoriteId);
    navigate({
      pathname: location.pathname,
      search: writeScraperAuthorFavoriteRouteState(location.search, favoriteId),
      });
  }, [location.pathname, location.search, navigate]);

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
    void start();
  }, [selectedFavorite, start]);

  useEffect(() => {
    const loadLibraryMangas = async () => {
      if (!window.api || typeof window.api.getMangas !== "function") {
        setLibraryMangas([]);
        return;
      }

      try {
        const data = await window.api.getMangas();
        setLibraryMangas(Array.isArray(data) ? data as Manga[] : []);
      } catch (loadError) {
        console.warn("Failed to load library mangas for author favorites", loadError);
        setLibraryMangas([]);
      }
    };
    const loadReaderProgressRecords = async () => {
      if (!window.api || typeof window.api.getScraperReaderProgressRecords !== "function") {
        setReaderProgressRecords([]);
        return;
      }

      try {
        const data = await window.api.getScraperReaderProgressRecords();
        setReaderProgressRecords(Array.isArray(data) ? data as ScraperReaderProgressRecord[] : []);
      } catch (progressError) {
        console.warn("Failed to load scraper reader progress for author favorites", progressError);
        setReaderProgressRecords([]);
      }
    };

    void loadLibraryMangas();
    void loadReaderProgressRecords();

    const onMangasUpdated = () => {
      void loadLibraryMangas();
      void loadReaderProgressRecords();
    };

    window.addEventListener("mangas-updated", onMangasUpdated as EventListener);
    return () => window.removeEventListener("mangas-updated", onMangasUpdated as EventListener);
  }, []);

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

  const handleToggleLanguageFilterMode = useCallback((
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => {
    setLanguageFilterModes((currentModes) => {
      const currentMode = getMultiSearchLanguageFilterMode(currentModes, languageCode);
      const nextMode = toggleMultiSearchLanguageFilterMode(currentMode, mode);
      return {
        ...currentModes,
        [languageCode]: nextMode,
      };
    });
  }, []);

  const handleToggleReadingStatusFilter = useCallback((status: MultiSearchReadingStatusFilter) => {
    setReadingStatusFilters((currentStatuses) => (
      toggleMultiSearchReadingStatusFilter(currentStatuses, status)
    ));
  }, []);

  const handleOpenSource = useCallback((source: MultiSearchSourceResult) => {
    const detailUrl = source.result.detailUrl;
    if (!detailUrl) {
      setOpenError("Cette source ne fournit pas d'URL de fiche.");
      return;
    }

    setOpenError(null);

    if (source.canOpenDetails) {
      navigate({
        pathname: location.pathname,
        search: writeScraperRouteState(location.search, {
          scraperId: source.scraper.id,
          mode: "manga",
          searchActive: false,
          searchQuery: "",
          searchPage: 1,
          authorActive: false,
          authorQuery: "",
          authorPage: 1,
          mangaQuery: "",
          mangaUrl: detailUrl,
          bookmarksFilterScraperId: null,
        }),
      });
      return;
    }

    if (window.api && typeof window.api.openExternalUrl === "function") {
      void window.api.openExternalUrl(detailUrl);
      return;
    }

    setOpenError("L'ouverture de liens externes n'est pas disponible dans cette version.");
  }, [location.pathname, location.search, navigate]);

  const handleOpenSourceInWorkspace = useCallback((source: MultiSearchSourceResult) => {
    const detailUrl = source.result.detailUrl;
    if (!detailUrl) {
      setOpenError("Cette source ne fournit pas d'URL de fiche.");
      return;
    }

    if (!source.canOpenDetails) {
      if (window.api && typeof window.api.openExternalUrl === "function") {
        void window.api.openExternalUrl(detailUrl);
        return;
      }

      setOpenError("Cette source ne peut pas etre ouverte dans un onglet scraper.");
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== "function") {
      setOpenError("L'ouverture dans un onglet workspace n'est pas disponible dans cette version.");
      return;
    }

    setOpenError(null);
    void window.api.openWorkspaceTarget({
      kind: "scraper.details",
      scraperId: source.scraper.id,
      sourceUrl: detailUrl,
      title: source.result.title,
    }).then((opened: boolean) => {
      if (!opened) {
        setOpenError("Impossible d'ouvrir cette source dans un onglet workspace.");
      }
    }).catch((workspaceError: unknown) => {
      setOpenError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Impossible d'ouvrir cette source dans un onglet workspace.",
      );
    });
  }, []);

  const handleOpenProgressReader = useCallback(async (
    source: MultiSearchSourceResult,
    page: number,
    knownTotalPages: number | null,
    readerMangaId?: string,
  ) => {
    setOpenError(null);

    try {
      await openMultiSearchSourceReader({
        source,
        page,
        knownTotalPages,
        readerMangaId,
        navigate,
        from: {
          pathname: location.pathname,
          search: location.search,
        },
      });
    } catch (openReaderError) {
      setOpenError(
        openReaderError instanceof Error
          ? openReaderError.message
          : "Impossible d'ouvrir le lecteur.",
      );
    }
  }, [location.pathname, location.search, navigate]);

  const handleSetSourcesRead = useCallback(async (identities: ScraperViewHistoryCardIdentity[], read: boolean) => {
    if (!identities.length) {
      return;
    }

    setOpenError(null);

    try {
      await Promise.all(identities.map((identity) => setScraperCardRead({
        ...identity,
        read,
      })));
    } catch (readError) {
      setOpenError(readError instanceof Error ? readError.message : "Impossible de mettre a jour l'historique de lecture.");
    }
  }, []);

  if (selectedFavorite) {
    return (
      <section className="scraper-author-favorites-view scraper-browser__panel">
        <div className="scraper-author-favorites-view__header">
          <div>
            <button
              type="button"
              className="scraper-author-favorites-view__back"
              onClick={() => handleSelectFavorite(null)}
            >
              Retour aux auteurs favoris
            </button>
            <h2>{selectedFavorite.name}</h2>
            <p>{selectedFavorite.sources.length} source(s) auteur associee(s).</p>
          </div>
          <div className="scraper-author-favorites-view__header-actions">
            <button
              type="button"
              className="scraper-author-favorites-view__multi-search"
              onClick={handleOpenSelectedFavoriteMultiSearch}
              disabled={!selectedFavoriteMultiSearchQuery}
              title={selectedFavoriteMultiSearchQuery
                ? `Pre-remplir la recherche multi-sources avec ${selectedFavoriteMultiSearchQuery}`
                : "Aucun nom auteur disponible"}
            >
              <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
              <span>Recherche multi-source</span>
            </button>
            <button
              type="button"
              className="scraper-author-favorites-view__clear"
              onClick={() => void start()}
              disabled={loadingRuns}
            >
              Recharger
            </button>
          </div>
        </div>

        {runMessage ? <div className="multi-search__message is-info">{runMessage}</div> : null}
        {runError || openError ? (
          <div className="multi-search__message is-error">{runError || openError}</div>
        ) : null}

        <section className="scraper-author-favorites-view__sources">
          <div className="multi-search__section-head">
            <div>
              <h3>Sources</h3>
              <p>{runs.length} source(s), {loadedSources.length} resultat(s) charge(s).</p>
            </div>
            <div className="scraper-author-favorites-view__source-actions">
              <button
                type="button"
                className="multi-search__export-json-button"
                onClick={() => void loadMoreForAll()}
                disabled={loadingRuns || !canLoadMore}
              >
                Charger plus
              </button>
              <button
                type="button"
                className="multi-search__export-json-button"
                onClick={() => void loadAllForAll()}
                disabled={loadingRuns || !canLoadMore}
              >
                Charger tout
              </button>
            </div>
          </div>
          <div className="scraper-author-favorites-view__source-list">
            {runs.map((run) => (
              <div key={run.key} className={`scraper-author-favorites-view__source is-${run.status}`}>
                <button
                  type="button"
                  className="scraper-author-favorites-view__source-link"
                  onClick={() => handleOpenFavoriteSource(run.favoriteSource)}
                  aria-label={`Ouvrir la page auteur ${run.favoriteSource.name} dans ${run.scraper.name}`}
                  title={`Ouvrir dans ${run.scraper.name}`}
                >
                  <strong>{run.scraper.name}</strong>
                  <span>{run.favoriteSource.name}</span>
                  {run.error ? <small>{run.error}</small> : null}
                </button>
                <div>
                  <span>{run.loadedPages} page(s)</span>
                  <button
                    type="button"
                    className="scraper-author-favorites-view__source-more"
                    onClick={() => void loadMoreForRun(run.key)}
                    disabled={loadingRuns || !run.hasNextPage || run.status === "loading"}
                  >
                    Plus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {loadedSources.length ? (
          <section className="multi-search__results">
            <div className="multi-search__section-head">
              <div>
                <h3>Resultats combines</h3>
                <p>{visibleMergedResults.length} carte(s), {loadedSources.length} source(s) chargee(s).</p>
                <div className="multi-search__facet-filter-row">
                  <MultiSearchLanguageFilterBar
                    languageCodes={resultLanguageCodes}
                    filterModes={languageFilterModes}
                    onToggleFilterMode={handleToggleLanguageFilterMode}
                  />
                  <MultiSearchReadingStatusFilterBar
                    selectedStatuses={readingStatusFilters}
                    onToggleStatus={handleToggleReadingStatusFilter}
                  />
                </div>
              </div>
            </div>

            <div className="multi-search__results-grid">
              {displayedMergedResults.map((result) => (
                <MultiSearchResultCard
                  key={result.id}
                  result={result}
                  libraryMangas={libraryMangas}
                  bookmarkedSourceKeys={bookmarkedSourceKeys}
                  sourceProgressIndex={sourceProgressIndex}
                  viewHistoryRecordsById={viewHistoryRecordsById}
                  newViewHistoryIds={newSourceHistoryIds}
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
              ))}
            </div>
          </section>
        ) : loadingRuns ? (
          <div className="scraper-browser__message">Chargement de l'auteur combine...</div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          <h2>Auteurs favoris</h2>
          <p>Cette vue regroupe les pages auteur sauvegardees depuis les scrappers.</p>
        </div>
      </div>

      {error ? <div className="scraper-browser__message is-error">{error}</div> : null}

      {favorites.length ? (
        <div className="scraper-browser__results-grid">
          {favorites.map((favorite) => {
            const actions: ScraperCardAction[] = [
              {
                id: "open-author-favorite",
                type: "primary",
                label: "Ouvrir",
                onClick: () => handleSelectFavorite(favorite.id),
              },
              {
                id: "remove-author-favorite",
                type: "secondary",
                label: "Supprimer",
                onClick: () => void handleRemoveFavorite(favorite),
              },
            ];

            return (
              <ScraperCard
                key={favorite.id}
                title={favorite.name}
                coverUrl={favorite.cover}
                coverAlt={favorite.name}
                summary={formatSourceSummary(favorite, scrapersById)}
                metadata={(
                  <div className="scraper-card__metadata">
                    <span>{favorite.sources.length} source(s)</span>
                  </div>
                )}
                actions={actions}
                isActionable
                onClick={() => handleSelectFavorite(favorite.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleSelectFavorite(favorite.id);
                  }
                }}
                ariaLabel={`Ouvrir l'auteur favori ${favorite.name}`}
              />
            );
          })}
        </div>
      ) : loading ? (
        <div className="scraper-browser__message">Chargement des auteurs favoris...</div>
      ) : (
        <div className="scraper-browser__message">
          Aucun auteur favori. Ouvre une page auteur dans un scrapper puis utilise l'etoile.
        </div>
      )}
    </section>
  );
}
