import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
} from "@/renderer/backgroundSearch/types";
import type { MangaCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  buildMultiSearchSourceIdentityKey,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import { applyManualMultiSearchSplits } from "@/renderer/components/MultiSearch/multiSearchManualSplit";
import { selectPreferredMultiSearchTitleSource } from "@/renderer/components/MultiSearch/multiSearchTitleSelection";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import useParams from "@/renderer/hooks/useParams";
import useModal from "@/renderer/hooks/useModal";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  compareMangaCorrespondenceChapters,
  formatMangaCorrespondenceChapterLabel,
  inferMangaCorrespondenceFirstChapter,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import { getLanguageLabel } from "@/renderer/utils/languageDetection";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";
import MangaCorrespondenceReadingListDialog, {
  type MangaCorrespondenceReadingListChapter,
} from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceReadingListDialog";
import {
  filterIncludedMangaCorrespondenceChapters,
  toggleMangaCorrespondenceChapterExclusion,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceReadingListSelection";
import type { ReadingListItem } from "@/renderer/types/readingList";
import {
  isClearlyDerivativeMangaCorrespondenceTitle,
  stripMangaCorrespondenceTrailingKnownAuthor,
} from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import "@/renderer/components/MultiSearch/style.scss";
import "./view.scss";

type Props = { backgroundSearchJobId?: string; resultOnly?: boolean };
type DisplayMode = "mergedChapters" | "groupedChapters" | "classic";
type ChapterMatchGroup = {
  chapter: string;
  matches: MangaCorrespondenceMatch[];
};
type ChapterCardGroup = {
  chapter: string;
  cards: MultiSearchMergedResult[];
};

const EMPTY_PROGRESS_INDEX: MultiSearchProgressIndex = {
  recordsById: new Map(),
  recordsBySourceKey: new Map(),
};
const EMPTY_SOURCE_KEYS = new Set<string>();
const EMPTY_HISTORY = new Map();
const EMPTY_NEW_HISTORY_IDS = new Set<string>();

const buildChapterCard = (
  chapter: string,
  matches: MangaCorrespondenceMatch[],
  fallbackTitle: string,
  mergeOptions: MultiSearchMergeOptions,
): MultiSearchMergedResult | undefined => {
  const seenSourceKeys = new Set<string>();
  const sources = matches.map((match) => match.source).filter((source) => {
    const key = buildMultiSearchSourceIdentityKey(source);
    if (seenSourceKeys.has(key)) return false;
    seenSourceKeys.add(key);
    return true;
  });
  if (!sources.length) return undefined;

  const preferredSource = selectPreferredMultiSearchTitleSource(
    sources,
    mergeOptions.preferredTitleLanguageCodes,
  );
  return {
    id: `manga-correspondence::chapter::${chapter}`,
    title: preferredSource?.result.title || fallbackTitle,
    coverUrl: preferredSource?.result.thumbnailUrl,
    summary: sources.find((source) => source.result.summary)?.result.summary,
    pageCount: sources.find((source) => source.result.pageCount)?.result.pageCount,
    sources,
    sourceLanguageCodes: buildMultiSearchResultLanguageFilterCodes(sources),
    tentativeAuthorNames: Array.from(new Set(sources.flatMap((source) => source.tentativeAuthorNames))),
    contentTypes: Array.from(new Set(sources.flatMap((source) => source.contentTypes))),
    preferredTitleLanguageCodes: [...mergeOptions.preferredTitleLanguageCodes],
  };
};

export default function MangaCorrespondenceView({ backgroundSearchJobId, resultOnly = false }: Props) {
  const { job, loading, error, cancel } = useBackgroundSearchJob(backgroundSearchJobId);
  const { params } = useParams();
  const { openModal, closeModal } = useModal();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("mergedChapters");
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const [excludedReadingListChapters, setExcludedReadingListChapters] = useState<Set<string>>(
    () => new Set(),
  );
  const location = useLocation();
  const navigate = useNavigate();
  const result = job?.result as MangaCorrespondenceBackgroundResult | undefined;
  const input = job?.input as MangaCorrespondenceBackgroundInput | undefined;
  const mergeOptions = useMemo<MultiSearchMergeOptions>(() => ({
    enableRomajiPhoneticMerge: true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [params?.multiSearchMergedTitleLanguagePriority]);
  const eligibleMatches = useMemo(
    () => (result?.matches ?? []).filter((match) => (
      !isClearlyDerivativeMangaCorrespondenceTitle(match.source.result.title)
    )),
    [result?.matches],
  );
  const allSources = useMemo(() => eligibleMatches.map((match) => match.source), [eligibleMatches]);
  const classicGroups = useMemo(() => mergeMultiSearchResults(allSources, mergeOptions), [allSources, mergeOptions]);
  const chapterMatchGroups = useMemo<ChapterMatchGroup[]>(() => {
    const byChapter = new Map<string, MangaCorrespondenceMatch[]>();
    eligibleMatches.forEach((match) => {
      const titleAnalysis = analyzeMangaCorrespondenceTitle(
        stripMangaCorrespondenceTrailingKnownAuthor(
          match.source.result.title,
          input?.reference.authors ?? [],
        ),
        getScraperTitleAnalysisFeatureConfig(getScraperFeature(match.source.scraper, "titleAnalysis")),
      );
      const inferredFirstChapter = inferMangaCorrespondenceFirstChapter(titleAnalysis, [
        match.matchedTerm,
        input?.reference.title ?? "",
        ...(input?.reference.alternativeTitles ?? []),
      ]);
      const chapter = titleAnalysis.chapter || inferredFirstChapter || "Non renseigné";
      byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), match]);
    });
    return Array.from(byChapter.entries())
      .sort(([left], [right]) => compareMangaCorrespondenceChapters(left, right))
      .map(([chapter, matches]) => ({ chapter, matches }));
  }, [
    eligibleMatches,
    input?.reference.alternativeTitles,
    input?.reference.authors,
    input?.reference.title,
  ]);
  const chapterEntries = useMemo<MangaCorrespondenceReadingListChapter[]>(() => (
    chapterMatchGroups.flatMap(({ chapter, matches }) => {
      const resultCard = buildChapterCard(
        chapter,
        matches,
        job?.metadata.primaryTerm || "Manga",
        mergeOptions,
      );
      return resultCard ? [{ chapter, result: resultCard }] : [];
    })
  ), [chapterMatchGroups, job?.metadata.primaryTerm, mergeOptions]);
  const groupedChapterCards = useMemo<ChapterCardGroup[]>(() => (
    chapterEntries.map(({ chapter, result: chapterCard }) => ({
      chapter,
      cards: applyManualMultiSearchSplits(
        [chapterCard],
        new Set([chapterCard.id]),
      ),
    }))
  ), [chapterEntries]);
  const visibleGroupedChapterCards = useMemo<ChapterCardGroup[]>(() => (
    groupedChapterCards
      .map((group) => ({
        ...group,
        cards: filterMultiSearchMergedResultsByLanguage(group.cards, languageFilterModes),
      }))
      .filter((group) => group.cards.length > 0)
  ), [groupedChapterCards, languageFilterModes]);
  const chapterCards = useMemo(
    () => chapterEntries.map((entry) => entry.result),
    [chapterEntries],
  );
  const readingListChapters = useMemo(
    () => chapterEntries.filter((entry) => entry.chapter !== "Non renseigné"),
    [chapterEntries],
  );
  const includedReadingListChapters = useMemo(
    () => filterIncludedMangaCorrespondenceChapters(
      readingListChapters,
      excludedReadingListChapters,
    ),
    [excludedReadingListChapters, readingListChapters],
  );
  const chapterByResultId = useMemo(
    () => new Map(chapterEntries.map((entry) => [entry.result.id, entry.chapter])),
    [chapterEntries],
  );
  const resultLanguageCodes = useMemo(() => buildMultiSearchResultLanguageFilterCodes(allSources), [allSources]);
  const visibleClassicGroups = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(classicGroups, languageFilterModes),
    [classicGroups, languageFilterModes],
  );
  const visibleChapterCards = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(chapterCards, languageFilterModes),
    [chapterCards, languageFilterModes],
  );

  useEffect(() => {
    setExcludedReadingListChapters(new Set());
  }, [backgroundSearchJobId]);

  const toggleReadingListChapter = (chapter: string) => {
    setExcludedReadingListChapters((current) => (
      toggleMangaCorrespondenceChapterExclusion(current, chapter)
    ));
  };

  const toggleLanguageFilter = (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => {
    setLanguageFilterModes((current) => ({
      ...current,
      [languageCode]: toggleMultiSearchLanguageFilterMode(
        getMultiSearchLanguageFilterMode(current, languageCode),
        mode,
      ),
    }));
  };
  const openSource = (source: MultiSearchSourceResult, workspace = false) => {
    const sourceUrl = source.result.detailUrl;
    if (!sourceUrl) return;
    if (workspace) {
      void openWorkspaceTarget({ kind: "scraper.details", scraperId: source.scraper.id, sourceUrl, title: source.result.title });
      return;
    }
    navigate({ pathname: location.pathname, search: writeScraperRouteState(location.search, {
      scraperId: source.scraper.id,
      mode: "manga",
      searchActive: false,
      searchQuery: "",
      searchPage: 1,
      authorActive: false,
      authorQuery: "",
      authorPage: 1,
      mangaQuery: source.result.title,
      mangaUrl: sourceUrl,
      bookmarksFilterScraperId: null,
    }) });
  };
  const createReadingList = async (
    items: ReadingListItem[],
    languageCode: string,
  ): Promise<void> => {
    const title = `${job?.metadata.primaryTerm || "Manga"} · ${getLanguageLabel(languageCode)}`;
    const opened = await openWorkspaceTarget({
      kind: "reading-list",
      items,
      title,
    });
    if (!opened) {
      throw new Error("L’espace de travail n’a pas pu ouvrir la liste de lecture.");
    }
    closeModal();
  };
  const openReadingListDialog = () => {
    openModal({
      title: "Créer une liste de lecture",
      className: "manga-correspondence-reading-list-modal",
      content: (
        <MangaCorrespondenceReadingListDialog
          chapters={readingListChapters}
          initialExcludedChapterLabels={Array.from(excludedReadingListChapters)}
          preferredLanguageCodes={mergeOptions.preferredTitleLanguageCodes}
          onCancel={closeModal}
          onCreate={createReadingList}
          onExcludedChapterLabelsChange={(chapterLabels) => {
            setExcludedReadingListChapters(new Set(chapterLabels));
          }}
        />
      ),
    });
  };
  const renderCards = (
    items: MultiSearchMergedResult[],
    withReadingListPreparation = false,
  ) => (
    <div className="manga-correspondence-view__results">
      {items.map((item) => {
        const chapter = withReadingListPreparation
          ? chapterByResultId.get(item.id)
          : undefined;
        const isReadingListChapter = Boolean(chapter && chapter !== "Non renseigné");
        const isExcluded = isReadingListChapter && chapter
          ? excludedReadingListChapters.has(chapter)
          : false;
        return (
          <div
            key={item.id}
            className={[
              "manga-correspondence-view__result",
              isExcluded ? "is-reading-list-excluded" : "",
            ].join(" ").trim()}
          >
            {chapter ? (
              <div
                className={[
                  "manga-correspondence-view__list-preparation",
                  isReadingListChapter ? "" : "is-unassigned",
                ].join(" ").trim()}
              >
                <span>
                  {isReadingListChapter
                    ? `Liste de lecture · ${formatMangaCorrespondenceChapterLabel(chapter)}`
                    : "Hors liste · numéro de chapitre non déterminé"}
                </span>
                {isReadingListChapter ? (
                  <button
                    type="button"
                    className={isExcluded ? "is-excluded" : ""}
                    aria-pressed={isExcluded}
                    onClick={() => toggleReadingListChapter(chapter)}
                  >
                    {isExcluded ? "Réintégrer" : "Invalider"}
                  </button>
                ) : null}
              </div>
            ) : null}
            <MultiSearchResultCard
              result={item}
              libraryMangas={[]}
              bookmarkedSourceKeys={EMPTY_SOURCE_KEYS}
              sourceProgressIndex={EMPTY_PROGRESS_INDEX}
              viewHistoryRecordsById={EMPTY_HISTORY}
              newViewHistoryIds={EMPTY_NEW_HISTORY_IDS}
              viewHistoryRecordingDisabled
              onOpenSource={(source) => openSource(source)}
              onOpenSourceInWorkspace={(source) => openSource(source, true)}
              onOpenProgressReader={() => undefined}
              onSetSourcesRead={() => undefined}
            />
          </div>
        );
      })}
    </div>
  );
  const renderGroupedChapterCards = (groups: ChapterCardGroup[]) => (
    <div className="manga-correspondence-view__chapter-groups">
      {groups.map(({ chapter, cards }) => {
        const isReadingListChapter = chapter !== "Non renseigné";
        const isExcluded = isReadingListChapter && excludedReadingListChapters.has(chapter);
        return (
          <section
            key={chapter}
            className={[
              "manga-correspondence-view__chapter-group",
              isExcluded ? "is-reading-list-excluded" : "",
            ].filter(Boolean).join(" ")}
          >
            <header className="manga-correspondence-view__chapter-group-header">
              <div>
                <h3>{isReadingListChapter
                  ? formatMangaCorrespondenceChapterLabel(chapter, true)
                  : "Chapitre non renseigné"}</h3>
                <span>{cards.length} carte(s)</span>
              </div>
              {isReadingListChapter ? (
                <button
                  type="button"
                  className={isExcluded ? "is-excluded" : ""}
                  aria-pressed={isExcluded}
                  onClick={() => toggleReadingListChapter(chapter)}
                >
                  {isExcluded ? "Réintégrer dans la liste" : "Invalider pour la liste"}
                </button>
              ) : null}
            </header>
            {renderCards(cards)}
          </section>
        );
      })}
    </div>
  );

  if (loading) return <div className="app-route-loading" aria-busy="true" />;
  if (error || !job) return <div className="empty">{error || "Recherche introuvable."}</div>;
  const active = job.metadata.status === "queued" || job.metadata.status === "running";
  const displayedCards = displayMode === "mergedChapters" ? visibleChapterCards : visibleClassicGroups;
  const displayedCardCount = displayMode === "groupedChapters"
    ? visibleGroupedChapterCards.reduce((count, group) => count + group.cards.length, 0)
    : displayedCards.length;
  const traceSearchCount = result?.trace.filter((step) => (
    step.kind === "titleSearch" || step.kind === "authorSearch"
  )).length ?? 0;
  const traceDiscoveryCount = (result?.trace.length ?? 0) - traceSearchCount;
  return (
    <section className="manga-correspondence-view">
      {!resultOnly ? <header className="manga-correspondence-view__summary">
        <div>
          <p className="manga-correspondence-view__eyebrow">Recherche intelligente</p>
          <h2>{job.metadata.primaryTerm}</h2>
          <p>{displayedCardCount} card(s) · {eligibleMatches.length} source(s) · {active ? "Recherche en cours" : "Recherche terminée"}</p>
        </div>
        {active ? <button type="button" className="manga-correspondence-view__stop" onClick={() => void cancel()}>Arrêter</button> : null}
      </header> : null}
      <details className="manga-correspondence-view__trace">
        <summary>
          Déroulé de la recherche ({result?.trace.length ?? 0} événements · {traceSearchCount} recherches · {traceDiscoveryCount} découvertes)
        </summary>
        <ol>{result?.trace.map((step) => <li key={step.id}><strong>{step.label}</strong><span>{step.term}</span>{typeof step.resultCount === "number" ? <small>{step.resultCount} nouveau(x) résultat(s)</small> : null}</li>)}</ol>
      </details>
      <div className="manga-correspondence-view__controls">
        <div className="manga-correspondence-view__toolbar" aria-label="Mode d’affichage">
          <button type="button" className={displayMode === "mergedChapters" ? "is-active" : ""} onClick={() => setDisplayMode("mergedChapters")}>Chapitres fusionnés</button>
          <button type="button" className={displayMode === "groupedChapters" ? "is-active" : ""} onClick={() => setDisplayMode("groupedChapters")}>Chapitres détaillés</button>
          <button type="button" className={displayMode === "classic" ? "is-active" : ""} onClick={() => setDisplayMode("classic")}>Classique</button>
          <button
            type="button"
            className="manga-correspondence-view__reading-list"
            onClick={openReadingListDialog}
            disabled={!includedReadingListChapters.length}
          >
            Créer une liste de lecture ({includedReadingListChapters.length})
          </button>
          {excludedReadingListChapters.size ? (
            <button
              type="button"
              className="manga-correspondence-view__restore-list"
              onClick={() => setExcludedReadingListChapters(new Set())}
            >
              Réintégrer les {excludedReadingListChapters.size} invalidé(s)
            </button>
          ) : null}
        </div>
        <MultiSearchLanguageFilterBar
          languageCodes={resultLanguageCodes}
          filterModes={languageFilterModes}
          onToggleFilterMode={toggleLanguageFilter}
        />
      </div>
      {active && !result?.matches.length ? (
        <div className="empty">La recherche est en cours. Les correspondances apparaîtront ici dès qu’elles seront trouvées.</div>
      ) : displayMode === "groupedChapters" ? (
        visibleGroupedChapterCards.length
          ? renderGroupedChapterCards(visibleGroupedChapterCards)
          : <div className="empty">Aucun résultat ne correspond aux filtres de langue.</div>
      ) : displayedCards.length ? renderCards(displayedCards, displayMode === "mergedChapters") : (
        <div className="empty">Aucun résultat ne correspond aux filtres de langue.</div>
      )}
    </section>
  );
}
