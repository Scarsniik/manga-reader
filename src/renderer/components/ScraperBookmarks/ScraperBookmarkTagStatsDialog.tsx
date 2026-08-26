import React, { useEffect, useMemo, useState } from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import { useModal } from "@/renderer/hooks/useModal";
import { useParams } from "@/renderer/hooks/useParams";
import type { BackgroundSearchJob } from "@/shared/backgroundSearch";
import type { ScraperBookmarkFilterState } from "@/shared/scraper";
import { DEFAULT_BOOKMARK_FILTERS } from "@/renderer/components/ScraperBookmarks/bookmarkFiltering";
import { useScraperTagFavorites } from "@/renderer/stores/scraperTagFavorites";
import { useScraperAuthorFavorites } from "@/renderer/stores/scraperAuthorFavorites";
import useScraperBookmarkView from "@/renderer/components/ScraperBookmarks/useScraperBookmarkView";
import useScraperTitleAnalysisConfigs from "@/renderer/hooks/useScraperTitleAnalysisConfigs";
import {
  DEFAULT_BOOKMARK_TAG_STATS_FUZZY_LEVEL,
  DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES,
  type BookmarkTagStat,
  type BookmarkTagStatsFuzzyLevel,
} from "@/renderer/components/ScraperBookmarks/bookmarkTagStats";
import type { BookmarkAuthorStat } from "@/renderer/components/ScraperBookmarks/bookmarkAuthorStats";
import { createBookmarkAuthorCombinedJob } from "@/renderer/components/ScraperBookmarks/bookmarkAuthorCombinedView";
import { requestBookmarkFrequentStats } from "@/renderer/components/ScraperBookmarks/bookmarkFrequentStatsClient";
import {
  ScraperBookmarkFrequentAuthorRows,
  ScraperBookmarkFrequentTagRows,
} from "@/renderer/components/ScraperBookmarks/ScraperBookmarkFrequentStatsRows";
import type {
  BookmarkFrequentStatsKind,
} from "@/renderer/components/ScraperBookmarks/bookmarkFrequentStats.worker";

type BookmarkStatsScope = "displayed" | "scope";

type Props = {
  filterScraperId?: string | null;
  filters?: Partial<ScraperBookmarkFilterState> | null;
  kind: BookmarkFrequentStatsKind;
  onFilterValue: (value: string) => void;
  onFilterValueInWorkspace: (value: string) => void;
  onOpenAuthorCombined: (job: BackgroundSearchJob) => void;
  onOpenAuthorCombinedInWorkspace: (job: BackgroundSearchJob) => void;
};

type ComputationState = {
  authorStats: BookmarkAuthorStat[];
  bookmarkCount: number;
  error: string | null;
  loading: boolean;
  tagStats: BookmarkTagStat[];
};

const INITIAL_COMPUTATION_STATE: ComputationState = {
  authorStats: [],
  bookmarkCount: 0,
  error: null,
  loading: false,
  tagStats: [],
};

const FUZZY_LEVEL_OPTIONS: Array<{
  value: BookmarkTagStatsFuzzyLevel;
  label: string;
}> = [
  { value: "strict", label: "Strict" },
  { value: "balanced", label: "Équilibré" },
  { value: "loose", label: "Large" },
];

const SCOPE_OPTIONS: Array<{
  value: BookmarkStatsScope;
  label: string;
}> = [
  { value: "displayed", label: "Bookmarks affichés" },
  { value: "scope", label: "Tous les bookmarks du périmètre" },
];

const normalizeFilters = (
  filters: Partial<ScraperBookmarkFilterState> | null | undefined,
): ScraperBookmarkFilterState => ({
  ...DEFAULT_BOOKMARK_FILTERS,
  ...filters,
  languageFilterModes: filters?.languageFilterModes ?? DEFAULT_BOOKMARK_FILTERS.languageFilterModes,
  readingStatuses: Array.isArray(filters?.readingStatuses)
    ? filters.readingStatuses
    : DEFAULT_BOOKMARK_FILTERS.readingStatuses,
  sortBy: filters?.sortBy ?? DEFAULT_BOOKMARK_FILTERS.sortBy,
});

const parseMinOccurrences = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.floor(parsed))
    : DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES;
};

