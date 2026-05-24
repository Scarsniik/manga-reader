import React from "react";
import {
  buildScraperViewHistoryCardId,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
} from "@/shared/scraper";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import ScraperViewHistoryCard from "@/renderer/components/ScraperViewHistoryCard/ScraperViewHistoryCard";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { BookmarkRibbonIcon, EyeIcon } from "@/renderer/components/icons";
import type { Manga } from "@/renderer/types";
import { getLanguageLabel } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import {
  getMultiSearchSourceAvailability,
  pickPrimarySourceProgress,
  type MultiSearchProgressIndex,
  type MultiSearchReadingStatus,
  type MultiSearchSourceAvailability,
} from "@/renderer/components/MultiSearch/multiSearchSourceState";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";
import { formatScraperPageCountForDisplay } from "@/renderer/utils/scraperRuntime";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
import "./card.scss";

type Props = {
  result: MultiSearchMergedResult;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  viewHistoryRecordingDisabled?: boolean;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onOpenProgressReader: (
    source: MultiSearchSourceResult,
    page: number,
    totalPages: number | null,
    readerMangaId?: string,
    openInWorkspace?: boolean,
  ) => void;
  onSetSourcesRead: (identities: ScraperViewHistoryCardIdentity[], read: boolean) => void;
};

const formatValues = (values: string[], fallback: string): string => (
  values.length ? values.join(", ") : fallback
);

const getSourceLanguageTitle = (source: MultiSearchSourceResult): string => (
  source.sourceLanguageCodes.length
    ? source.sourceLanguageCodes.map(getLanguageLabel).join(", ")
    : "Non renseignee"
);

const formatMatchedSourceCount = (count: number): string => (
  count > 1 ? ` x${count}` : ""
);

type ReadableSourceEntry = {
  identity: ScraperViewHistoryCardIdentity;
  availability: MultiSearchSourceAvailability | undefined;
};

const getProgressClassName = (status: MultiSearchReadingStatus): string => (
  status === "completed" ? "is-completed" : "is-in-progress"
);

const getOpenOptionClassName = (
  availability: MultiSearchSourceAvailability | undefined,
): string => [
  "multi-search-card__open-option",
  availability?.inLibrary || availability?.inBookmarks || availability?.progress ? "has-states" : "",
  availability?.inLibrary ? "is-library" : "",
  availability?.inBookmarks ? "is-bookmark" : "",
  availability?.progress ? getProgressClassName(availability.progress.status) : "",
].join(" ").trim();

const closeDetails = (details: HTMLDetailsElement | null) => {
  if (details) {
    details.open = false;
  }
};

type CoverCandidate = {
  url?: string | null;
  refererUrl?: string | null;
};

const uniqueCoverUrls = (values: CoverCandidate[]): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((items, value) => {
    const normalized = value.url?.trim();
    if (!normalized || seen.has(normalized)) {
      return items;
    }

    seen.add(normalized);
    const thumbnailUrl = buildRemoteThumbnailUrl(normalized, value.refererUrl);
    if (thumbnailUrl && !seen.has(thumbnailUrl)) {
      seen.add(thumbnailUrl);
      items.push(thumbnailUrl);
    }

    items.push(normalized);
    return items;
  }, []);
};

