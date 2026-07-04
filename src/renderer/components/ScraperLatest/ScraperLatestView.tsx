import React from "react";
import { isScraperViewHistoryUnlimited } from "@/shared/scraper";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { HistoryTabs } from "@/renderer/components/History/HistoryControls";
import useParams from "@/renderer/hooks/useParams";
import { useModal } from "@/renderer/hooks/useModal";
import { useScraperAuthorFavorites } from "@/renderer/stores/scraperAuthorFavorites";
import { useScraperTagFavorites } from "@/renderer/stores/scraperTagFavorites";
import useAuthorFavoriteRuns from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import { flattenMultiSearchSources } from "@/renderer/components/MultiSearch/multiSearchUtils";
import { enrichSourceResultsWithCardDetails } from "@/renderer/components/MultiSearch/multiSearchRuntime";
import useScraperSourceFavoriteResults from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteResults";
import { loadScraperViewHistory } from "@/renderer/stores/scraperViewHistory";
import { getScraperTagBlacklistEntries } from "@/renderer/utils/scraperTagBlacklist";
import useScraperLatestRuns, {
  type ScraperLatestSearchMode,
} from "@/renderer/components/ScraperLatest/useScraperLatestRuns";
import {
  getEnabledLatestScrapers,
  getIncludedLatestAuthorFavorites,
  getIncludedLatestTagFavorites,
  getLatestLanguageLabel,
  LATEST_ALL_TAG_FAVORITES_VALUE,
  LATEST_NO_AUTHOR_FAVORITES_VALUE,
  LATEST_NO_SCRAPERS_VALUE,
  normalizeLatestIncludedAuthorFavoriteIds,
  normalizeLatestIncludedLanguageCodes,
  normalizeLatestIncludedScraperIds,
  normalizeLatestIncludedTagFavoriteIds,
  ScraperLatestAuthorFavoriteIncludeBar,
  ScraperLatestLanguageIncludeBar,
  ScraperLatestScraperIncludeBar,
  ScraperLatestTagFavoriteIncludeBar,
} from "@/renderer/components/ScraperLatest/ScraperLatestIncludeFilters";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import ScraperLatestResults from "@/renderer/components/ScraperLatest/ScraperLatestResults";
import buildScraperLatestSessionSettingsModal, {
  type ScraperLatestSessionSettings,
} from "@/renderer/components/ScraperLatest/ScraperLatestSessionSettingsModal";
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
  { id: "scrapers", label: "Sources" },
  { id: "authors", label: "Auteurs" },
];

const buildScrapersById = (scrapers: ScraperRecord[]): Map<string, ScraperRecord> => (
  new Map(scrapers.map((scraper) => [scraper.id, scraper]))
);

const buildAuthorSourceKey = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

const buildLatestSourceEnrichmentKey = (source: MultiSearchSourceResult): string => [
  source.scraper.id,
  source.pageIndex,
  source.searchTerm,
  source.result.detailUrl || source.result.authorUrl || source.result.title,
].join("::");

const sourceHasTags = (source: MultiSearchSourceResult): boolean => (
  Boolean(source.result.tags?.length)
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

const buildLatestTagFavoritesKey = (favorites: ScraperTagFavoriteRecord[]): string => (
  favorites
    .map((favorite) => [
      favorite.id,
      favorite.updatedAt,
      favorite.sources
        .map((source) => `${source.scraperId}:${source.tagUrl}:${source.updatedAt}`)
        .join(","),
    ].join(":"))
    .join("|")
);

const buildLatestTagBlacklistKey = (blacklist: unknown): string => {
  if (!blacklist || typeof blacklist !== "object" || Array.isArray(blacklist)) {
    return "";
  }

  return Object.entries(blacklist as Record<string, unknown>)
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([scraperId, rawEntries]) => [
      scraperId,
      Array.isArray(rawEntries)
        ? rawEntries
          .map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
              return String(entry ?? "");
            }

            const data = entry as Record<string, unknown>;
            return `${String(data.value ?? "")}:${String(data.label ?? "")}`;
          })
          .sort()
          .join(",")
        : "",
    ].join(":"))
    .join("|");
};

const getScraperResultLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 20;
};

const getScraperLanguageRejectLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 60;
};

const getScraperDeepPageLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const getScraperQuickConsecutiveSeenStopThreshold = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 2;
};

const getScraperLatestConcurrency = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 2;
};

const getAuthorPageCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
};

const filterRecordsByIncludeValues = <RecordType,>(
  records: readonly RecordType[],
  values: readonly string[],
  getId: (record: RecordType) => string,
  defaultMode: "all" | "none",
): RecordType[] => {
  const { includedValues, excludedValues } = splitIncludeFilterValues(values);
  const excludedValueSet = new Set(excludedValues);

  if (includedValues.length) {
    const includedValueSet = new Set(includedValues);
    return records.filter((record) => {
      const recordId = getId(record);
      return includedValueSet.has(recordId) && !excludedValueSet.has(recordId);
    });
  }

  if (!excludedValues.length && defaultMode === "none") {
    return [];
  }

  return records.filter((record) => !excludedValueSet.has(getId(record)));
};

