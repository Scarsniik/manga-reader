import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ScraperRecord } from "@/shared/scraper";
import { useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import type { Manga } from "@/renderer/types";
import MultiSearchControls, { getDepthPages } from "@/renderer/components/MultiSearch/MultiSearchControls";
import MultiSearchFilters, {
  type MultiSearchCheckboxOption,
} from "@/renderer/components/MultiSearch/MultiSearchFilters";
import MultiSearchResultsSection from "@/renderer/components/MultiSearch/MultiSearchResultsSection";
import MultiSearchStatusPanel from "@/renderer/components/MultiSearch/MultiSearchStatusPanel";
import useMultiSearch from "@/renderer/components/MultiSearch/useMultiSearch";
import {
  UNKNOWN_MULTI_SEARCH_VALUE,
  buildContentTypeFilterOptions,
  buildLanguageFilterOptions,
  flattenMultiSearchSources,
  getLanguageLabel,
  getScraperContentTypes,
  getScraperSourceLanguages,
  isSearchableScraper,
  matchesMultiSearchFilters,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import {
  readMultiSearchState,
  saveMultiSearchState,
} from "@/renderer/components/MultiSearch/multiSearchPersistence";
import {
  buildMultiSearchExportPayload,
  buildMultiSearchMergedResultsExportPayload,
} from "@/renderer/components/MultiSearch/multiSearchExport";
import type {
  MultiSearchDepthMode,
  MultiSearchPaceMode,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import "./style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

const formatList = (values: string[], fallback: string): string => (
  values.length ? values.join(", ") : fallback
);

const buildEmptyStatusCounts = (): Record<MultiSearchScraperRun["status"], number> => ({
  idle: 0,
  waiting: 0,
  loading: 0,
  success: 0,
  done: 0,
  error: 0,
});

export default function MultiSearchBrowser({ scrapers }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const initializedSelectionRef = useRef(false);
  const restoredStateRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selectedScraperIds, setSelectedScraperIds] = useState<string[]>([]);
  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>([]);
  const [depthMode, setDepthMode] = useState<MultiSearchDepthMode>("quick");
  const [advancedPages, setAdvancedPages] = useState(3);
  const [paceMode, setPaceMode] = useState<MultiSearchPaceMode>("fast");
  const [viewMode, setViewMode] = useState<MultiSearchViewMode>("merged");
  const [openError, setOpenError] = useState<string | null>(null);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [showMergeReloadButton, setShowMergeReloadButton] = useState(false);
  const [mergeRefreshKey, setMergeRefreshKey] = useState(0);
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const searchableScrapers = useMemo(
    () => scrapers.filter(isSearchableScraper).sort((left, right) => left.name.localeCompare(right.name)),
    [scrapers],
  );
  const {
    runs,
    isSearching,
    message,
    error,
    canLoadMore,
    restoreRuns,
    runSearch,
    loadMoreForAll,
    loadMoreForScraper,
  } = useMultiSearch();
  const { bookmarkMap } = useScraperBookmarks();
  const bookmarkedSourceKeys = useMemo(
    () => new Set(bookmarkMap.keys()),
    [bookmarkMap],
  );

  useEffect(() => {
    const loadLibraryMangas = async () => {
      if (!window.api || typeof window.api.getMangas !== "function") {
        setLibraryMangas([]);
        return;
      }

      try {
        const data = await window.api.getMangas();
        setLibraryMangas(Array.isArray(data) ? data as Manga[] : []);
      } catch (libraryError) {
        console.warn("Failed to load library mangas for multi-search source matching", libraryError);
        setLibraryMangas([]);
      }
    };

    void loadLibraryMangas();

    const onMangasUpdated = () => {
      void loadLibraryMangas();
    };

    window.addEventListener("mangas-updated", onMangasUpdated as EventListener);
    return () => window.removeEventListener("mangas-updated", onMangasUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!window.api || typeof window.api.getAppRuntimeInfo !== "function") {
      setShowMergeReloadButton(window.location.protocol === "http:" || window.location.protocol === "https:");
      return;
    }

    void window.api.getAppRuntimeInfo()
      .then((runtimeInfo: { isDev?: boolean } | null) => {
        setShowMergeReloadButton(Boolean(runtimeInfo?.isDev));
      })
      .catch(() => setShowMergeReloadButton(false));
  }, []);

  useEffect(() => {
    if (!restoredStateRef.current) {
      const restoredState = readMultiSearchState(searchableScrapers);
      restoredStateRef.current = true;
      initializedSelectionRef.current = true;

      if (restoredState) {
        setQuery(restoredState.query);
        setSelectedScraperIds(restoredState.selectedScraperIds);
        setSelectedLanguageCodes(restoredState.selectedLanguageCodes);
        setSelectedContentTypes(restoredState.selectedContentTypes);
        setDepthMode(restoredState.depthMode);
        setAdvancedPages(restoredState.advancedPages);
        setPaceMode(restoredState.paceMode);
        setViewMode(restoredState.viewMode);
        restoreRuns(restoredState.runs, restoredState.paceMode);
        return;
      }
    }

    if (initializedSelectionRef.current) {
      setSelectedScraperIds((currentIds) => (
        currentIds.filter((scraperId) => searchableScrapers.some((scraper) => scraper.id === scraperId))
      ));
      return;
    }

    initializedSelectionRef.current = true;
    setSelectedScraperIds(searchableScrapers.map((scraper) => scraper.id));
  }, [restoreRuns, searchableScrapers]);

  useEffect(() => {
    if (!restoredStateRef.current) {
      return;
    }

    saveMultiSearchState({
      query,
      selectedScraperIds,
      selectedLanguageCodes,
      selectedContentTypes,
      depthMode,
      advancedPages,
      paceMode,
      viewMode,
    }, runs);
  }, [
    advancedPages,
    depthMode,
    paceMode,
    query,
    runs,
    selectedContentTypes,
    selectedLanguageCodes,
    selectedScraperIds,
    viewMode,
  ]);

  const languageOptions = useMemo(
    () => buildLanguageFilterOptions(searchableScrapers),
    [searchableScrapers],
  );
  const contentTypeOptions = useMemo(
    () => buildContentTypeFilterOptions(searchableScrapers),
    [searchableScrapers],
  );
  const selectedScrapers = useMemo(() => (
    searchableScrapers.filter((scraper) => matchesMultiSearchFilters(scraper, {
      selectedScraperIds,
      selectedLanguageCodes,
      selectedContentTypes,
    }))
  ), [searchableScrapers, selectedContentTypes, selectedLanguageCodes, selectedScraperIds]);
  const allSources = useMemo(
    () => flattenMultiSearchSources(runs),
    [runs],
  );
  const mergedResults = useMemo(
    () => mergeMultiSearchResults(allSources),
    [allSources, mergeRefreshKey],
  );
  const statusCounts = useMemo(() => (
    runs.reduce<Record<MultiSearchScraperRun["status"], number>>((counts, run) => {
      counts[run.status] += 1;
      return counts;
    }, buildEmptyStatusCounts())
  ), [runs]);
  const selectedLanguageSummary = useMemo(() => {
    const values = selectedScrapers.flatMap((scraper) => {
      const scraperLanguages = getScraperSourceLanguages(scraper);
      return scraperLanguages.length ? scraperLanguages : [UNKNOWN_MULTI_SEARCH_VALUE];
    });

    return Array.from(new Set(values)).map(getLanguageLabel);
  }, [selectedScrapers]);
  const selectedTypeSummary = useMemo(() => {
    const values = selectedScrapers.flatMap((scraper) => {
      const contentTypes = getScraperContentTypes(scraper);
      return contentTypes.length ? contentTypes : ["Non renseigne"];
    });

    return Array.from(new Set(values));
  }, [selectedScrapers]);
  const scraperOptions = useMemo<MultiSearchCheckboxOption[]>(() => (
    searchableScrapers.map((scraper) => ({
      label: scraper.name,
      value: scraper.id,
      description: [
        formatList(getScraperSourceLanguages(scraper).map(getLanguageLabel), "Langue non renseignee"),
        formatList(getScraperContentTypes(scraper), "Type non renseigne"),
      ].join(" · "),
    }))
  ), [searchableScrapers]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpenError(null);
    void runSearch({
      query,
      scrapers: selectedScrapers,
      maxPages: getDepthPages(depthMode, advancedPages),
      paceMode,
    });
  };

  const handleOpenSource = (source: MultiSearchSourceResult) => {
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
  };

  const handleOpenSourceInWorkspace = (source: MultiSearchSourceResult) => {
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
    }).catch((openWorkspaceError: unknown) => {
      setOpenError(
        openWorkspaceError instanceof Error
          ? openWorkspaceError.message
          : "Impossible d'ouvrir cette source dans un onglet workspace.",
      );
    });
  };

  const handleExportJson = async () => {
    if (!window.api || typeof window.api.openJsonDocument !== "function") {
      setOpenError("L'export JSON n'est pas disponible dans cette version.");
      return;
    }

    setIsExportingJson(true);
    setOpenError(null);

    try {
      const payload = buildMultiSearchExportPayload({
        query,
        viewMode,
        runs,
        mergedResults,
        sourceCount: allSources.length,
      });
      const result = await window.api.openJsonDocument({
        filename: "multi-search-results",
        content: JSON.stringify(payload, null, 2),
      });

      if (!result?.success) {
        throw new Error(String(result?.error || "Impossible d'ouvrir le JSON."));
      }
    } catch (exportError) {
      setOpenError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportMergedResultsJson = async () => {
    if (!window.api || typeof window.api.openJsonDocument !== "function") {
      setOpenError("L'export JSON n'est pas disponible dans cette version.");
      return;
    }

    setIsExportingJson(true);
    setOpenError(null);

    try {
      const payload = buildMultiSearchMergedResultsExportPayload(mergedResults);
      const result = await window.api.openJsonDocument({
        filename: "multi-search-merged-results",
        content: JSON.stringify(payload, null, 2),
      });

      if (!result?.success) {
        throw new Error(String(result?.error || "Impossible d'ouvrir le JSON."));
      }
    } catch (exportError) {
      setOpenError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setIsExportingJson(false);
    }
  };

  return (
    <section className="multi-search">
      <div className="multi-search__hero">
        <div>
          <span className="multi-search__eyebrow">Recherche multi-sources</span>
          <h2>Rechercher sur plusieurs scrappers</h2>
          <p>
            Lance une recherche simultanee, suis l'etat de chaque source, puis ouvre le resultat
            sur le scrapper de ton choix.
          </p>
        </div>
      </div>

      <MultiSearchControls
        query={query}
        depthMode={depthMode}
        advancedPages={advancedPages}
        paceMode={paceMode}
        viewMode={viewMode}
        isSearching={isSearching}
        canSubmit={selectedScrapers.length > 0}
        onSubmit={handleSubmit}
        onQueryChange={setQuery}
        onDepthModeChange={setDepthMode}
        onAdvancedPagesChange={setAdvancedPages}
        onPaceModeChange={setPaceMode}
        onViewModeChange={setViewMode}
      />

      <MultiSearchFilters
        scraperOptions={scraperOptions}
        languageOptions={languageOptions}
        contentTypeOptions={contentTypeOptions}
        selectedScraperIds={selectedScraperIds}
        selectedLanguageCodes={selectedLanguageCodes}
        selectedContentTypes={selectedContentTypes}
        onSelectedScraperIdsChange={setSelectedScraperIds}
        onSelectedLanguageCodesChange={setSelectedLanguageCodes}
        onSelectedContentTypesChange={setSelectedContentTypes}
      />

      <section className="multi-search__panel multi-search__summary">
        <div className="multi-search__summary-main">
          <strong>Recherche sur {selectedScrapers.length} scrapper(s)</strong>
          <span>Langues : {formatList(selectedLanguageSummary, "Toutes")}</span>
          <span>Types : {formatList(selectedTypeSummary, "Tous")}</span>
          <div className="multi-search__summary-counts">
            <span>{statusCounts.done} termine(s)</span>
            <span>{statusCounts.loading} en cours</span>
            <span>{statusCounts.error} erreur(s)</span>
            <span>{statusCounts.waiting} en attente</span>
          </div>
        </div>
      </section>

      {error || openError || message ? (
        <div className={[
          "multi-search__message",
          error || openError ? "is-error" : "is-info",
        ].join(" ")}>
          {error || openError || message}
        </div>
      ) : null}

      <MultiSearchStatusPanel
        runs={runs}
        query={query}
        isSearching={isSearching}
        canLoadMore={canLoadMore}
        onLoadMoreForAll={(nextQuery) => void loadMoreForAll(nextQuery)}
        onLoadMoreForScraper={(scraperId, nextQuery) => void loadMoreForScraper(scraperId, nextQuery)}
      />

      <MultiSearchResultsSection
        viewMode={viewMode}
        runs={runs}
        mergedResults={mergedResults}
        sourceCount={allSources.length}
        libraryMangas={libraryMangas}
        bookmarkedSourceKeys={bookmarkedSourceKeys}
        isExportingJson={isExportingJson}
        showMergeReloadButton={showMergeReloadButton}
        onOpenSource={handleOpenSource}
        onOpenSourceInWorkspace={handleOpenSourceInWorkspace}
        onExportJson={() => void handleExportJson()}
        onExportMergedResultsJson={() => void handleExportMergedResultsJson()}
        onReloadMerge={() => setMergeRefreshKey((currentKey) => currentKey + 1)}
      />
    </section>
  );
}
