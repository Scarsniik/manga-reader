import React, { useMemo, useState } from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import { useModal } from "@/renderer/hooks/useModal";
import { useParams } from "@/renderer/hooks/useParams";
import type { ScraperBookmarkFilterState } from "@/shared/scraper";
import {
  DEFAULT_BOOKMARK_FILTERS,
} from "@/renderer/components/ScraperBookmarks/bookmarkFiltering";
import { useScraperTagFavorites } from "@/renderer/stores/scraperTagFavorites";
import useScraperBookmarkView from "@/renderer/components/ScraperBookmarks/useScraperBookmarkView";
import {
  buildBookmarkTagStats,
  DEFAULT_BOOKMARK_TAG_STATS_FUZZY_LEVEL,
  DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES,
  type BookmarkTagStatsFuzzyLevel,
} from "@/renderer/components/ScraperBookmarks/bookmarkTagStats";

type BookmarkTagStatsScope = "displayed" | "scope";

type Props = {
  filterScraperId?: string | null;
  filters?: Partial<ScraperBookmarkFilterState> | null;
  onOpenTag: (tag: string) => void;
  onOpenTagInWorkspace: (tag: string) => void;
};

type ModalContentProps = Props;

const MIDDLE_BUTTON = 1;

const FUZZY_LEVEL_OPTIONS: Array<{
  value: BookmarkTagStatsFuzzyLevel;
  label: string;
}> = [
  { value: "strict", label: "Strict" },
  { value: "balanced", label: "Equilibre" },
  { value: "loose", label: "Large" },
];

const SCOPE_OPTIONS: Array<{
  value: BookmarkTagStatsScope;
  label: string;
}> = [
  { value: "displayed", label: "Bookmarks affiches" },
  { value: "scope", label: "Tous les bookmarks du perimetre" },
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
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES;
  }

  return Math.max(1, Math.floor(parsed));
};

const getOccurrenceLabel = (count: number): string => (
  `${count} occurrence${count > 1 ? "s" : ""}`
);

const formatVariantPreview = (
  variants: Array<{ tag: string; count: number }>,
): string => {
  const visibleVariants = variants.slice(0, 6).map((variant) => (
    `${variant.tag} (${variant.count})`
  ));
  const hiddenCount = Math.max(0, variants.length - visibleVariants.length);

  return hiddenCount > 0
    ? `${visibleVariants.join(", ")} +${hiddenCount}`
    : visibleVariants.join(", ");
};

