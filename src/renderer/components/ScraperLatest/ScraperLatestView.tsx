import React from "react";
import { isScraperViewHistoryUnlimited } from "@/shared/scraper";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { HistoryTabs } from "@/renderer/components/History/HistoryControls";
import useParams from "@/renderer/hooks/useParams";
import { useScraperAuthorFavorites } from "@/renderer/stores/scraperAuthorFavorites";
import useAuthorFavoriteRuns from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import { flattenMultiSearchSources } from "@/renderer/components/MultiSearch/multiSearchUtils";
import useScraperSourceFavoriteResults from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteResults";
import { loadScraperViewHistory } from "@/renderer/stores/scraperViewHistory";
import useScraperLatestRuns, {
  type ScraperLatestSearchMode,
} from "@/renderer/components/ScraperLatest/useScraperLatestRuns";
import {
  getEnabledLatestScrapers,
  getLatestLanguageLabel,
  getLatestScraperLabels,
  normalizeLatestIncludedLanguageCodes,
  normalizeLatestIncludedScraperIds,
  ScraperLatestLanguageIncludeBar,
  ScraperLatestScraperIncludeBar,
} from "@/renderer/components/ScraperLatest/ScraperLatestIncludeFilters";
import ScraperLatestResults from "@/renderer/components/ScraperLatest/ScraperLatestResults";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import "@/renderer/components/History/style.scss";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/ScraperLatest/style.scss";

type Props = {
  scrapers: ScraperRecord[];
};

type LatestTabId = "authors" | "scrapers";

const LATEST_TABS: Array<{
  id: LatestTabId;
  label: string;
}> = [
  { id: "scrapers", label: "Scrappers" },
  { id: "authors", label: "Auteurs" },
];

const buildScrapersById = (scrapers: ScraperRecord[]): Map<string, ScraperRecord> => (
  new Map(scrapers.map((scraper) => [scraper.id, scraper]))
);

const buildAuthorSourceKey = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

const buildCombinedAuthorFavorite = (
  favorites: ScraperAuthorFavoriteRecord[],
  refreshKey: number,
): ScraperAuthorFavoriteRecord | null => {
  const sourcesByKey = new Map<string, ScraperAuthorFavoriteSource>();

  favorites.forEach((favorite) => {
    favorite.sources.forEach((source) => {
      const key = buildAuthorSourceKey(source);
      if (key && !sourcesByKey.has(key)) {
        sourcesByKey.set(key, source);
      }
    });
  });

  const sources = Array.from(sourcesByKey.values());
  if (!sources.length) {
    return null;
  }

  return {
    id: `latest-authors-${refreshKey}`,
    name: "Nouveautes auteurs",
    sources,
    createdAt: String(refreshKey),
    updatedAt: String(refreshKey),
  };
};

const buildLatestScrapersKey = (scrapers: ScraperRecord[]): string => (
  scrapers
    .map((scraper) => [
      scraper.id,
      scraper.updatedAt,
      scraper.globalConfig.latest?.enabled ? "1" : "0",
      scraper.globalConfig.latest?.module ?? "homepage",
      scraper.globalConfig.homeSearch?.query ?? "",
    ].join(":"))
    .join("|")
);

const getScraperResultLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 20;
};

const getScraperDeepPageLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const getAuthorPageCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
};

