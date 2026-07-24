import React, { useMemo, useState } from "react";
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
import { inferMangaCorrespondenceFirstChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
import { getLanguageLabel } from "@/renderer/utils/languageDetection";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";
import MangaCorrespondenceReadingListDialog, {
  type MangaCorrespondenceReadingListChapter,
} from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceReadingListDialog";
import type { ReadingListItem } from "@/renderer/types/readingList";
import "@/renderer/components/MultiSearch/style.scss";
import "./view.scss";

type Props = { backgroundSearchJobId?: string; resultOnly?: boolean };
type DisplayMode = "chapters" | "classic";

const EMPTY_PROGRESS_INDEX: MultiSearchProgressIndex = {
  recordsById: new Map(),
  recordsBySourceKey: new Map(),
};
const EMPTY_SOURCE_KEYS = new Set<string>();
const EMPTY_HISTORY = new Map();
const EMPTY_NEW_HISTORY_IDS = new Set<string>();

const chapterSortValue = (value: string): number => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

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
  const [displayMode, setDisplayMode] = useState<DisplayMode>("chapters");
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const location = useLocation();
  const navigate = useNavigate();
  const result = job?.result as MangaCorrespondenceBackgroundResult | undefined;
  const input = job?.input as MangaCorrespondenceBackgroundInput | undefined;
  const mergeOptions = useMemo<MultiSearchMergeOptions>(() => ({
    enableRomajiPhoneticMerge: true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [params?.multiSearchMergedTitleLanguagePriority]);
  const allSources = useMemo(() => result?.matches.map((match) => match.source) ?? [], [result?.matches]);
  const classicGroups = useMemo(() => mergeMultiSearchResults(allSources, mergeOptions), [allSources, mergeOptions]);
  const chapterEntries = useMemo<MangaCorrespondenceReadingListChapter[]>(() => {
    const byChapter = new Map<string, MangaCorrespondenceMatch[]>();
    (result?.matches ?? []).forEach((match) => {
      const titleAnalysis = analyzeMangaCorrespondenceTitle(
        match.source.result.title,
        getScraperTitleAnalysisFeatureConfig(getScraperFeature(match.source.scraper, "titleAnalysis")),
      );
      const inferredFirstChapter = inferMangaCorrespondenceFirstChapter(titleAnalysis, [
        match.matchedTerm,
        input?.reference.title ?? "",
        ...(input?.reference.alternativeTitles ?? []),
      ]);
      const chapter = titleAnalysis.chapter || match.chapter || inferredFirstChapter || "Non renseigné";
      byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), match]);
    });
    return Array.from(byChapter.entries())
      .sort(([left], [right]) => chapterSortValue(left) - chapterSortValue(right) || left.localeCompare(right))
      .flatMap(([chapter, matches]) => {
        const resultCard = buildChapterCard(
          chapter,
          matches,
          job?.metadata.primaryTerm || "Manga",
          mergeOptions,
        );
        return resultCard ? [{ chapter, result: resultCard }] : [];
      });
  }, [
    input?.reference.alternativeTitles,
    input?.reference.title,
    job?.metadata.primaryTerm,
    mergeOptions,
    result?.matches,
  ]);
  const chapterCards = useMemo(
    () => chapterEntries.map((entry) => entry.result),
    [chapterEntries],
  );
  const readingListChapters = useMemo(
    () => chapterEntries.filter((entry) => entry.chapter !== "Non renseigné"),
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
          preferredLanguageCodes={mergeOptions.preferredTitleLanguageCodes}
          onCancel={closeModal}
          onCreate={createReadingList}
        />
      ),
    });
  };
  const renderCards = (items: MultiSearchMergedResult[]) => (
    <div className="manga-correspondence-view__results">
      {items.map((item) => (
        <MultiSearchResultCard
          key={item.id}
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
      ))}
    </div>
  );

  if (loading) return <div className="app-route-loading" aria-busy="true" />;
  if (error || !job) return <div className="empty">{error || "Recherche introuvable."}</div>;
  const active = job.metadata.status === "queued" || job.metadata.status === "running";
  const displayedCards = displayMode === "chapters" ? visibleChapterCards : visibleClassicGroups;
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
          <p>{displayedCards.length} card(s) · {result?.matches.length ?? 0} source(s) · {active ? "Recherche en cours" : "Recherche terminée"}</p>
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
          <button type="button" className={displayMode === "chapters" ? "is-active" : ""} onClick={() => setDisplayMode("chapters")}>Par chapitre</button>
          <button type="button" className={displayMode === "classic" ? "is-active" : ""} onClick={() => setDisplayMode("classic")}>Classique</button>
          <button
            type="button"
            className="manga-correspondence-view__reading-list"
            onClick={openReadingListDialog}
            disabled={!readingListChapters.length}
          >
            Créer une liste de lecture
          </button>
        </div>
        <MultiSearchLanguageFilterBar
          languageCodes={resultLanguageCodes}
          filterModes={languageFilterModes}
          onToggleFilterMode={toggleLanguageFilter}
        />
      </div>
      {active && !result?.matches.length ? (
        <div className="empty">La recherche est en cours. Les correspondances apparaîtront ici dès qu’elles seront trouvées.</div>
      ) : displayedCards.length ? renderCards(displayedCards) : (
        <div className="empty">Aucun résultat ne correspond aux filtres de langue.</div>
      )}
    </section>
  );
}
