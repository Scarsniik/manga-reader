import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  ScraperReaderProgressRecord,
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
  ScraperViewHistoryCardIdentity,
} from "@/shared/scraper";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
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
import { openMultiSearchSourceReader } from "@/renderer/components/MultiSearch/multiSearchReader";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { Manga } from "@/renderer/types";
import { useModal } from "@/renderer/hooks/useModal";
import { getScraperBookmarkKey, useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import {
  setScraperCardRead,
  useScraperViewHistory,
} from "@/renderer/stores/scraperViewHistory";
import {
  removeScraperTagFavorite,
  useScraperTagFavorites,
} from "@/renderer/stores/scraperTagFavorites";
import {
  readScraperTagFavoriteRouteId,
  writeScraperRouteState,
  writeScraperTagFavoriteRouteState,
} from "@/renderer/utils/scraperBrowserNavigation";
import ScraperTagFavoriteResults from "@/renderer/components/ScraperTagFavorites/ScraperTagFavoriteResults";
import ScraperTagFavoritesList from "@/renderer/components/ScraperTagFavorites/ScraperTagFavoritesList";
import useTagFavoriteRuns from "@/renderer/components/ScraperTagFavorites/useTagFavoriteRuns";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "@/renderer/components/ScraperAuthorFavorites/style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

export default function ScraperTagFavoritesView({
  scrapers,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { favorites, loading, error } = useScraperTagFavorites();
  const { bookmarks } = useScraperBookmarks();
  const { recordsById: viewHistoryRecordsById } = useScraperViewHistory();
  const routeFavoriteId = useMemo(
    () => readScraperTagFavoriteRouteId(location.search),
    [location.search],
  );
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(routeFavoriteId);
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [readerProgressRecords, setReaderProgressRecords] = useState<ScraperReaderProgressRecord[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const selectedFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === selectedFavoriteId) ?? null,
    [favorites, selectedFavoriteId],
  );
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
  } = useTagFavoriteRuns(selectedFavorite, scrapersById);
  const loadedSources = useMemo(() => flattenMultiSearchSources(runs), [runs]);
  const mergedResults = useMemo(() => mergeMultiSearchResults(visibleSources), [visibleSources]);
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(visibleSources),
    [visibleSources],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(mergedResults, languageFilterModes),
    [languageFilterModes, mergedResults],
  );
  const visibleMergedResultSourceCount = useMemo(
    () => visibleMergedResults.reduce((count, result) => count + result.sources.length, 0),
    [visibleMergedResults],
  );

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
          search: writeScraperTagFavoriteRouteState(location.search, null),
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
      search: writeScraperTagFavoriteRouteState(location.search, favoriteId),
    });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!selectedFavorite) {
      return;
    }

    setLanguageFilterModes({});
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
        console.warn("Failed to load library mangas for tag favorites", loadError);
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
        console.warn("Failed to load scraper reader progress for tag favorites", progressError);
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
          tagActive: false,
          tagQuery: "",
          tagPage: 1,
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
        loading={loadingRuns}
        message={runMessage}
        error={runError || openError}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        libraryMangas={libraryMangas}
        bookmarkedSourceKeys={bookmarkedSourceKeys}
        sourceProgressIndex={sourceProgressIndex}
        viewHistoryRecordsById={viewHistoryRecordsById}
        onBack={() => handleSelectFavorite(null)}
        onReload={() => void reload()}
        onPreviousPage={() => void goToPreviousPage()}
        onNextPage={() => void goToNextPage()}
        onToggleLanguageFilterMode={handleToggleLanguageFilterMode}
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
    <ScraperTagFavoritesList
      favorites={favorites}
      loading={loading}
      error={error}
      scrapersById={scrapersById}
      onSelectFavorite={handleSelectFavorite}
      onRemoveFavorite={(favorite) => void handleRemoveFavorite(favorite)}
    />
  );
}
