import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ScraperRecord } from "@/shared/scraper";
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
import type {
  MultiSearchDepthMode,
  MultiSearchMergeMode,
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
  const [mergeMode, setMergeMode] = useState<MultiSearchMergeMode>("strict");
  const [viewMode, setViewMode] = useState<MultiSearchViewMode>("merged");
  const [openError, setOpenError] = useState<string | null>(null);
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
        setMergeMode(restoredState.mergeMode);
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
      mergeMode,
      viewMode,
    }, runs);
  }, [
    advancedPages,
    depthMode,
    mergeMode,
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
    () => mergeMultiSearchResults(allSources, mergeMode),
    [allSources, mergeMode],
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
        mergeMode={mergeMode}
        viewMode={viewMode}
        isSearching={isSearching}
        canSubmit={selectedScrapers.length > 0}
        onSubmit={handleSubmit}
        onQueryChange={setQuery}
        onDepthModeChange={setDepthMode}
        onAdvancedPagesChange={setAdvancedPages}
        onPaceModeChange={setPaceMode}
        onMergeModeChange={setMergeMode}
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
        onOpenSource={handleOpenSource}
        onOpenSourceInWorkspace={handleOpenSourceInWorkspace}
      />
    </section>
  );
}
