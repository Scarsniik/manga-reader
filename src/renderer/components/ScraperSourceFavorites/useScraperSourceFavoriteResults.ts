import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildScraperViewHistoryCardId,
  type ScraperReaderProgressRecord,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { openMultiSearchSourceReader } from "@/renderer/components/MultiSearch/multiSearchReader";
import { buildMultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { Manga } from "@/renderer/types";
import { getScraperBookmarkKey, useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import {
  setScraperCardRead,
  useScraperViewHistory,
} from "@/renderer/stores/scraperViewHistory";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";

type Options = {
  selectedFavoriteId: string | null;
  trackedSources: MultiSearchSourceResult[];
  logLabel: string;
};

type SourceFavoriteResultsState = {
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryLoaded: boolean;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newSourceHistoryIds: Set<string>;
  openError: string | null;
  setOpenError: (error: string | null) => void;
  languageFilterModes: MultiSearchLanguageFilterModes;
  setLanguageFilterModes: (modes: MultiSearchLanguageFilterModes) => void;
  handleToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
  handleOpenSource: (source: MultiSearchSourceResult) => void;
  handleOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  handleOpenProgressReader: (
    source: MultiSearchSourceResult,
    page: number,
    knownTotalPages: number | null,
    readerMangaId?: string,
    openInWorkspace?: boolean,
  ) => Promise<void>;
  handleSetSourcesRead: (identities: ScraperViewHistoryCardIdentity[], read: boolean) => Promise<void>;
};

export default function useScraperSourceFavoriteResults({
  selectedFavoriteId,
  trackedSources,
  logLabel,
}: Options): SourceFavoriteResultsState {
  const location = useLocation();
  const navigate = useNavigate();
  const { bookmarks } = useScraperBookmarks();
  const {
    loaded: viewHistoryLoaded,
    recordsById: viewHistoryRecordsById,
  } = useScraperViewHistory();
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [readerProgressRecords, setReaderProgressRecords] = useState<ScraperReaderProgressRecord[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const [newSourceHistoryIds, setNewSourceHistoryIds] = useState<Set<string>>(() => new Set());
  const viewHistoryRecordsByIdRef = useRef<Map<string, ScraperViewHistoryRecord>>(new Map());
  const bookmarkedSourceKeys = useMemo(
    () => new Set(bookmarks.map((bookmark) => getScraperBookmarkKey(bookmark.scraperId, bookmark.sourceUrl))),
    [bookmarks],
  );
  const sourceProgressIndex = useMemo(
    () => buildMultiSearchProgressIndex(readerProgressRecords),
    [readerProgressRecords],
  );
  const trackedSourceHistoryIds = useMemo(
    () => trackedSources
      .map((source) => buildScraperViewHistoryCardId(
        buildSearchResultViewHistoryIdentity(source.scraper.id, source.result),
      ))
      .filter((id) => id.length > 0),
    [trackedSources],
  );
  const trackedSourceHistoryKey = useMemo(
    () => trackedSourceHistoryIds.join("|"),
    [trackedSourceHistoryIds],
  );

  useEffect(() => {
    viewHistoryRecordsByIdRef.current = viewHistoryRecordsById;
  }, [viewHistoryRecordsById]);

  useEffect(() => {
    setNewSourceHistoryIds(new Set());
  }, [selectedFavoriteId]);

  useEffect(() => {
    if (!trackedSourceHistoryIds.length) {
      setNewSourceHistoryIds(new Set());
      return;
    }

    if (!viewHistoryLoaded) {
      return;
    }

    const historySnapshot = viewHistoryRecordsByIdRef.current;
    const sourceIds = new Set(trackedSourceHistoryIds);

    setNewSourceHistoryIds((currentIds) => {
      const nextIds = new Set(Array.from(currentIds).filter((id) => sourceIds.has(id)));

      trackedSourceHistoryIds.forEach((id) => {
        if (!historySnapshot.has(id)) {
          nextIds.add(id);
        }
      });

      const hasChanged = nextIds.size !== currentIds.size
        || Array.from(nextIds).some((id) => !currentIds.has(id));

      return hasChanged ? nextIds : currentIds;
    });
  }, [trackedSourceHistoryIds, trackedSourceHistoryKey, viewHistoryLoaded]);

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
        console.warn(`Failed to load library mangas for ${logLabel}`, loadError);
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
        console.warn(`Failed to load scraper reader progress for ${logLabel}`, progressError);
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
  }, [logLabel]);

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
          homepageActive: false,
          homepagePage: 1,
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
    openInWorkspace = false,
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
        openInWorkspace,
      });
    } catch (openReaderError) {
      setOpenError(
        openReaderError instanceof Error
          ? openReaderError.message
          : "Impossible d'ouvrir le lecteur.",
      );
    }
  }, [location.pathname, location.search, navigate]);

  const handleSetSourcesRead = useCallback(async (
    identities: ScraperViewHistoryCardIdentity[],
    read: boolean,
  ) => {
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

  return {
    libraryMangas,
    bookmarkedSourceKeys,
    sourceProgressIndex,
    viewHistoryLoaded,
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
  };
}
