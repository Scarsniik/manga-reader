import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type { MangaCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { mergeMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
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
  sources: MultiSearchSourceResult[],
  fallbackTitle: string,
  mergeOptions: { enableRomajiPhoneticMerge: boolean },
): MultiSearchMergedResult => {
  const mergedParts = mergeMultiSearchResults(sources, mergeOptions);
  const primary = mergedParts[0];
  const displayTitle = chapter === "Non renseigné"
    ? primary?.title || fallbackTitle
    : `${fallbackTitle} · Chapitre ${chapter}`;
  return {
    id: `manga-correspondence::chapter::${chapter}`,
    title: displayTitle,
    coverUrl: primary?.coverUrl || sources.find((source) => source.result.thumbnailUrl)?.result.thumbnailUrl,
    summary: primary?.summary,
    pageCount: primary?.pageCount,
    sources,
    sourceLanguageCodes: buildMultiSearchResultLanguageFilterCodes(sources),
    tentativeAuthorNames: Array.from(new Set(sources.flatMap((source) => source.tentativeAuthorNames))),
    contentTypes: Array.from(new Set(sources.flatMap((source) => source.contentTypes))),
  };
};

export default function MangaCorrespondenceView({ backgroundSearchJobId, resultOnly = false }: Props) {
  const { job, loading, error, cancel } = useBackgroundSearchJob(backgroundSearchJobId);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("chapters");
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const location = useLocation();
  const navigate = useNavigate();
  const result = job?.result as MangaCorrespondenceBackgroundResult | undefined;
  const mergeOptions = useMemo(() => ({ enableRomajiPhoneticMerge: true }), []);
  const allSources = useMemo(() => result?.matches.map((match) => match.source) ?? [], [result?.matches]);
  const classicGroups = useMemo(() => mergeMultiSearchResults(allSources, mergeOptions), [allSources, mergeOptions]);
  const chapterCards = useMemo(() => {
    const byChapter = new Map<string, MultiSearchSourceResult[]>();
    (result?.matches ?? []).forEach((match) => {
      const chapter = match.chapter || "Non renseigné";
      byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), match.source]);
    });
    return Array.from(byChapter.entries())
      .sort(([left], [right]) => chapterSortValue(left) - chapterSortValue(right) || left.localeCompare(right))
      .map(([chapter, sources]) => buildChapterCard(
        chapter,
        sources,
        job?.metadata.primaryTerm || "Manga",
        mergeOptions,
      ));
  }, [job?.metadata.primaryTerm, mergeOptions, result?.matches]);
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
        <summary>Déroulé de la recherche ({result?.trace.length ?? 0} étapes)</summary>
        <ol>{result?.trace.map((step) => <li key={step.id}><strong>{step.label}</strong><span>{step.term}</span>{typeof step.resultCount === "number" ? <small>{step.resultCount} nouveau(x) résultat(s)</small> : null}</li>)}</ol>
      </details>
      <div className="manga-correspondence-view__controls">
        <div className="manga-correspondence-view__toolbar" aria-label="Mode d’affichage">
          <button type="button" className={displayMode === "chapters" ? "is-active" : ""} onClick={() => setDisplayMode("chapters")}>Par chapitre</button>
          <button type="button" className={displayMode === "classic" ? "is-active" : ""} onClick={() => setDisplayMode("classic")}>Classique</button>
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
