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
import useScraperLatestRuns from "@/renderer/components/ScraperLatest/useScraperLatestRuns";
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

const getAuthorPageCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
};

export default function ScraperLatestView({ scrapers }: Props) {
  const { params } = useParams();
  const [activeTab, setActiveTab] = React.useState<LatestTabId>("scrapers");
  const [authorRefreshKey, setAuthorRefreshKey] = React.useState(0);
  const [scraperRefreshKey, setScraperRefreshKey] = React.useState(0);
  const viewHistoryRecordsByIdRef = React.useRef<Map<string, ScraperViewHistoryRecord>>(new Map());
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
    : `latest-scrapers-${scraperRefreshKey}`;
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
    if (activeTab !== "authors" || !authorFavoritesLoaded) {
      return;
    }

    void authorRuns.start();
  }, [activeTab, authorFavoritesLoaded, authorRefreshKey, authorRuns.start]);

  React.useEffect(() => {
    if (activeTab !== "scrapers" || !sourceResults.viewHistoryLoaded) {
      return;
    }

    void scraperRuns.start(
      scrapers,
      scraperResultLimit,
      new Map(viewHistoryRecordsByIdRef.current),
    );
  }, [
    activeTab,
    latestScrapersKey,
    scraperRefreshKey,
    scraperResultLimit,
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
          `${run.loadedPages} page(s) chargee(s)`,
        ].join(" - "),
        error: run.error,
      }))
  ), [activeTab, authorRuns.runs, scraperResultLimit, scraperRuns.runs]);

  const handleReload = React.useCallback(() => {
    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);

    if (activeTab === "authors") {
      setAuthorRefreshKey((currentKey) => currentKey + 1);
      return;
    }

    setScraperRefreshKey((currentKey) => currentKey + 1);
  }, [activeTab, sourceResults]);

  const loading = activeTab === "authors"
    ? authorFavoritesLoading || authorRuns.loading
    : scraperRuns.loading;
  const message = activeTab === "authors"
    ? authorRuns.message
    : scraperRuns.message;
  const error = activeTab === "authors"
    ? authorFavoritesError || authorRuns.error
    : scraperRuns.error;

  return (
    <section className="scraper-latest">
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

      <ScraperLatestResults
        title={activeTab === "authors" ? "Auteurs favoris" : "Scrappers"}
        summary={activeTab === "authors"
          ? `Charge ${authorPageCount} page(s) pour chaque source d'auteur favori.`
          : `Charge jusqu'a ${scraperResultLimit} resultat(s) non vu(s) par scrapper active.`}
        emptyLabel={activeTab === "authors"
          ? "Aucune nouveaute trouvee dans les auteurs favoris charges."
          : "Aucune nouveaute trouvee sur les scrappers actives."}
        sources={activeSources}
        loading={loading}
        message={message}
        error={error}
        openError={sourceResults.openError}
        statusItems={statusItems}
        libraryMangas={sourceResults.libraryMangas}
        bookmarkedSourceKeys={sourceResults.bookmarkedSourceKeys}
        sourceProgressIndex={sourceResults.sourceProgressIndex}
        viewHistoryRecordsById={sourceResults.viewHistoryRecordsById}
        newViewHistoryIds={sourceResults.newSourceHistoryIds}
        languageFilterModes={sourceResults.languageFilterModes}
        onReload={handleReload}
        onOpenSource={sourceResults.handleOpenSource}
        onOpenSourceInWorkspace={sourceResults.handleOpenSourceInWorkspace}
        onOpenProgressReader={(source, page, totalPages, readerMangaId) => void sourceResults.handleOpenProgressReader(
          source,
          page,
          totalPages,
          readerMangaId,
        )}
        onSetSourcesRead={(identities, read) => void sourceResults.handleSetSourcesRead(identities, read)}
        onToggleLanguageFilterMode={sourceResults.handleToggleLanguageFilterMode}
      />
    </section>
  );
}