export function ScraperBookmarkFrequentStatsPanel({
  filterScraperId = null,
  filters = DEFAULT_BOOKMARK_FILTERS,
  kind,
  onFilterValue,
  onFilterValueInWorkspace,
  onOpenAuthorCombined,
  onOpenAuthorCombinedInWorkspace,
}: Props) {
  const { params } = useParams();
  const { configsByScraperId, loading: titleAnalysisConfigsLoading } = useScraperTitleAnalysisConfigs();
  const { favorites: tagFavorites } = useScraperTagFavorites();
  const { favorites: authorFavorites } = useScraperAuthorFavorites();
  const [minOccurrencesInput, setMinOccurrencesInput] = useState(
    String(DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES),
  );
  const [scope, setScope] = useState<BookmarkStatsScope>("displayed");
  const [fuzzyEnabled, setFuzzyEnabled] = useState(false);
  const [fuzzyLevel, setFuzzyLevel] = useState<BookmarkTagStatsFuzzyLevel>(
    DEFAULT_BOOKMARK_TAG_STATS_FUZZY_LEVEL,
  );
  const [computation, setComputation] = useState(INITIAL_COMPUTATION_STATE);
  const [openingAuthor, setOpeningAuthor] = useState<string | null>(null);
  const [openAuthorError, setOpenAuthorError] = useState<string | null>(null);
  const normalizedFilters = useMemo(() => normalizeFilters(filters), [filters]);
  const viewRequest = useMemo(() => {
    if (scope === "scope") {
      return {
        scraperId: filterScraperId ?? null,
        filters: DEFAULT_BOOKMARK_FILTERS,
        hideBlacklistedCards: false,
        blacklistedTagsByScraper: null,
      };
    }

    const { seriesFilterMode: _seriesFilterMode, ...serverFilters } = normalizedFilters;
    return {
      scraperId: filterScraperId ?? null,
      filters: serverFilters,
      hideBlacklistedCards: params?.scraperHideBlacklistedTagCards === true,
      blacklistedTagsByScraper: params?.scraperBlacklistedTagsByScraper ?? null,
    };
  }, [
    filterScraperId,
    normalizedFilters,
    params?.scraperBlacklistedTagsByScraper,
    params?.scraperHideBlacklistedTagCards,
    scope,
  ]);
  const bookmarkView = useScraperBookmarkView(viewRequest);
  const cacheKey = useMemo(() => JSON.stringify({
    filterScraperId: filterScraperId ?? null,
    scope,
    viewRequest,
  }), [filterScraperId, scope, viewRequest]);
  const analysisRevision = useMemo(
    () => JSON.stringify(Array.from(configsByScraperId.entries())),
    [configsByScraperId],
  );
  const minOccurrences = parseMinOccurrences(minOccurrencesInput);
  const fuzzyMode = fuzzyEnabled ? fuzzyLevel : "off";
  const seriesFilterMode = scope === "displayed"
    ? normalizedFilters.seriesFilterMode
    : DEFAULT_BOOKMARK_FILTERS.seriesFilterMode;

  useEffect(() => {
    if (!bookmarkView.loaded || titleAnalysisConfigsLoading) {
      setComputation((current) => ({ ...current, loading: false }));
      return undefined;
    }

    let disposed = false;
    setComputation((current) => ({ ...current, error: null, loading: true }));
    const timerId = window.setTimeout(() => {
      void requestBookmarkFrequentStats({
        analysisRevision,
        authorFavorites,
        bookmarks: bookmarkView.response.bookmarks.map((record) => record.bookmark),
        cacheKey,
        configsByScraperId,
        fuzzyMode,
        kind,
        minOccurrences,
        seriesFilterMode,
        tagFavorites,
      }).then((response) => {
        if (disposed) return;
        setComputation({
          authorStats: response.authorStats,
          bookmarkCount: response.bookmarkCount,
          error: response.error ?? null,
          loading: false,
          tagStats: response.tagStats,
        });
      }).catch((error: unknown) => {
        if (disposed) return;
        setComputation({
          ...INITIAL_COMPUTATION_STATE,
          error: error instanceof Error
            ? error.message
            : "Le calcul des comptages a échoué.",
        });
      });
    }, 50);

    return () => {
      disposed = true;
      window.clearTimeout(timerId);
    };
  }, [
    analysisRevision,
    authorFavorites,
    bookmarkView.loaded,
    bookmarkView.response.bookmarks,
    cacheKey,
    configsByScraperId,
    fuzzyMode,
    kind,
    minOccurrences,
    seriesFilterMode,
    tagFavorites,
    titleAnalysisConfigsLoading,
  ]);

  const openCombinedAuthor = async (stat: BookmarkAuthorStat, inWorkspace: boolean) => {
    if (openingAuthor) {
      return;
    }

    setOpeningAuthor(stat.author);
    setOpenAuthorError(null);
    try {
      const job = await createBookmarkAuthorCombinedJob(stat, params);
      if (inWorkspace) {
        onOpenAuthorCombinedInWorkspace(job);
      } else {
        onOpenAuthorCombined(job);
      }
    } catch (error) {
      setOpenAuthorError(error instanceof Error
        ? error.message
        : "Impossible d'ouvrir la vue auteur combinée.");
    } finally {
      setOpeningAuthor(null);
    }
  };

  const statsCount = kind === "tags"
    ? computation.tagStats.length
    : computation.authorStats.length;
  const sourceLabel = scope === "displayed"
    ? "sélection affichée"
    : filterScraperId
      ? "scrapper courant"
      : "tous les scrappers";
  const loading = (bookmarkView.loading && !bookmarkView.loaded)
    || titleAnalysisConfigsLoading
    || computation.loading;

  return (
    <div className="scraper-bookmark-tags-modal">
      <form
        className={`scraper-bookmark-tags-modal__form ${kind === "authors" ? "is-compact" : ""}`}
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="scraper-bookmark-tags-modal__field">
          <span>Occurrences min</span>
          <input
            type="number"
            min="1"
            value={minOccurrencesInput}
            onChange={(event) => setMinOccurrencesInput(event.target.value)}
          />
        </label>

        <label className="scraper-bookmark-tags-modal__field">
          <span>Périmètre</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as BookmarkStatsScope)}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {kind === "tags" ? (
          <>
            <label className="scraper-bookmark-tags-modal__toggle">
              <input
                type="checkbox"
                checked={fuzzyEnabled}
                onChange={(event) => setFuzzyEnabled(event.target.checked)}
              />
              <span>Fusion fuzzy</span>
            </label>

            <label className="scraper-bookmark-tags-modal__field">
              <span>Niveau fuzzy</span>
              <select
                value={fuzzyLevel}
                disabled={!fuzzyEnabled}
                onChange={(event) => setFuzzyLevel(event.target.value as BookmarkTagStatsFuzzyLevel)}
              >
                {FUZZY_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </form>

      {kind === "authors" ? (
        <p className="scraper-bookmark-tags-modal__hint">
          Les noms sont regroupés avec les règles de correspondance auteur. Le parser de titre complète les auteurs manquants.
        </p>
      ) : null}

      <div className="scraper-bookmark-tags-modal__summary">
        <strong>{`${statsCount} ${kind === "tags" ? "tag(s)" : "auteur(s) groupé(s)"}`}</strong>
        <span>{`${computation.bookmarkCount} bookmark(s), ${sourceLabel}`}</span>
      </div>

      {loading ? (
        <div className="scraper-browser__message" aria-live="polite">
          {`Calcul des ${kind === "tags" ? "tags" : "auteurs"} en arrière-plan…`}
        </div>
      ) : bookmarkView.error || computation.error ? (
        <div className="scraper-browser__message is-error">
          {bookmarkView.error || computation.error}
        </div>
      ) : computation.bookmarkCount === 0 ? (
        <div className="scraper-browser__message is-warning">
          Aucun bookmark disponible dans ce périmètre.
        </div>
      ) : statsCount === 0 ? (
        <div className="scraper-browser__message is-warning">
          {`Aucun ${kind === "tags" ? "tag" : "auteur"} ne correspond aux réglages actuels.`}
        </div>
      ) : kind === "tags" ? (
        <ScraperBookmarkFrequentTagRows
          stats={computation.tagStats}
          onOpen={(stat) => onFilterValue(stat.tag)}
          onOpenInWorkspace={(stat) => onFilterValueInWorkspace(stat.tag)}
        />
      ) : (
        <ScraperBookmarkFrequentAuthorRows
          openingAuthor={openingAuthor}
          stats={computation.authorStats}
          onFilter={(stat) => onFilterValue(stat.filterValue)}
          onOpenCombined={(stat) => void openCombinedAuthor(stat, false)}
          onOpenCombinedInWorkspace={(stat) => void openCombinedAuthor(stat, true)}
        />
      )}

      {openAuthorError ? (
        <div className="scraper-browser__message is-error">{openAuthorError}</div>
      ) : null}
    </div>
  );
}

function ScraperBookmarkFrequentStatsModalContent({
  onFilterValue,
  onOpenAuthorCombined,
  ...props
}: Props) {
  const { closeModal } = useModal();

  return (
    <ScraperBookmarkFrequentStatsPanel
      {...props}
      onFilterValue={(value) => {
        closeModal();
        onFilterValue(value);
      }}
      onOpenAuthorCombined={(job) => {
        closeModal();
        onOpenAuthorCombined(job);
      }}
    />
  );
}

export default function buildScraperBookmarkFrequentStatsModal(props: Props): ModalOptions {
  return {
    title: props.kind === "tags" ? "Tags fréquents" : "Auteurs fréquents",
    content: <ScraperBookmarkFrequentStatsModalContent {...props} />,
    className: "scraper-bookmark-tags-modal-shell",
    bodyClassName: "scraper-bookmark-tags-modal-body",
    actions: [
      {
        label: "Fermer",
        variant: "secondary",
      },
    ],
  };
}