export function ScraperBookmarkTagStatsPanel({
  filterScraperId = null,
  filters = DEFAULT_BOOKMARK_FILTERS,
  onOpenTag,
  onOpenTagInWorkspace,
}: Props) {
  const { params } = useParams();
  const { favorites: tagFavorites } = useScraperTagFavorites();
  const [minOccurrencesInput, setMinOccurrencesInput] = useState(
    String(DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES),
  );
  const [scope, setScope] = useState<BookmarkTagStatsScope>("displayed");
  const [fuzzyEnabled, setFuzzyEnabled] = useState(false);
  const [fuzzyLevel, setFuzzyLevel] = useState<BookmarkTagStatsFuzzyLevel>(
    DEFAULT_BOOKMARK_TAG_STATS_FUZZY_LEVEL,
  );
  const normalizedFilters = useMemo(() => normalizeFilters(filters), [filters]);
  const displayedRequest = useMemo(() => ({
    scraperId: filterScraperId ?? null,
    filters: normalizedFilters,
    hideBlacklistedCards: params?.scraperHideBlacklistedTagCards === true,
    blacklistedTagsByScraper: params?.scraperBlacklistedTagsByScraper ?? null,
  }), [
    filterScraperId,
    normalizedFilters,
    params?.scraperBlacklistedTagsByScraper,
    params?.scraperHideBlacklistedTagCards,
  ]);
  const scopeRequest = useMemo(() => ({
    scraperId: filterScraperId ?? null,
    filters: DEFAULT_BOOKMARK_FILTERS,
    hideBlacklistedCards: false,
    blacklistedTagsByScraper: null,
  }), [filterScraperId]);
  const displayedView = useScraperBookmarkView(displayedRequest);
  const scopeView = useScraperBookmarkView(scopeRequest);
  const activeView = scope === "displayed" ? displayedView : scopeView;
  const activeBookmarks = useMemo(() => (
    activeView.response.bookmarks.map((record) => record.bookmark)
  ), [activeView.response.bookmarks]);
  const minOccurrences = parseMinOccurrences(minOccurrencesInput);
  const fuzzyMode = fuzzyEnabled ? fuzzyLevel : "off";
  const stats = useMemo(() => (
    buildBookmarkTagStats(activeBookmarks, {
      fuzzyMode,
      minOccurrences,
      tagFavorites,
    })
  ), [activeBookmarks, fuzzyMode, minOccurrences, tagFavorites]);
  const sourceLabel = scope === "displayed"
    ? "selection affichee"
    : filterScraperId
      ? "scrapper courant"
      : "tous les scrappers";

  const openTagInWorkspace = (tag: string) => {
    onOpenTagInWorkspace(tag);
  };

  return (
    <div className="scraper-bookmark-tags-modal">
      <form
        className="scraper-bookmark-tags-modal__form"
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
          <span>Perimetre</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as BookmarkTagStatsScope)}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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
      </form>

      <div className="scraper-bookmark-tags-modal__summary">
        <strong>{`${stats.length} tag(s)`}</strong>
        <span>{`${activeBookmarks.length} bookmark(s), ${sourceLabel}`}</span>
      </div>

      {activeView.loading && !activeView.loaded ? (
        <div className="scraper-browser__message">Chargement des tags...</div>
      ) : activeView.error ? (
        <div className="scraper-browser__message is-error">{activeView.error}</div>
      ) : activeBookmarks.length === 0 ? (
        <div className="scraper-browser__message is-warning">
          Aucun bookmark disponible dans ce perimetre.
        </div>
      ) : stats.length === 0 ? (
        <div className="scraper-browser__message is-warning">
          Aucun tag ne correspond aux reglages actuels.
        </div>
      ) : (
        <div className="scraper-bookmark-tags-modal__list">
          {stats.map((stat) => {
            const hasMergedVariants = stat.variants.length > 1;

            return (
              <button
                key={`${stat.tag}-${stat.count}-${stat.variants.length}`}
                type="button"
                className="scraper-bookmark-tags-modal__row"
                onClick={() => onOpenTag(stat.tag)}
                onMouseDown={(event) => {
                  if (event.button === MIDDLE_BUTTON) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                onAuxClick={(event) => {
                  if (event.button !== MIDDLE_BUTTON) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  openTagInWorkspace(stat.tag);
                }}
                title="Filtrer les bookmarks sur ce tag. Clic molette : nouvel onglet workspace"
                data-prevent-middle-click-autoscroll="true"
              >
                <span className="scraper-bookmark-tags-modal__row-main">
                  <strong>{stat.tag}</strong>
                  <span>{getOccurrenceLabel(stat.count)}</span>
                  {stat.scraperIds.length > 1 ? (
                    <span>{`${stat.scraperIds.length} scrappers`}</span>
                  ) : null}
                  {stat.favoriteName ? (
                    <span>{`Favori ${stat.favoriteName}`}</span>
                  ) : null}
                </span>
                {hasMergedVariants ? (
                  <span className="scraper-bookmark-tags-modal__variants">
                    {formatVariantPreview(stat.variants)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScraperBookmarkTagStatsModalContent({
  onOpenTag,
  ...props
}: ModalContentProps) {
  const { closeModal } = useModal();

  return (
    <ScraperBookmarkTagStatsPanel
      {...props}
      onOpenTag={(tag) => {
        closeModal();
        onOpenTag(tag);
      }}
    />
  );
}

export default function buildScraperBookmarkTagStatsModal(
  props: ModalContentProps,
): ModalOptions {
  return {
    title: "Tags les plus presents",
    content: <ScraperBookmarkTagStatsModalContent {...props} />,
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