export default function ScraperLatestView({ scrapers }: Props) {
  const { params, setParams } = useParams();
  const [activeTab, setActiveTab] = React.useState<LatestTabId>("scrapers");
  const [authorRefreshKey, setAuthorRefreshKey] = React.useState(0);
  const [scraperRefreshKey, setScraperRefreshKey] = React.useState(0);
  const [scraperSearchMode, setScraperSearchMode] = React.useState<ScraperLatestSearchMode>("quick");
  const rootRef = React.useRef<HTMLElement | null>(null);
  const viewHistoryRecordsByIdRef = React.useRef<Map<string, ScraperViewHistoryRecord>>(new Map());
  const lastStartedAuthorRefreshKeyRef = React.useRef(0);
  const lastStartedScraperRefreshKeyRef = React.useRef(0);
  const scraperContinueFromQuickScanRef = React.useRef(false);
  const {
    favorites: authorFavorites,
    loaded: authorFavoritesLoaded,
    loading: authorFavoritesLoading,
    error: authorFavoritesError,
  } = useScraperAuthorFavorites();
  const scrapersById = React.useMemo(() => buildScrapersById(scrapers), [scrapers]);
  const combinedAuthorFavorite = React.useMemo(
    () => buildCombinedAuthorFavorite(authorFavorites, authorRefreshKey),
    [authorFavorites, authorRefreshKey],
  );
  const authorPageCount = getAuthorPageCount(params?.scraperAuthorFavoritePageCount);
  const scraperResultLimit = getScraperResultLimit(params?.scraperLatestResultLimit);
  const scraperDeepPageLimit = getScraperDeepPageLimit(params?.scraperLatestDeepPageLimit);
  const scraperIncludedLanguageCodes = React.useMemo(
    () => normalizeLatestIncludedLanguageCodes(params?.scraperLatestIncludedLanguageCodes),
    [params?.scraperLatestIncludedLanguageCodes],
  );
  const scraperIncludedLanguagesKey = scraperIncludedLanguageCodes.join("|");
  const enabledLatestScrapers = React.useMemo(
    () => getEnabledLatestScrapers(scrapers),
    [scrapers],
  );
  const enabledLatestScraperIds = React.useMemo(
    () => enabledLatestScrapers.map((scraper) => scraper.id),
    [enabledLatestScrapers],
  );
  const scraperIncludedScraperIds = React.useMemo(
    () => normalizeLatestIncludedScraperIds(params?.scraperLatestIncludedScraperIds),
    [params?.scraperLatestIncludedScraperIds],
  );
  const scraperIncludedScrapersKey = scraperIncludedScraperIds.join("|");
  const shouldWarnAboutLimitedViewHistory = params ? !isScraperViewHistoryUnlimited(params) : false;
  const authorRuns = useAuthorFavoriteRuns(combinedAuthorFavorite, scrapersById, {
    initialPageCount: authorPageCount,
    cacheResults: false,
  });
  const scraperRuns = useScraperLatestRuns();
  const authorSources = React.useMemo(
    () => flattenMultiSearchSources(authorRuns.runs),
    [authorRuns.runs],
  );
  const scraperSources = React.useMemo(
    () => flattenMultiSearchSources(scraperRuns.runs),
    [scraperRuns.runs],
  );
  const activeSources: MultiSearchSourceResult[] = activeTab === "authors" ? authorSources : scraperSources;
  const selectedFavoriteId = activeTab === "authors"
    ? combinedAuthorFavorite?.id ?? `latest-authors-empty-${authorRefreshKey}`
    : [
      "latest-scrapers",
      scraperRefreshKey,
      scraperIncludedLanguagesKey || "all-languages",
      scraperIncludedScrapersKey || "all-scrapers",
    ].join("-");
  const sourceResults = useScraperSourceFavoriteResults({
    selectedFavoriteId,
    trackedSources: activeSources,
    logLabel: activeTab === "authors" ? "latest authors" : "latest scrapers",
  });
  const latestScrapersKey = React.useMemo(
    () => buildLatestScrapersKey(scrapers),
    [scrapers],
  );

  React.useEffect(() => {
    viewHistoryRecordsByIdRef.current = sourceResults.viewHistoryRecordsById;
  }, [sourceResults.viewHistoryRecordsById]);

  React.useEffect(() => {
    if (
      activeTab !== "authors"
      || !authorFavoritesLoaded
      || authorRefreshKey === 0
      || lastStartedAuthorRefreshKeyRef.current === authorRefreshKey
    ) {
      return;
    }

    lastStartedAuthorRefreshKeyRef.current = authorRefreshKey;
    void authorRuns.start();
  }, [activeTab, authorFavoritesLoaded, authorRefreshKey, authorRuns.start]);

  React.useEffect(() => {
    if (
      activeTab !== "scrapers"
      || !sourceResults.viewHistoryLoaded
      || scraperRefreshKey === 0
      || lastStartedScraperRefreshKeyRef.current === scraperRefreshKey
    ) {
      return;
    }

    lastStartedScraperRefreshKeyRef.current = scraperRefreshKey;
    const continueFromQuickScan = scraperContinueFromQuickScanRef.current;
    scraperContinueFromQuickScanRef.current = false;
    void scraperRuns.start(
      scrapers,
      scraperResultLimit,
      new Map(viewHistoryRecordsByIdRef.current),
      scraperIncludedLanguageCodes,
      {
        searchMode: scraperSearchMode,
        continueFromQuickScan,
        deepPageLimit: scraperDeepPageLimit,
        includedScraperIds: scraperIncludedScraperIds,
      },
    );
  }, [
    activeTab,
    latestScrapersKey,
    scraperIncludedLanguageCodes,
    scraperIncludedLanguagesKey,
    scraperIncludedScraperIds,
    scraperIncludedScrapersKey,
    scraperRefreshKey,
    scraperDeepPageLimit,
    scraperResultLimit,
    scraperSearchMode,
    scraperRuns.start,
    scrapers,
    sourceResults.viewHistoryLoaded,
  ]);

  const statusItems = React.useMemo(() => (
    activeTab === "authors"
      ? authorRuns.runs.map((run) => ({
        key: run.key,
        name: `${run.favoriteSource.name} - ${run.scraper.name}`,
        status: run.status,
        detail: `${run.results.length} source(s), ${run.loadedPages} page(s) chargee(s)`,
        error: run.error,
      }))
      : scraperRuns.runs.map((run) => ({
        key: run.key,
        name: run.scraper.name,
        status: run.status,
        detail: [
          run.module === "search" ? "Recherche" : "Homepage",
          `${run.results.length}/${scraperResultLimit} non vue(s)`,
          run.excludedByLanguageCount > 0 ? `${run.excludedByLanguageCount} ignoree(s) par langue` : "",
          run.checkpointUsed ? "checkpoint utilise" : "",
          run.deepSearch ? "recherche profonde" : "mode rapide",
          `${run.checkedPages} page(s) consultee(s)`,
          run.loadedPages > run.checkedPages ? `jusqu'a la page ${run.loadedPages}` : "",
        ].filter(Boolean).join(" - "),
        error: run.error,
      }))
  ), [activeTab, authorRuns.runs, scraperResultLimit, scraperRuns.runs]);

  const handleScraperIncludedLanguageCodesChange = React.useCallback((nextLanguageCodes: string[]) => {
    setParams({
      scraperLatestIncludedLanguageCodes: normalizeLatestIncludedLanguageCodes(nextLanguageCodes),
    }, {
      remount: false,
    });
    lastStartedScraperRefreshKeyRef.current = 0;
    scraperContinueFromQuickScanRef.current = false;
    setScraperRefreshKey(0);
    setScraperSearchMode("quick");
    scraperRuns.reset();
  }, [scraperRuns, setParams]);

  const handleScraperIncludedScraperIdsChange = React.useCallback((nextScraperIds: string[]) => {
    setParams({
      scraperLatestIncludedScraperIds: normalizeLatestIncludedScraperIds(nextScraperIds, enabledLatestScraperIds),
    }, {
      remount: false,
    });
    lastStartedScraperRefreshKeyRef.current = 0;
    scraperContinueFromQuickScanRef.current = false;
    setScraperRefreshKey(0);
    setScraperSearchMode("quick");
    scraperRuns.reset();
  }, [enabledLatestScraperIds, scraperRuns, setParams]);

  const scraperSummary = React.useMemo(() => {
    const includedScraperLabels = getLatestScraperLabels(scraperIncludedScraperIds, enabledLatestScrapers);
    const baseSummary = `Charge jusqu'a ${scraperResultLimit} resultat(s) non vu(s) par scrapper ${
      scraperIncludedScraperIds.length ? "inclus" : "active"
    }.`;
    const scraperFilterSummary = !enabledLatestScrapers.length
      ? " Aucun scrapper actif dans les nouveautes."
      : !scraperIncludedScraperIds.length
        ? " Scrappers inclus : tous."
        : includedScraperLabels.length
          ? ` Scrappers inclus : ${includedScraperLabels.join(", ")}.`
          : " Aucun scrapper inclus parmi les scrappers actifs.";
    const deepPageLimitSummary = scraperDeepPageLimit > 0
      ? ` Scan profond limite a ${scraperDeepPageLimit} page(s).`
      : " Scan profond sans limite de pages.";
    if (!scraperIncludedLanguageCodes.length) {
      return `${baseSummary}${scraperFilterSummary}${deepPageLimitSummary}`;
    }

    return `${baseSummary}${scraperFilterSummary} Langues incluses : ${scraperIncludedLanguageCodes.map(getLatestLanguageLabel).join(", ")}.${deepPageLimitSummary}`;
  }, [
    enabledLatestScrapers,
    scraperDeepPageLimit,
    scraperIncludedLanguageCodes,
    scraperIncludedScraperIds,
    scraperResultLimit,
  ]);

  const refreshViewHistorySnapshot = React.useCallback(async () => {
    try {
      const records = await loadScraperViewHistory(true);
      viewHistoryRecordsByIdRef.current = new Map(records.map((record) => [record.id, record]));
    } catch (viewHistoryError) {
      console.warn("Failed to refresh scraper view history before latest scan", viewHistoryError);
    }
  }, []);

  const handleReload = React.useCallback(async () => {
    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);

    if (activeTab === "authors") {
      setAuthorRefreshKey((currentKey) => currentKey + 1);
      return;
    }

    await refreshViewHistorySnapshot();
    scraperContinueFromQuickScanRef.current = false;
    setScraperSearchMode("quick");
    setScraperRefreshKey((currentKey) => currentKey + 1);
  }, [activeTab, refreshViewHistorySnapshot, sourceResults]);

  const handleSearchDeeper = React.useCallback(async () => {
    if (activeTab !== "scrapers") {
      return;
    }

    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);
    await refreshViewHistorySnapshot();
    scraperContinueFromQuickScanRef.current = false;
    setScraperSearchMode("deep");
    setScraperRefreshKey((currentKey) => currentKey + 1);
  }, [activeTab, refreshViewHistorySnapshot, sourceResults]);

  const handleContinueScan = React.useCallback(async () => {
    if (activeTab !== "scrapers") {
      return;
    }

    rootRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);
    await refreshViewHistorySnapshot();
    scraperContinueFromQuickScanRef.current = scraperSearchMode === "quick";
    setScraperSearchMode(scraperSearchMode);
    setScraperRefreshKey((currentKey) => currentKey + 1);
  }, [activeTab, refreshViewHistorySnapshot, scraperSearchMode, sourceResults]);

  const loading = activeTab === "authors"
    ? authorFavoritesLoading || authorRuns.loading
    : scraperRuns.loading;
  const message = activeTab === "authors"
    ? authorRuns.message
    : scraperRuns.message;
  const error = activeTab === "authors"
    ? authorFavoritesError || authorRuns.error
    : scraperRuns.error;
  const activeTabHasStarted = activeTab === "authors"
    ? authorRefreshKey > 0
    : scraperRefreshKey > 0;

  return (
    <section ref={rootRef} className="scraper-latest">
      <div className="scraper-latest__header">
        <div>
          <h2>Nouveautes</h2>
          <p>Cartes fusionnees qui sont encore marquees comme nouvelles.</p>
        </div>
        <HistoryTabs
          tabs={LATEST_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          ariaLabel="Sections des nouveautes"
        />
      </div>

      {shouldWarnAboutLimitedViewHistory ? (
        <div className="multi-search__message is-warning">
          L'historique des cards vues n'est pas illimite. Les nouveautes peuvent reafficher des cards deja vues
          apres nettoyage ; mets la limite et les deux conservations a 0 pour un suivi complet.
        </div>
      ) : null}

      {activeTab === "scrapers" ? (
        <div className="scraper-latest__filters">
          <ScraperLatestScraperIncludeBar
            scrapers={enabledLatestScrapers}
            value={scraperIncludedScraperIds}
            onChange={handleScraperIncludedScraperIdsChange}
          />
          <ScraperLatestLanguageIncludeBar
            value={scraperIncludedLanguageCodes}
            onChange={handleScraperIncludedLanguageCodesChange}
          />
        </div>
      ) : null}

      <ScraperLatestResults
        title={activeTab === "authors" ? "Auteurs favoris" : "Scrappers"}
        summary={activeTab === "authors"
          ? `Charge ${authorPageCount} page(s) pour chaque source d'auteur favori.`
          : scraperSummary}
        emptyLabel={activeTab === "authors"
          ? activeTabHasStarted
            ? "Aucune nouveaute trouvee dans les auteurs favoris charges."
            : "Lance le chargement pour chercher les nouveautes des auteurs favoris."
          : activeTabHasStarted
            ? "Aucune nouveaute trouvee sur les scrappers actives."
            : "Lance un scan rapide ou profond pour chercher les nouveautes des scrappers actifs."}
        sources={activeSources}
        loading={loading}
        message={message}
        error={error}
        openError={sourceResults.openError}
        statusItems={statusItems}
        actionLabel={activeTab === "scrapers" ? "Scan rapide" : activeTabHasStarted ? "Recharger" : "Charger"}
        secondaryActionLabel={activeTab === "scrapers" ? "Scan profond" : undefined}
        continueActionLabel={activeTab === "scrapers" ? "Continuer" : undefined}
        libraryMangas={sourceResults.libraryMangas}
        bookmarkedSourceKeys={sourceResults.bookmarkedSourceKeys}
        sourceProgressIndex={sourceResults.sourceProgressIndex}
        viewHistoryRecordsById={sourceResults.viewHistoryRecordsById}
        newViewHistoryIds={sourceResults.newSourceHistoryIds}
        languageFilterModes={sourceResults.languageFilterModes}
        onReload={handleReload}
        onSecondaryAction={activeTab === "scrapers" ? handleSearchDeeper : undefined}
        onContinue={activeTab === "scrapers" ? handleContinueScan : undefined}
        onOpenSource={sourceResults.handleOpenSource}
        onOpenSourceInWorkspace={sourceResults.handleOpenSourceInWorkspace}
        onOpenProgressReader={(source, page, totalPages, readerMangaId, openInWorkspace) => void sourceResults.handleOpenProgressReader(
          source,
          page,
          totalPages,
          readerMangaId,
          openInWorkspace,
        )}
        onSetSourcesRead={(identities, read) => void sourceResults.handleSetSourcesRead(identities, read)}
        onToggleLanguageFilterMode={sourceResults.handleToggleLanguageFilterMode}
      />
    </section>
  );
}