export default function MultiSearchResultCard({
  result,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  viewHistoryRecordingDisabled = false,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  const sourceMenuRef = React.useRef<HTMLDetailsElement>(null);
  const openMenuRef = React.useRef<HTMLDetailsElement>(null);
  const coverUrls = React.useMemo(() => uniqueCoverUrls([
    {
      url: result.coverUrl,
      refererUrl: result.sources[0]?.result.detailUrl || result.sources[0]?.scraper.baseUrl,
    },
    ...result.sources.map((source) => ({
      url: source.result.thumbnailUrl,
      refererUrl: source.result.detailUrl || source.scraper.baseUrl,
    })),
  ]), [result.coverUrl, result.sources]);
  const coverUrlsKey = coverUrls.join("\n");
  const [coverIndex, setCoverIndex] = React.useState(0);
  const activeCoverUrl = coverIndex < coverUrls.length ? coverUrls[coverIndex] : undefined;
  const languageLabels = result.sourceLanguageCodes.map(getLanguageLabel);
  const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);
  const viewHistoryIdentities = React.useMemo(
    () => result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
    [result.sources],
  );
  const sourceAvailability = React.useMemo(() => (
    result.sources.map((source) => getMultiSearchSourceAvailability({
      source,
      libraryMangas,
      bookmarkedSourceKeys,
      progressIndex: sourceProgressIndex,
      viewHistoryRecordsById,
    }))
  ), [bookmarkedSourceKeys, libraryMangas, result.sources, sourceProgressIndex, viewHistoryRecordsById]);
  const readableSourceEntries = React.useMemo(() => {
    const seenIds = new Set<string>();

    return result.sources.reduce<ReadableSourceEntry[]>((entries, source, index) => {
      const identity = buildSearchResultViewHistoryIdentity(source.scraper.id, source.result);
      const id = buildScraperViewHistoryCardId(identity);
      if (!id || seenIds.has(id)) {
        return entries;
      }

      seenIds.add(id);
      entries.push({
        identity,
        availability: sourceAvailability[index],
      });
      return entries;
    }, []);
  }, [result.sources, sourceAvailability]);
  const explicitReadEntries = readableSourceEntries.filter((entry) => Boolean(entry.availability?.readAt));
  const inProgressEntries = readableSourceEntries.filter((entry) => (
    !entry.availability?.readAt && entry.availability?.progress?.status === "inProgress"
  ));
  const completedProgressEntries = readableSourceEntries.filter((entry) => (
    entry.availability?.progress?.status === "completed"
  ));
  const hasExplicitRead = explicitReadEntries.length > 0;
  const readTargetIdentities = (
    inProgressEntries.length
      ? inProgressEntries
      : completedProgressEntries.length
        ? completedProgressEntries
        : readableSourceEntries.slice(0, 1)
  ).map((entry) => entry.identity);
  const unreadTargetIdentities = explicitReadEntries.map((entry) => entry.identity);
  const readToggleTargetIdentities = hasExplicitRead ? unreadTargetIdentities : readTargetIdentities;
  const canToggleRead = readToggleTargetIdentities.length > 0;
  const readToggleLabel = hasExplicitRead ? "Marquer comme non lu" : "Marquer comme lu";
  const librarySourceCount = sourceAvailability.filter((availability) => availability.inLibrary).length;
  const bookmarkSourceCount = sourceAvailability.filter((availability) => availability.inBookmarks).length;
  const progressSourceCount = sourceAvailability.filter((availability) => availability.progress).length;
  const primaryProgress = pickPrimarySourceProgress(sourceAvailability);
  const primaryProgressSourceIndex = primaryProgress
    ? sourceAvailability.findIndex((availability) => availability.progress === primaryProgress)
    : -1;
  const primaryProgressSource = primaryProgressSourceIndex >= 0
    ? result.sources[primaryProgressSourceIndex]
    : null;
  const canOpenPrimaryProgressReader = Boolean(
    primaryProgress?.status === "inProgress"
    && primaryProgressSource?.result.detailUrl
    && primaryProgressSource.canOpenDetails,
  );
  const progressTitle = sourceAvailability
    .map((availability, index) => (availability.progress
      ? `${result.sources[index].scraper.name}: ${availability.progress.label}`
      : ""
    ))
    .filter(Boolean)
    .join("\n");
  const scraperSourceCounts = Array.from(
    result.sources.reduce<Map<string, { id: string; name: string; count: number }>>((counts, source) => {
      const current = counts.get(source.scraper.id);
      counts.set(source.scraper.id, {
        id: source.scraper.id,
        name: source.scraper.name,
        count: (current?.count ?? 0) + 1,
      });
      return counts;
    }, new Map()).values(),
  );
  const progressContent = primaryProgress ? (
    <>
      <span className="multi-search-card__progress-line">
        <span>{primaryProgress.status === "completed" ? "Termine" : "En cours"}</span>
        <strong>{primaryProgress.shortLabel}{formatMatchedSourceCount(progressSourceCount)}</strong>
      </span>
      {primaryProgress.percent !== null ? (
        <span className="multi-search-card__progress-track" aria-hidden="true">
          <span style={{ width: `${primaryProgress.percent}%` }} />
        </span>
      ) : null}
    </>
  ) : null;
  const metadata = (
    <div className="multi-search-card__metadata">
      <span title={formatValues(languageLabels, "Non renseignee")}>
        Langues : <LanguageFlags languageCodes={result.sourceLanguageCodes} />
      </span>
      <span>Types : {formatValues(result.contentTypes, "Non renseigne")}</span>
      {pageCountLabel ? <span>{pageCountLabel}</span> : null}
      {librarySourceCount ? (
        <span className="multi-search-card__state-badge is-library">
          Bibliotheque{formatMatchedSourceCount(librarySourceCount)}
        </span>
      ) : null}
      {bookmarkSourceCount ? (
        <span className="multi-search-card__state-badge is-bookmark">
          Bookmark{formatMatchedSourceCount(bookmarkSourceCount)}
        </span>
      ) : null}
      {primaryProgress || canToggleRead ? (
        <div className="multi-search-card__progress-row">
          {primaryProgress && canOpenPrimaryProgressReader && primaryProgressSource ? (
            <button
              type="button"
              className={[
                "multi-search-card__progress",
                "is-clickable",
                getProgressClassName(primaryProgress.status),
              ].join(" ")}
              title={progressTitle || primaryProgress.label}
              aria-label={`Ouvrir ${result.title} a la page ${primaryProgress.currentPage}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenProgressReader(
                  primaryProgressSource,
                  primaryProgress.currentPage,
                  primaryProgress.totalPages,
                  primaryProgress.readerMangaId,
                );
              }}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onAuxClick={(event) => {
                if (event.button !== 1) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                onOpenProgressReader(
                  primaryProgressSource,
                  primaryProgress.currentPage,
                  primaryProgress.totalPages,
                  primaryProgress.readerMangaId,
                  true,
                );
              }}
              data-prevent-middle-click-autoscroll="true"
            >
              {progressContent}
            </button>
          ) : primaryProgress ? (
            <div
              className={[
                "multi-search-card__progress",
                getProgressClassName(primaryProgress.status),
              ].join(" ")}
              title={progressTitle || primaryProgress.label}
            >
              {progressContent}
            </div>
          ) : null}
          {canToggleRead ? (
            <button
              type="button"
              className={[
                "multi-search-card__read-toggle",
                hasExplicitRead ? "is-read" : "",
              ].join(" ").trim()}
              title={readToggleLabel}
              aria-label={`${readToggleLabel} ${result.title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSetSourcesRead(readToggleTargetIdentities, !hasExplicitRead);
              }}
            >
              <EyeIcon aria-hidden="true" focusable="false" />
            </button>
          ) : null}
        </div>
      ) : null}
      <span>{result.sources.length} source(s) trouvee(s)</span>
      {result.sources.length > 1 ? (
        <details ref={sourceMenuRef} className="multi-search-card__source-menu">
          <summary className="multi-search-card__source-trigger">
            Scrappers : {scraperSourceCounts.length}
          </summary>
          <div className="multi-search-card__source-popover">
            {result.sources.map((source, index) => {
              const availability = sourceAvailability[index];

              return (
                <div
                  key={`${source.scraper.id}-${source.result.detailUrl || source.result.title}-${index}`}
                  className="multi-search-card__source-row"
                >
                  <div>
                    <strong>{source.scraper.name}</strong>
                    <span title={getSourceLanguageTitle(source)}>
                      <LanguageFlags languageCodes={source.sourceLanguageCodes} />
                    </span>
                  </div>
                  <div className="multi-search-card__source-states">
                    {availability?.inLibrary ? <span className="is-library">Bibliotheque</span> : null}
                    {availability?.inBookmarks ? (
                      <span className="is-bookmark" title="Bookmark">
                        <BookmarkRibbonIcon aria-hidden="true" focusable="false" />
                      </span>
                    ) : null}
                    {availability?.progress ? (
                      <span className={getProgressClassName(availability.progress.status)}>
                        {availability.progress.shortLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : scraperSourceCounts[0] ? (
        <span className="multi-search-card__source-inline">{scraperSourceCounts[0].name}</span>
      ) : null}
    </div>
  );
  const actions: ScraperCardAction[] = [];

  React.useEffect(() => {
    setCoverIndex(0);
  }, [coverUrlsKey]);

  React.useEffect(() => {
    const closeMenusOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      [sourceMenuRef.current, openMenuRef.current].forEach((details) => {
        if (details?.open && !details.contains(target)) {
          closeDetails(details);
        }
      });
    };

    document.addEventListener("pointerdown", closeMenusOnOutsideClick, true);
    return () => document.removeEventListener("pointerdown", closeMenusOnOutsideClick, true);
  }, []);

  if (result.sources.length === 1) {
    const source = result.sources[0];
    actions.push({
      id: "open-source",
      type: "primary",
      label: source.canOpenDetails ? `Ouvrir sur ${source.scraper.name}` : "Ouvrir le lien",
      onClick: () => onOpenSource(source),
      onMiddleClick: () => onOpenSourceInWorkspace(source),
      disabled: !source.result.detailUrl,
    });
  } else {
    actions.push({
      id: "open-source-menu",
      type: "custom",
      label: "Ouvrir avec",
      render: () => (
        <details ref={openMenuRef} className="multi-search-card__open-menu">
          <summary className="multi-search-card__open-trigger">
            Ouvrir avec...
          </summary>
          <div className="multi-search-card__open-options">
            {result.sources.map((source, index) => {
              const availability = sourceAvailability[index];
              const hasOpenTags = Boolean(availability?.progress || availability?.inBookmarks);

              return (
                <button
                  key={`${source.scraper.id}-${source.result.detailUrl || source.result.title}-${index}`}
                  type="button"
                  className={getOpenOptionClassName(availability)}
                  onClick={() => {
                    closeDetails(openMenuRef.current);
                    onOpenSource(source);
                  }}
                  onMouseDown={(event) => {
                    if (event.button !== 1) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onAuxClick={(event) => {
                    if (event.button !== 1) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    closeDetails(openMenuRef.current);
                    onOpenSourceInWorkspace(source);
                  }}
                  disabled={!source.result.detailUrl}
                  data-prevent-middle-click-autoscroll="true"
                >
                  <span className="multi-search-card__open-source-line">
                    <span className="multi-search-card__open-source-language" title={getSourceLanguageTitle(source)}>
                      <LanguageFlags languageCodes={source.sourceLanguageCodes} />
                    </span>
                    <strong className="multi-search-card__open-source-name">{source.scraper.name}</strong>
                    {hasOpenTags ? (
                      <span className="multi-search-card__open-source-tags">
                        {availability?.progress ? (
                          <span className={getProgressClassName(availability.progress.status)}>
                            {availability.progress.shortLabel}
                          </span>
                        ) : null}
                        {availability?.inBookmarks ? (
                          <span className="is-bookmark" title="Bookmark">
                            <BookmarkRibbonIcon aria-hidden="true" focusable="false" />
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </details>
      ),
    });
  }

  return (
    <ScraperViewHistoryCard
      identities={viewHistoryIdentities}
      recordsById={viewHistoryRecordsById}
      newCardIds={newViewHistoryIds}
      recordingDisabled={viewHistoryRecordingDisabled}
    >
      {({ historyClassName, onViewed }) => (
        <ScraperCard
          title={result.title}
          coverUrl={activeCoverUrl}
          coverAlt={result.title}
          summary={result.summary}
          metadata={metadata}
          actions={actions}
          className={[
            result.sources.length > 1 ? "is-merged" : "",
            historyClassName,
          ].join(" ").trim()}
          isActionable={result.sources.length === 1 && Boolean(result.sources[0].result.detailUrl)}
          onClick={result.sources.length === 1 ? () => onOpenSource(result.sources[0]) : undefined}
          onMiddleClick={result.sources.length === 1 ? () => onOpenSourceInWorkspace(result.sources[0]) : undefined}
          onCoverError={() => setCoverIndex((currentIndex) => currentIndex + 1)}
          onViewed={onViewed}
          ariaLabel={result.sources.length === 1 ? `Ouvrir ${result.title}` : undefined}
        />
      )}
    </ScraperViewHistoryCard>
  );
}