const formatIncludeValuesSummary = (
  values: readonly string[],
  labelsById: Map<string, string>,
  allLabel: string,
): string => {
  const { includedValues, excludedValues } = splitIncludeFilterValues(values);
  const includedLabels = includedValues
    .map((value) => labelsById.get(value))
    .filter((label): label is string => Boolean(label));
  const excludedLabels = excludedValues
    .map((value) => labelsById.get(value))
    .filter((label): label is string => Boolean(label));

  if (!includedLabels.length && !excludedLabels.length) {
    return allLabel;
  }

  if (!includedLabels.length) {
    return `${allLabel} sauf ${excludedLabels.join(", ")}`;
  }

  if (!excludedLabels.length) {
    return includedLabels.join(", ");
  }

  return `${includedLabels.join(", ")} sauf ${excludedLabels.join(", ")}`;
};

export default function ScraperLatestView({ scrapers }: Props) {
  const { params, setParams } = useParams();
  const { openModal } = useModal();
  const [activeTab, setActiveTab] = React.useState<LatestTabId>("scrapers");
  const [authorRefreshKey, setAuthorRefreshKey] = React.useState(0);
  const [scraperRefreshKey, setScraperRefreshKey] = React.useState(0);
  const [scraperSearchMode, setScraperSearchMode] = React.useState<ScraperLatestSearchMode>("quick");
  const [scraperContinueCount, setScraperContinueCount] = React.useState(1);
  const [scraperSessionSettings, setScraperSessionSettings] = React.useState<
    ScraperLatestSessionSettings | null
  >(null);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const viewHistoryRecordsByIdRef = React.useRef<Map<string, ScraperViewHistoryRecord>>(new Map());
  const lastStartedAuthorRefreshKeyRef = React.useRef(0);
  const lastStartedScraperRefreshKeyRef = React.useRef(0);
  const {
    favorites: authorFavorites,
    loaded: authorFavoritesLoaded,
    loading: authorFavoritesLoading,
    error: authorFavoritesError,
  } = useScraperAuthorFavorites();
  const {
    favorites: tagFavorites,
    loaded: tagFavoritesLoaded,
    loading: tagFavoritesLoading,
    error: tagFavoritesError,
  } = useScraperTagFavorites();
  const scrapersById = React.useMemo(() => buildScrapersById(scrapers), [scrapers]);
  const authorFavoriteIds = React.useMemo(
    () => authorFavorites.map((favorite) => favorite.id),
    [authorFavorites],
  );
  const authorIncludedFavoriteIds = React.useMemo(
    () => normalizeLatestIncludedAuthorFavoriteIds(
      params?.scraperLatestIncludedAuthorFavoriteIds,
      authorFavoritesLoaded ? authorFavoriteIds : undefined,
    ),
    [authorFavoriteIds, authorFavoritesLoaded, params?.scraperLatestIncludedAuthorFavoriteIds],
  );
  const authorIncludedFavorites = React.useMemo(
    () => getIncludedLatestAuthorFavorites(authorFavorites, authorIncludedFavoriteIds),
    [authorFavorites, authorIncludedFavoriteIds],
  );
  const authorIncludedFavoritesKey = authorIncludedFavoriteIds.join("|");
  const authorIncludesNoFavorites = authorIncludedFavoriteIds.includes(LATEST_NO_AUTHOR_FAVORITES_VALUE);
  const includedAuthorSourceCount = React.useMemo(
    () => authorIncludedFavorites.reduce((count, favorite) => (
      count + favorite.sources.filter((source) => scrapersById.has(source.scraperId)).length
    ), 0),
    [authorIncludedFavorites, scrapersById],
  );
  const shouldWaitForIncludedAuthorFavorites = authorIncludedFavoriteIds.length > 0 && !authorFavoritesLoaded;
  const authorSelectionError = authorFavoritesLoaded && !shouldWaitForIncludedAuthorFavorites && includedAuthorSourceCount === 0
    ? "Selectionne au moins un auteur favori avant de charger les nouveautes auteurs."
    : null;
  const authorActionsDisabled = Boolean(authorSelectionError) || shouldWaitForIncludedAuthorFavorites;
  const combinedAuthorFavorite = React.useMemo(
    () => buildCombinedAuthorFavorite(authorIncludedFavorites, authorRefreshKey),
    [authorIncludedFavorites, authorRefreshKey],
  );
  const authorPageCount = getAuthorPageCount(params?.scraperAuthorFavoritePageCount);
  const authorIncludedLanguageCodes = React.useMemo(
    () => normalizeLatestIncludedLanguageCodes(params?.scraperLatestAuthorIncludedLanguageCodes),
    [params?.scraperLatestAuthorIncludedLanguageCodes],
  );
  const authorIncludedLanguagesKey = authorIncludedLanguageCodes.join("|");
  const defaultScraperResultLimit = getScraperResultLimit(
    params?.scraperLatestScraperResultLimit ?? params?.scraperLatestResultLimit,
  );
  const defaultTagResultLimit = getScraperResultLimit(
    params?.scraperLatestTagResultLimit ?? params?.scraperLatestResultLimit,
  );
  const defaultScraperLanguageRejectLimit = getScraperLanguageRejectLimit(params?.scraperLatestLanguageRejectLimit);
  const defaultScraperDeepPageLimit = getScraperDeepPageLimit(params?.scraperLatestDeepPageLimit);
  const defaultScraperQuickConsecutiveSeenStopThreshold = getScraperQuickConsecutiveSeenStopThreshold(
    params?.scraperLatestQuickConsecutiveSeenStopThreshold,
  );
  const defaultScraperLatestConcurrency = getScraperLatestConcurrency(params?.scraperLatestConcurrency);
  const scraperResultLimit = scraperSessionSettings?.scraperResultLimit ?? defaultScraperResultLimit;
  const tagResultLimit = scraperSessionSettings?.tagResultLimit ?? defaultTagResultLimit;
  const scraperLanguageRejectLimit = scraperSessionSettings?.languageRejectLimit ?? defaultScraperLanguageRejectLimit;
  const scraperDeepPageLimit = scraperSessionSettings?.deepPageLimit ?? defaultScraperDeepPageLimit;
  const scraperQuickConsecutiveSeenStopThreshold = scraperSessionSettings?.quickConsecutiveSeenStopThreshold
    ?? defaultScraperQuickConsecutiveSeenStopThreshold;
  const scraperLatestConcurrency = scraperSessionSettings?.concurrency ?? defaultScraperLatestConcurrency;
  const hasScraperSessionSettingsOverride = scraperSessionSettings !== null;
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
  const scraperIncludesNoScrapers = scraperIncludedScraperIds.includes(LATEST_NO_SCRAPERS_VALUE);
  const includedLatestScrapers = React.useMemo(() => {
    if (scraperIncludesNoScrapers) {
      return [];
    }

    return filterRecordsByIncludeValues(
      enabledLatestScrapers,
      scraperIncludedScraperIds,
      (scraper) => scraper.id,
      "all",
    );
  }, [enabledLatestScrapers, scraperIncludedScraperIds, scraperIncludesNoScrapers]);
  const includedLatestScraperCount = includedLatestScrapers.length;
  const tagFavoriteIds = React.useMemo(
    () => tagFavorites.map((favorite) => favorite.id),
    [tagFavorites],
  );
  const scraperIncludedTagFavoriteIds = React.useMemo(
    () => normalizeLatestIncludedTagFavoriteIds(
      params?.scraperLatestIncludedTagFavoriteIds,
      tagFavoritesLoaded ? tagFavoriteIds : undefined,
    ),
    [params?.scraperLatestIncludedTagFavoriteIds, tagFavoriteIds, tagFavoritesLoaded],
  );
  const scraperIncludedTagFavorites = React.useMemo(
    () => getIncludedLatestTagFavorites(tagFavorites, scraperIncludedTagFavoriteIds),
    [scraperIncludedTagFavoriteIds, tagFavorites],
  );
  const includedTagFavoriteSourceCount = React.useMemo(
    () => scraperIncludedTagFavorites.reduce((count, favorite) => (
      count + favorite.sources.filter((source) => scrapersById.has(source.scraperId)).length
    ), 0),
    [scraperIncludedTagFavorites, scrapersById],
  );
  const scraperIncludedTagFavoritesKey = scraperIncludedTagFavoriteIds.join("|");
  const shouldWaitForIncludedTagFavorites = scraperIncludedTagFavoriteIds.length > 0 && !tagFavoritesLoaded;
  const hasRunnableLatestSource = includedLatestScraperCount + includedTagFavoriteSourceCount > 0;
  const scraperSelectionError = !shouldWaitForIncludedTagFavorites && !hasRunnableLatestSource
    ? "Selectionne au moins un scrapper ou un tag favori avant de lancer un scan."
    : null;
  const scraperActionsDisabled = Boolean(scraperSelectionError) || shouldWaitForIncludedTagFavorites;
  const shouldWarnAboutLimitedViewHistory = params ? !isScraperViewHistoryUnlimited(params) : false;
  const authorRuns = useAuthorFavoriteRuns(combinedAuthorFavorite, scrapersById, {
    initialPageCount: authorPageCount,
    cacheResults: false,
    concurrency: scraperLatestConcurrency,
    scrapeDetailsWithCards: params?.scraperScrapeDetailsWithCards === true,
    includedLanguageCodes: authorIncludedLanguageCodes,
  });
  const scraperRuns = useScraperLatestRuns();
  const authorSources = React.useMemo(
    () => flattenMultiSearchSources(authorRuns.runs),
    [authorRuns.runs],
  );
  const scraperSources = React.useMemo(
    () => scraperRuns.runs.flatMap((run) => [...run.results].reverse()),
    [scraperRuns.runs],
  );
  const baseActiveSources: MultiSearchSourceResult[] = activeTab === "authors" ? authorSources : scraperSources;
  const [blacklistEnrichedSourcesByKey, setBlacklistEnrichedSourcesByKey] = React.useState<
    Map<string, MultiSearchSourceResult>
  >(() => new Map());
  const blacklistEnrichmentAttemptedKeysRef = React.useRef<Set<string>>(new Set());
  const activeSources = React.useMemo(
    () => baseActiveSources.map((source) => (
      blacklistEnrichedSourcesByKey.get(buildLatestSourceEnrichmentKey(source)) ?? source
    )),
    [baseActiveSources, blacklistEnrichedSourcesByKey],
  );
  const latestTagBlacklistKey = React.useMemo(
    () => buildLatestTagBlacklistKey(params?.scraperBlacklistedTagsByScraper),
    [params?.scraperBlacklistedTagsByScraper],
  );
  const selectedFavoriteId = activeTab === "authors"
    ? [
      combinedAuthorFavorite?.id ?? `latest-authors-empty-${authorRefreshKey}`,
      authorIncludedFavoritesKey || "all-authors",
      authorIncludedLanguagesKey || "all-languages",
    ].join("-")
    : [
      "latest-sources",
      scraperRefreshKey,
      scraperIncludedLanguagesKey || "all-languages",
      scraperIncludedScrapersKey || "all-scrapers",
      scraperIncludedTagFavoritesKey || "no-tag-favorites",
      params?.scraperHideBlacklistedTagCards === true ? "exclude-blacklisted" : "show-blacklisted",
      latestTagBlacklistKey || "no-blacklist",
    ].join("-");

  React.useEffect(() => {
    blacklistEnrichmentAttemptedKeysRef.current.clear();
    setBlacklistEnrichedSourcesByKey(new Map());
  }, [params?.scraperBlacklistedTagsByScraper, selectedFavoriteId]);

  const sourceResults = useScraperSourceFavoriteResults({
    selectedFavoriteId,
    trackedSources: activeSources,
    logLabel: activeTab === "authors" ? "latest authors" : "latest sources",
  });
  const latestScrapersKey = React.useMemo(
    () => buildLatestScrapersKey(scrapers),
    [scrapers],
  );
  const latestTagFavoritesKey = React.useMemo(
    () => buildLatestTagFavoritesKey(tagFavorites),
    [tagFavorites],
  );

  React.useEffect(() => {
    viewHistoryRecordsByIdRef.current = sourceResults.viewHistoryRecordsById;
  }, [sourceResults.viewHistoryRecordsById]);

  React.useEffect(() => {
    if (params?.scraperScrapeDetailsWithCards !== true) {
      return undefined;
    }

    const blacklist = params.scraperBlacklistedTagsByScraper;
    if (!blacklist || Object.keys(blacklist).length === 0) {
      return undefined;
    }

    const sourcesToEnrich = baseActiveSources.filter((source) => {
      if (
        sourceHasTags(source)
        || !source.result.detailUrl
        || !getScraperTagBlacklistEntries(blacklist, source.scraper.id).length
      ) {
        return false;
      }

      const key = buildLatestSourceEnrichmentKey(source);
      if (
        blacklistEnrichmentAttemptedKeysRef.current.has(key)
        || blacklistEnrichedSourcesByKey.has(key)
      ) {
        return false;
      }

      blacklistEnrichmentAttemptedKeysRef.current.add(key);
      return true;
    });

    if (!sourcesToEnrich.length) {
      return undefined;
    }

    let cancelled = false;
    const sourcesByScraperId = sourcesToEnrich.reduce<Map<string, MultiSearchSourceResult[]>>((groups, source) => {
      const group = groups.get(source.scraper.id) ?? [];
      group.push(source);
      groups.set(source.scraper.id, group);
      return groups;
    }, new Map());

    void Promise.all(Array.from(sourcesByScraperId.values()).map(async (sources) => {
      const scraper = sources[0]?.scraper;
      if (!scraper) {
        return [];
      }

      return enrichSourceResultsWithCardDetails(scraper, sources, {
        scrapeDetailsWithCards: true,
      });
    }))
      .then((groups) => {
        if (cancelled) {
          return;
        }

        const enrichedSources = groups.flat();
        if (!enrichedSources.length) {
          return;
        }

        setBlacklistEnrichedSourcesByKey((currentSources) => {
          let changed = false;
          const nextSources = new Map(currentSources);

          enrichedSources.forEach((source) => {
            if (!sourceHasTags(source)) {
              return;
            }

            nextSources.set(buildLatestSourceEnrichmentKey(source), source);
            changed = true;
          });

          return changed ? nextSources : currentSources;
        });
      })
      .catch((error) => {
        console.warn("Failed to enrich latest sources for tag blacklist", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    baseActiveSources,
    blacklistEnrichedSourcesByKey,
    params?.scraperBlacklistedTagsByScraper,
    params?.scraperScrapeDetailsWithCards,
  ]);

  React.useEffect(() => {
    if (
      activeTab !== "authors"
      || !authorFavoritesLoaded
      || authorActionsDisabled
      || authorRefreshKey === 0
      || lastStartedAuthorRefreshKeyRef.current === authorRefreshKey
    ) {
      return;
    }

    lastStartedAuthorRefreshKeyRef.current = authorRefreshKey;
    void authorRuns.start();
  }, [activeTab, authorActionsDisabled, authorFavoritesLoaded, authorRefreshKey, authorRuns.start]);

  const startScraperScan = React.useCallback(async (
    options: {
      searchMode: ScraperLatestSearchMode;
      continueFromQuickScan?: boolean;
      preserveCurrentResults?: boolean;
    },
  ) => {
    await scraperRuns.start(
      scrapers,
      scraperResultLimit,
      new Map(viewHistoryRecordsByIdRef.current),
      scraperIncludedLanguageCodes,
      {
        searchMode: options.searchMode,
        continueFromQuickScan: options.continueFromQuickScan === true,
        preserveCurrentResults: options.preserveCurrentResults === true,
        quickConsecutiveSeenStopThreshold: scraperQuickConsecutiveSeenStopThreshold,
        deepPageLimit: scraperDeepPageLimit,
        concurrency: scraperLatestConcurrency,
        tagResultLimit,
        languageRejectLimit: scraperLanguageRejectLimit,
        includedScraperIds: scraperIncludedScraperIds,
        tagFavorites: scraperIncludedTagFavorites,
        scrapeDetailsWithCards: params?.scraperScrapeDetailsWithCards === true,
        excludeBlacklistedTagCards: params?.scraperHideBlacklistedTagCards === true,
        tagBlacklistByScraper: params?.scraperBlacklistedTagsByScraper,
      },
    );
  }, [
    params?.scraperBlacklistedTagsByScraper,
    params?.scraperHideBlacklistedTagCards,
    params?.scraperScrapeDetailsWithCards,
    scraperDeepPageLimit,
    scraperIncludedLanguageCodes,
    scraperIncludedScraperIds,
    scraperIncludedTagFavorites,
    scraperLanguageRejectLimit,
    scraperLatestConcurrency,
    scraperQuickConsecutiveSeenStopThreshold,
    scraperResultLimit,
    scraperRuns.start,
    scrapers,
    tagResultLimit,
  ]);

  React.useEffect(() => {
    if (
      activeTab !== "scrapers"
      || !sourceResults.viewHistoryLoaded
      || shouldWaitForIncludedTagFavorites
      || scraperRefreshKey === 0
      || lastStartedScraperRefreshKeyRef.current === scraperRefreshKey
    ) {
      return;
    }

    lastStartedScraperRefreshKeyRef.current = scraperRefreshKey;
    void startScraperScan({
      searchMode: scraperSearchMode,
      continueFromQuickScan: false,
    });
  }, [
    activeTab,
    latestScrapersKey,
    latestTagFavoritesKey,
    scraperIncludedLanguageCodes,
    scraperIncludedLanguagesKey,
    scraperIncludedScraperIds,
    scraperIncludedScrapersKey,
    scraperIncludedTagFavoritesKey,
    scraperRefreshKey,
    scraperSearchMode,
    shouldWaitForIncludedTagFavorites,
    sourceResults.viewHistoryLoaded,
    startScraperScan,
  ]);

  const getStatusState = React.useCallback((
    status: "waiting" | "loading" | "done" | "error",
    canContinue = false,
  ) => {
    if (status === "waiting" || status === "loading") {
      return "loading";
    }

    if (status === "error") {
      return "error";
    }

    return canContinue ? "continuable" : "complete";
  }, []);

  const statusItems = React.useMemo(() => (
    activeTab === "authors"
      ? authorRuns.runs.map((run) => ({
        key: run.key,
        name: `${run.favoriteSource.name} - ${run.scraper.name}`,
        status: run.status,
        state: getStatusState(run.status),
        detail: `${run.results.length} source(s), ${run.loadedPages} page(s) chargee(s)`,
        error: run.error,
      }))
      : scraperRuns.runs.map((run) => {
        const runResultLimit = run.sourceKind === "tagFavorite" ? tagResultLimit : scraperResultLimit;
        const canContinue = run.canContinue === true;
        return {
          key: run.key,
          name: run.sourceKind === "tagFavorite"
            ? `${run.favorite?.name ?? run.favoriteSource?.name ?? "Tag favori"} - ${run.scraper.name}`
            : run.scraper.name,
          status: run.status,
          state: getStatusState(run.status, canContinue),
          detail: [
            run.module === "search" ? "Recherche" : run.module === "tag" ? "Tag favori" : "Homepage",
            `${run.results.length}/${runResultLimit} non vue(s)`,
            run.includedByLanguageCount > 0 ? `${run.includedByLanguageCount} acceptee(s) par langue` : "",
            run.excludedByLanguageCount > 0 ? `${run.excludedByLanguageCount} ignoree(s) par langue` : "",
            run.excludedByBlacklistedTagCount > 0 ? `${run.excludedByBlacklistedTagCount} ignoree(s) par blacklist` : "",
            run.languageRejectLimitReached ? "arret langue" : "",
            run.checkpointUsed ? "checkpoint utilise" : "",
            run.deepSearch ? "recherche profonde" : "mode rapide",
            `${run.checkedPages} page(s) consultee(s)`,
            run.loadedPages > run.checkedPages ? `jusqu'a la page ${run.loadedPages}` : "",
            run.status === "done" && canContinue ? "suite disponible" : "",
            run.status === "done" && !canContinue ? "sans suite" : "",
          ].filter(Boolean).join(" - "),
          error: run.error,
        };
      })
  ), [activeTab, authorRuns.runs, getStatusState, scraperResultLimit, scraperRuns.runs, tagResultLimit]);

  const handleAuthorIncludedFavoriteIdsChange = React.useCallback((nextFavoriteIds: string[]) => {
    setParams({
      scraperLatestIncludedAuthorFavoriteIds: normalizeLatestIncludedAuthorFavoriteIds(
        nextFavoriteIds,
        authorFavoriteIds,
      ),
    }, {
      remount: false,
    });
    lastStartedAuthorRefreshKeyRef.current = 0;
    setAuthorRefreshKey(0);
    authorRuns.reset();
  }, [authorFavoriteIds, authorRuns.reset, setParams]);

  const handleAuthorIncludedLanguageCodesChange = React.useCallback((nextLanguageCodes: string[]) => {
    setParams({
      scraperLatestAuthorIncludedLanguageCodes: normalizeLatestIncludedLanguageCodes(nextLanguageCodes),
    }, {
      remount: false,
    });
    lastStartedAuthorRefreshKeyRef.current = 0;
    setAuthorRefreshKey(0);
    authorRuns.reset();
  }, [authorRuns.reset, setParams]);

  const handleScraperIncludedLanguageCodesChange = React.useCallback((nextLanguageCodes: string[]) => {
    setParams({
      scraperLatestIncludedLanguageCodes: normalizeLatestIncludedLanguageCodes(nextLanguageCodes),
    }, {
      remount: false,
    });
    lastStartedScraperRefreshKeyRef.current = 0;
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
    setScraperRefreshKey(0);
    setScraperSearchMode("quick");
    scraperRuns.reset();
  }, [enabledLatestScraperIds, scraperRuns, setParams]);

  const handleScraperIncludedTagFavoriteIdsChange = React.useCallback((nextFavoriteIds: string[]) => {
    setParams({
      scraperLatestIncludedTagFavoriteIds: normalizeLatestIncludedTagFavoriteIds(nextFavoriteIds, tagFavoriteIds),
    }, {
      remount: false,
    });
    lastStartedScraperRefreshKeyRef.current = 0;
    setScraperRefreshKey(0);
    setScraperSearchMode("quick");
    scraperRuns.reset();
  }, [scraperRuns, setParams, tagFavoriteIds]);

  const authorSummary = React.useMemo(() => {
    const authorLabelsById = new Map(authorFavorites.map((favorite) => [favorite.id, favorite.name]));
    const includedAuthorLabel = formatIncludeValuesSummary(authorIncludedFavoriteIds, authorLabelsById, "tous");
    const languageFilterValues = splitIncludeFilterValues(authorIncludedLanguageCodes);
    const languageLabelsById = new Map([
      ...languageFilterValues.includedValues,
      ...languageFilterValues.excludedValues,
    ].map((languageCode) => [
      languageCode,
      getLatestLanguageLabel(languageCode),
    ]));
    const includedLanguageLabel = formatIncludeValuesSummary(
      authorIncludedLanguageCodes,
      languageLabelsById,
      "toutes",
    );
    const baseSummary = `Charge ${authorPageCount} page(s) pour chaque source d'auteur favori incluse.`
      + ` Jusqu'a ${scraperLatestConcurrency} source(s) chargee(s) en parallele.`;
    const authorFilterSummary = !authorFavoritesLoaded
      ? " Auteurs favoris : chargement."
      : !authorFavorites.length
        ? " Aucun auteur favori disponible."
        : authorIncludesNoFavorites
          ? " Auteurs favoris inclus : aucun."
          : !authorIncludedFavoriteIds.length
            ? " Auteurs favoris inclus : tous."
            : ` Auteurs favoris inclus : ${includedAuthorLabel}.`;

    return `${baseSummary}${authorFilterSummary} Langues incluses : ${includedLanguageLabel}.`;
  }, [
    authorFavorites,
    authorFavoritesLoaded,
    authorIncludesNoFavorites,
    authorIncludedFavoriteIds,
    authorIncludedLanguageCodes,
    authorPageCount,
    scraperLatestConcurrency,
  ]);

  const scraperSummary = React.useMemo(() => {
    const scraperLabelsById = new Map(enabledLatestScrapers.map((scraper) => [scraper.id, scraper.name]));
    const tagFavoriteLabelsById = new Map(tagFavorites.map((favorite) => [favorite.id, favorite.name]));
    const languageFilterValues = splitIncludeFilterValues(scraperIncludedLanguageCodes);
    const languageLabelsById = new Map([
      ...languageFilterValues.includedValues,
      ...languageFilterValues.excludedValues,
    ].map((languageCode) => [
      languageCode,
      getLatestLanguageLabel(languageCode),
    ]));
    const includedScraperLabel = formatIncludeValuesSummary(
      scraperIncludedScraperIds,
      scraperLabelsById,
      "tous",
    );
    const includedTagFavoriteLabel = formatIncludeValuesSummary(
      scraperIncludedTagFavoriteIds,
      tagFavoriteLabelsById,
      "tous",
    );
    const includedLanguageLabel = formatIncludeValuesSummary(
      scraperIncludedLanguageCodes,
      languageLabelsById,
      "toutes",
    );
    const includesAllTagFavorites = scraperIncludedTagFavoriteIds.includes(LATEST_ALL_TAG_FAVORITES_VALUE);
    const sessionOverrideSummary = hasScraperSessionSettingsOverride
      ? [
        `Override de session actif : ${scraperResultLimit} resultat(s) par scrapper`,
        `${tagResultLimit} par tag favori`,
        `${scraperLatestConcurrency} source(s) en parallele`,
        `scan profond ${scraperDeepPageLimit} page(s)`,
        `rapide ${scraperQuickConsecutiveSeenStopThreshold} vue(s)`,
        `refus langue ${scraperLanguageRejectLimit}. `,
      ].join(", ")
      : "";
    const baseSummary = `${sessionOverrideSummary}Charge jusqu'a ${scraperResultLimit} resultat(s) non vu(s) par scrapper et ${tagResultLimit} par tag favori.`;
    const concurrencySummary = ` Jusqu'a ${scraperLatestConcurrency} source(s) chargee(s) en parallele.`;
    const scraperFilterSummary = !enabledLatestScrapers.length
      ? " Aucun scrapper actif dans les nouveautes."
      : scraperIncludesNoScrapers
        ? " Scrappers inclus : aucun."
      : !scraperIncludedScraperIds.length
        ? " Scrappers inclus : tous."
        : ` Scrappers inclus : ${includedScraperLabel}.`;
    const tagFavoriteFilterSummary = !scraperIncludedTagFavoriteIds.length
      ? " Tags favoris inclus : aucun."
      : !tagFavoritesLoaded
        ? " Tags favoris : chargement."
        : !tagFavorites.length
          ? " Aucun tag favori disponible."
          : includesAllTagFavorites
            ? " Tags favoris inclus : tous."
            : ` Tags favoris inclus : ${includedTagFavoriteLabel}.`;
    const deepPageLimitSummary = scraperDeepPageLimit > 0
      ? ` Scan profond limite a ${scraperDeepPageLimit} page(s).`
      : " Scan profond sans limite de pages.";
    const quickSeenStopSummary = ` Scan rapide : ${scraperQuickConsecutiveSeenStopThreshold} card(s) vue(s) d'affilee toleree(s) avant arret.`;
    const languageRejectSummary = scraperLanguageRejectLimit > 0
      ? ` Arret d'une source apres ${scraperLanguageRejectLimit} resultat(s) refuses par langue.`
      : " Arret par refus de langue desactive.";
    if (!scraperIncludedLanguageCodes.length) {
      return `${baseSummary}${concurrencySummary}${scraperFilterSummary}${tagFavoriteFilterSummary}${deepPageLimitSummary}${quickSeenStopSummary}${languageRejectSummary}`;
    }

    return `${baseSummary}${concurrencySummary}${scraperFilterSummary}${tagFavoriteFilterSummary} Langues incluses : ${includedLanguageLabel}.${deepPageLimitSummary}${quickSeenStopSummary}${languageRejectSummary}`;
  }, [
    enabledLatestScrapers,
    scraperIncludesNoScrapers,
    scraperDeepPageLimit,
    hasScraperSessionSettingsOverride,
    scraperIncludedLanguageCodes,
    scraperIncludedScraperIds,
    scraperIncludedTagFavoriteIds,
    scraperLanguageRejectLimit,
    scraperLatestConcurrency,
    scraperQuickConsecutiveSeenStopThreshold,
    scraperResultLimit,
    tagResultLimit,
    tagFavorites,
    tagFavoritesLoaded,
  ]);

  const refreshViewHistorySnapshot = React.useCallback(async () => {
    try {
      const records = await loadScraperViewHistory(true);
      viewHistoryRecordsByIdRef.current = new Map(records.map((record) => [record.id, record]));
    } catch (viewHistoryError) {
      console.warn("Failed to refresh scraper view history before latest scan", viewHistoryError);
    }
  }, []);

  const handleOpenScraperSessionSettings = React.useCallback(() => {
    openModal(buildScraperLatestSessionSettingsModal({
      defaults: {
        scraperResultLimit: defaultScraperResultLimit,
        tagResultLimit: defaultTagResultLimit,
        concurrency: defaultScraperLatestConcurrency,
        deepPageLimit: defaultScraperDeepPageLimit,
        quickConsecutiveSeenStopThreshold: defaultScraperQuickConsecutiveSeenStopThreshold,
        languageRejectLimit: defaultScraperLanguageRejectLimit,
      },
      initialValues: {
        scraperResultLimit,
        tagResultLimit,
        concurrency: scraperLatestConcurrency,
        deepPageLimit: scraperDeepPageLimit,
        quickConsecutiveSeenStopThreshold: scraperQuickConsecutiveSeenStopThreshold,
        languageRejectLimit: scraperLanguageRejectLimit,
      },
      hasOverride: hasScraperSessionSettingsOverride,
      onApply: setScraperSessionSettings,
      onClear: () => setScraperSessionSettings(null),
    }));
  }, [
    defaultScraperDeepPageLimit,
    defaultScraperLanguageRejectLimit,
    defaultScraperLatestConcurrency,
    defaultScraperQuickConsecutiveSeenStopThreshold,
    defaultScraperResultLimit,
    defaultTagResultLimit,
    hasScraperSessionSettingsOverride,
    scraperDeepPageLimit,
    scraperLanguageRejectLimit,
    scraperLatestConcurrency,
    scraperQuickConsecutiveSeenStopThreshold,
    openModal,
    scraperResultLimit,
    tagResultLimit,
  ]);

  const handleReload = React.useCallback(async () => {
    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);

    if (activeTab === "authors") {
      if (authorActionsDisabled) {
        return;
      }

      setAuthorRefreshKey((currentKey) => currentKey + 1);
      return;
    }

    if (scraperActionsDisabled) {
      return;
    }

    await refreshViewHistorySnapshot();
    setScraperSearchMode("quick");
    setScraperRefreshKey((currentKey) => currentKey + 1);
  }, [activeTab, authorActionsDisabled, refreshViewHistorySnapshot, scraperActionsDisabled, sourceResults]);

  const handleSearchDeeper = React.useCallback(async () => {
    if (activeTab !== "scrapers" || scraperActionsDisabled) {
      return;
    }

    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);
    await refreshViewHistorySnapshot();
    setScraperSearchMode("deep");
    setScraperRefreshKey((currentKey) => currentKey + 1);
  }, [activeTab, refreshViewHistorySnapshot, scraperActionsDisabled, sourceResults]);

  const handleContinueScan = React.useCallback(async (repeatCount: number) => {
    if (activeTab !== "scrapers" || scraperActionsDisabled) {
      return;
    }

    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);
    await refreshViewHistorySnapshot();
    const normalizedRepeatCount = Math.max(1, Math.floor(repeatCount || 1));

    for (let index = 0; index < normalizedRepeatCount; index += 1) {
      await startScraperScan({
        searchMode: scraperSearchMode,
        continueFromQuickScan: scraperSearchMode === "quick",
        preserveCurrentResults: true,
      });
    }
  }, [
    activeTab,
    refreshViewHistorySnapshot,
    scraperActionsDisabled,
    scraperSearchMode,
    sourceResults,
    startScraperScan,
  ]);

  const handleReplaceContinueScan = React.useCallback(async () => {
    if (activeTab !== "scrapers" || scraperActionsDisabled) {
      return;
    }

    rootRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    sourceResults.setLanguageFilterModes({});
    sourceResults.setOpenError(null);
    await refreshViewHistorySnapshot();
    await startScraperScan({
      searchMode: scraperSearchMode,
      continueFromQuickScan: scraperSearchMode === "quick",
      preserveCurrentResults: false,
    });
  }, [
    activeTab,
    refreshViewHistorySnapshot,
    scraperActionsDisabled,
    scraperSearchMode,
    sourceResults,
    startScraperScan,
  ]);

  const hasIncludedTagFavoriteSelection = scraperIncludedTagFavoriteIds.length > 0;
  const loading = activeTab === "authors"
    ? authorFavoritesLoading || authorRuns.loading
    : scraperRuns.loading || (hasIncludedTagFavoriteSelection && tagFavoritesLoading && scraperRefreshKey > 0);
  const message = activeTab === "authors"
    ? authorRuns.message
    : scraperRuns.message;
  const error = activeTab === "authors"
    ? authorSelectionError || authorFavoritesError || authorRuns.error
    : scraperSelectionError || (hasIncludedTagFavoriteSelection ? tagFavoritesError : null) || scraperRuns.error;
  const activeTabHasStarted = activeTab === "authors"
    ? authorRefreshKey > 0
    : scraperRefreshKey > 0;
  const canContinueScraperScan = activeTab === "scrapers"
    && scraperRuns.runs.some((run) => run.canContinue === true);

  return (
    <section ref={rootRef} className="scraper-latest">
      <div className="scraper-latest__header">
        <div>
          <h2>Nouveautes</h2>
          <p>Cartes non vues trouvees dans les sources incluses.</p>
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

      {activeTab === "authors" ? (
        <div className="scraper-latest__filters">
          <ScraperLatestAuthorFavoriteIncludeBar
            favorites={authorFavorites}
            value={authorIncludedFavoriteIds}
            onChange={handleAuthorIncludedFavoriteIdsChange}
          />
          <ScraperLatestLanguageIncludeBar
            value={authorIncludedLanguageCodes}
            onChange={handleAuthorIncludedLanguageCodesChange}
          />
        </div>
      ) : null}

      {activeTab === "scrapers" ? (
        <div className="scraper-latest__filters">
          <ScraperLatestScraperIncludeBar
            scrapers={enabledLatestScrapers}
            value={scraperIncludedScraperIds}
            onChange={handleScraperIncludedScraperIdsChange}
          />
          <ScraperLatestTagFavoriteIncludeBar
            favorites={tagFavorites}
            value={scraperIncludedTagFavoriteIds}
            onChange={handleScraperIncludedTagFavoriteIdsChange}
          />
          <ScraperLatestLanguageIncludeBar
            value={scraperIncludedLanguageCodes}
            onChange={handleScraperIncludedLanguageCodesChange}
          />
        </div>
      ) : null}

      <ScraperLatestResults
        title={activeTab === "authors" ? "Auteurs favoris" : "Sources"}
        summary={activeTab === "authors"
          ? authorSummary
          : scraperSummary}
        emptyLabel={activeTab === "authors"
          ? activeTabHasStarted
            ? "Aucune nouveaute trouvee dans les auteurs favoris charges."
            : "Lance le chargement pour chercher les nouveautes des auteurs favoris."
          : activeTabHasStarted
            ? "Aucune nouveaute trouvee sur les sources incluses."
            : "Lance un scan rapide ou profond pour chercher les nouveautes des sources incluses."}
        sources={activeSources}
        loading={loading}
        message={message}
        error={error}
        openError={sourceResults.openError}
        statusItems={statusItems}
        actionLabel={activeTab === "scrapers" ? "Scan rapide" : activeTabHasStarted ? "Recharger" : "Charger"}
        secondaryActionLabel={activeTab === "scrapers" ? "Scan profond" : undefined}
        continueActionLabel={activeTab === "scrapers" ? "Continuer" : undefined}
        continueActionDisabled={activeTab === "scrapers" ? !canContinueScraperScan : false}
        continueActionTitle={activeTab === "scrapers" && !canContinueScraperScan
          ? "Aucune source n'a atteint son quota avec une suite disponible."
          : undefined}
        continueCount={scraperContinueCount}
        replaceContinueActionLabel={activeTab === "scrapers" ? "Continuer" : undefined}
        replaceContinueActionDisabled={activeTab === "scrapers" ? !canContinueScraperScan : false}
        replaceContinueActionTitle={activeTab === "scrapers" && !canContinueScraperScan
          ? "Aucune source n'a atteint son quota avec une suite disponible."
          : undefined}
        settingsActionLabel={activeTab === "scrapers" ? "Parametres session" : undefined}
        settingsActionActive={activeTab === "scrapers" && hasScraperSessionSettingsOverride}
        actionsDisabled={activeTab === "authors"
          ? authorActionsDisabled
          : activeTab === "scrapers"
            ? scraperActionsDisabled
            : false}
        libraryMangas={sourceResults.libraryMangas}
        bookmarkedSourceKeys={sourceResults.bookmarkedSourceKeys}
        sourceProgressIndex={sourceResults.sourceProgressIndex}
        viewHistoryRecordsById={sourceResults.viewHistoryRecordsById}
        newViewHistoryIds={sourceResults.newSourceHistoryIds}
        tagBlacklistByScraper={params?.scraperBlacklistedTagsByScraper}
        tagFavorites={tagFavorites}
        languageFilterModes={sourceResults.languageFilterModes}
        enableRomajiPhoneticMerge={params?.multiSearchEnableRomajiPhoneticMerge === true}
        onReload={handleReload}
        onSecondaryAction={activeTab === "scrapers" ? handleSearchDeeper : undefined}
        onContinue={activeTab === "scrapers" ? handleContinueScan : undefined}
        onContinueCountChange={setScraperContinueCount}
        onReplaceContinue={activeTab === "scrapers" ? handleReplaceContinueScan : undefined}
        onOpenSettings={activeTab === "scrapers" ? handleOpenScraperSessionSettings : undefined}
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
