import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
  MangaCorrespondenceRejectedCandidate,
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
  resolveMangaCorrespondenceMatchChapter,
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
  toggleMangaCorrespondenceSourceExclusion,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceReadingListSelection";
import type { ReadingListItem } from "@/renderer/types/readingList";
import {
  isClearlyDerivativeMangaCorrespondenceTitle,
  stripMangaCorrespondenceTrailingKnownAuthor,
} from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import { getMangaCorrespondenceScoreBand } from "@/renderer/backgroundSearch/mangaCorrespondenceRejectedCandidates";
import MangaCorrespondenceRejectedReviewDialog from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceRejectedReviewDialog";
import {
  buildMangaCorrespondenceContinuationInput,
  countAcceptedMangaCorrespondenceRejections,
  getEffectiveMangaCorrespondenceMatches,
  updateMangaCorrespondenceRejectedReview,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedReview";
import "@/renderer/components/MultiSearch/style.scss";
import "./view.scss";

type Props = { backgroundSearchJobId?: string; resultOnly?: boolean };
type DisplayMode = "mergedChapters" | "groupedChapters" | "classic";
type RejectedFilter = "likely" | "possible" | "all" | "accepted" | "dismissed";
type ChapterMatchGroup = {
  chapter: string;
  matches: MangaCorrespondenceMatch[];
};
type ChapterCardGroup = {
  chapter: string;
  cards: MultiSearchMergedResult[];
};
type RejectedCardGroup = {
  result: MultiSearchMergedResult;
  candidates: MangaCorrespondenceRejectedCandidate[];
  score: number;
};

const REJECTED_RESULTS_PAGE_SIZE = 24;
const EMPTY_REJECTED_CANDIDATES: MangaCorrespondenceRejectedCandidate[] = [];

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
  const { job, loading, error, cancel, reload } = useBackgroundSearchJob(backgroundSearchJobId);
  const { params } = useParams();
  const { openModal, closeModal } = useModal();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("mergedChapters");
  const [languageFilterModes, setLanguageFilterModes] = useState<MultiSearchLanguageFilterModes>({});
  const [excludedReadingListChapters, setExcludedReadingListChapters] = useState<Set<string>>(
    () => new Set(),
  );
  const [excludedSourceKeys, setExcludedSourceKeys] = useState<Set<string>>(() => new Set());
  const [showExcludedSources, setShowExcludedSources] = useState(false);
  const [rejectedFilter, setRejectedFilter] = useState<RejectedFilter>("all");
  const [rejectedVisibleLimit, setRejectedVisibleLimit] = useState(REJECTED_RESULTS_PAGE_SIZE);
  const [continuing, setContinuing] = useState(false);
  const [rejectedActionError, setRejectedActionError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const result = job?.result as MangaCorrespondenceBackgroundResult | undefined;
  const input = job?.input as MangaCorrespondenceBackgroundInput | undefined;
  const mergeOptions = useMemo<MultiSearchMergeOptions>(() => ({
    enableRomajiPhoneticMerge: true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [params?.multiSearchMergedTitleLanguagePriority]);
  const effectiveMatches = useMemo(
    () => getEffectiveMangaCorrespondenceMatches(
      result,
      input?.reference.title || job?.metadata.primaryTerm || "Manga",
    ),
    [input?.reference.title, job?.metadata.primaryTerm, result],
  );
  const correspondenceMatches = useMemo(
    () => effectiveMatches.filter((match) => (
      !isClearlyDerivativeMangaCorrespondenceTitle(match.source.result.title)
    )),
    [effectiveMatches],
  );
  const eligibleMatches = useMemo(
    () => correspondenceMatches.filter((match) => (
      !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(match.source))
    )),
    [correspondenceMatches, excludedSourceKeys],
  );
  const allSources = useMemo(() => eligibleMatches.map((match) => match.source), [eligibleMatches]);
  const classicGroups = useMemo(() => mergeMultiSearchResults(allSources, mergeOptions), [allSources, mergeOptions]);
  const allChapterMatchGroups = useMemo<ChapterMatchGroup[]>(() => {
    const byChapter = new Map<string, MangaCorrespondenceMatch[]>();
    correspondenceMatches.forEach((match) => {
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
      const chapter = resolveMangaCorrespondenceMatchChapter(
        match.chapter,
        titleAnalysis.chapter,
        inferredFirstChapter,
        match.acceptedManually,
      );
      byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), match]);
    });
    return Array.from(byChapter.entries())
      .sort(([left], [right]) => compareMangaCorrespondenceChapters(left, right))
      .map(([chapter, matches]) => ({ chapter, matches }));
  }, [
    correspondenceMatches,
    input?.reference.alternativeTitles,
    input?.reference.authors,
    input?.reference.title,
  ]);
  const chapterMatchGroups = useMemo<ChapterMatchGroup[]>(() => (
    allChapterMatchGroups.flatMap((group) => {
      const matches = group.matches.filter((match) => (
        !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(match.source))
      ));
      return matches.length ? [{ ...group, matches }] : [];
    })
  ), [allChapterMatchGroups, excludedSourceKeys]);
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
    allChapterMatchGroups.flatMap(({ chapter, matches }) => {
      const chapterCard = buildChapterCard(
        chapter,
        matches,
        job?.metadata.primaryTerm || "Manga",
        mergeOptions,
      );
      return chapterCard ? [{
        chapter,
        cards: applyManualMultiSearchSplits(
          [chapterCard],
          new Set([chapterCard.id]),
        ),
      }] : [];
    })
  ), [allChapterMatchGroups, job?.metadata.primaryTerm, mergeOptions]);
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
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(
      correspondenceMatches.map((match) => match.source),
    ),
    [correspondenceMatches],
  );
  const visibleClassicGroups = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(classicGroups, languageFilterModes),
    [classicGroups, languageFilterModes],
  );
  const visibleChapterCards = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(chapterCards, languageFilterModes),
    [chapterCards, languageFilterModes],
  );
  const rejectedCandidates = result?.rejectedCandidates ?? EMPTY_REJECTED_CANDIDATES;
  const rejectedCounts = useMemo(() => ({
    likely: rejectedCandidates.filter((candidate) => (
      candidate.decision === "pending" && getMangaCorrespondenceScoreBand(candidate.score) === "likely"
    )).length,
    possible: rejectedCandidates.filter((candidate) => (
      candidate.decision === "pending" && getMangaCorrespondenceScoreBand(candidate.score) === "possible"
    )).length,
    all: rejectedCandidates.filter((candidate) => candidate.decision === "pending").length,
    accepted: rejectedCandidates.filter((candidate) => candidate.decision === "accepted").length,
    dismissed: rejectedCandidates.filter((candidate) => candidate.decision === "dismissed").length,
  }), [rejectedCandidates]);
  const filteredRejectedCandidates = useMemo(() => rejectedCandidates.filter((candidate) => {
    if (rejectedFilter === "accepted") return candidate.decision === "accepted";
    if (rejectedFilter === "dismissed") return candidate.decision === "dismissed";
    if (candidate.decision !== "pending") return false;
    if (rejectedFilter === "all") return true;
    return getMangaCorrespondenceScoreBand(candidate.score) === rejectedFilter;
  }), [rejectedCandidates, rejectedFilter]);
  const rejectedCardGroups = useMemo<RejectedCardGroup[]>(() => {
    const candidatesBySourceKey = new Map(filteredRejectedCandidates.map((candidate) => (
      [buildMultiSearchSourceIdentityKey(candidate.source), candidate]
    )));
    const merged = mergeMultiSearchResults(
      filteredRejectedCandidates.map((candidate) => candidate.source),
      mergeOptions,
    );
    return filterMultiSearchMergedResultsByLanguage(merged, languageFilterModes).map((mergedResult) => {
      const candidates = mergedResult.sources.flatMap((source) => {
        const candidate = candidatesBySourceKey.get(buildMultiSearchSourceIdentityKey(source));
        return candidate ? [candidate] : [];
      });
      return {
        result: mergedResult,
        candidates,
        score: Math.max(0, ...candidates.map((candidate) => candidate.score)),
      };
    }).filter((group) => group.candidates.length > 0).sort((left, right) => (
      right.score - left.score
      || left.result.title.localeCompare(right.result.title)
    ));
  }, [filteredRejectedCandidates, languageFilterModes, mergeOptions]);
  const visibleRejectedCardGroups = rejectedCardGroups.slice(0, rejectedVisibleLimit);
  const acceptedRejectedCount = countAcceptedMangaCorrespondenceRejections(result);
  const acceptedSearchSeedCount = rejectedCandidates.filter((candidate) => (
    candidate.decision === "accepted"
    && candidate.useAsSearchSeed
    && candidate.searchSeedUsedInPass === undefined
  )).length;

  useEffect(() => {
    setExcludedReadingListChapters(new Set());
    setExcludedSourceKeys(new Set());
    setShowExcludedSources(false);
    setRejectedFilter("all");
    setRejectedVisibleLimit(REJECTED_RESULTS_PAGE_SIZE);
    setRejectedActionError(null);
    setContinuing(false);
  }, [backgroundSearchJobId]);

  useEffect(() => {
    setRejectedVisibleLimit(REJECTED_RESULTS_PAGE_SIZE);
  }, [rejectedFilter]);

  const toggleReadingListChapter = (chapter: string) => {
    setExcludedReadingListChapters((current) => (
      toggleMangaCorrespondenceChapterExclusion(current, chapter)
    ));
  };

  const toggleSourceExclusion = (sourceKey: string) => {
    setExcludedSourceKeys((current) => (
      toggleMangaCorrespondenceSourceExclusion(current, sourceKey)
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
  const persistRejectedReview = async (
    candidates: MangaCorrespondenceRejectedCandidate[],
    decision: MangaCorrespondenceRejectedCandidate["decision"],
    chapter?: string,
    useAsSearchSeed = true,
  ): Promise<void> => {
    if (!result || !backgroundSearchJobId) {
      throw new Error("Le résultat de cette recherche n’est plus disponible.");
    }
    const nextResult = updateMangaCorrespondenceRejectedReview(result, {
      candidateKeys: candidates.map((candidate) => candidate.key),
      decision,
      chapter,
      useAsSearchSeed,
    });
    const resultCount = getEffectiveMangaCorrespondenceMatches(
      nextResult,
      input?.reference.title || job?.metadata.primaryTerm || "Manga",
    ).length;
    const saved = await window.api?.saveBackgroundSearchResult?.({
      jobId: backgroundSearchJobId,
      result: nextResult,
      resultCount,
    });
    if (!saved) throw new Error("La décision n’a pas pu être enregistrée.");
    closeModal();
    await reload();
  };
  const openRejectedReview = (group: RejectedCardGroup) => {
    openModal({
      title: "Examiner une proposition écartée",
      className: "manga-correspondence-rejected-modal",
      content: (
        <MangaCorrespondenceRejectedReviewDialog
          candidates={group.candidates}
          onCancel={closeModal}
          onOpenSource={(candidate) => openSource(candidate.source, true)}
          onDismiss={() => persistRejectedReview(group.candidates, "dismissed")}
          onAccept={(chapter, useAsSearchSeed) => persistRejectedReview(
            group.candidates,
            "accepted",
            chapter,
            useAsSearchSeed,
          )}
        />
      ),
    });
  };
  const continueCorrespondenceSearch = async () => {
    if (!backgroundSearchJobId || !input || !result || !acceptedSearchSeedCount) return;
    setContinuing(true);
    setRejectedActionError(null);
    try {
      const continued = await window.api?.continueBackgroundSearch?.({
        jobId: backgroundSearchJobId,
        input: buildMangaCorrespondenceContinuationInput(input, result),
      });
      if (!continued) throw new Error("La deuxième passe n’a pas pu être lancée.");
      await reload();
    } catch (continueError) {
      setRejectedActionError(
        continueError instanceof Error
          ? continueError.message
          : "La deuxième passe n’a pas pu être lancée.",
      );
    } finally {
      setContinuing(false);
    }
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
    withSourceInvalidation = false,
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
        const source = withSourceInvalidation && item.sources.length === 1
          ? item.sources[0]
          : undefined;
        const sourceKey = source ? buildMultiSearchSourceIdentityKey(source) : undefined;
        const isSourceExcluded = sourceKey ? excludedSourceKeys.has(sourceKey) : false;
        return (
          <div
            key={item.id}
            className={[
              "manga-correspondence-view__result",
              isExcluded ? "is-reading-list-excluded" : "",
              isSourceExcluded ? "is-source-excluded" : "",
            ].join(" ").trim()}
          >
            {source && sourceKey ? (
              <div className="manga-correspondence-view__list-preparation is-source">
                <span>
                  {isSourceExcluded
                    ? `${source.scraper.name} · source retirée des résultats`
                    : `${source.scraper.name} · source conservée`}
                </span>
                <button
                  type="button"
                  className={isSourceExcluded ? "is-excluded" : ""}
                  aria-pressed={isSourceExcluded}
                  onClick={() => toggleSourceExclusion(sourceKey)}
                >
                  {isSourceExcluded ? "Réintégrer" : "Retirer"}
                </button>
              </div>
            ) : chapter ? (
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
        const excludedCardCount = cards.filter((card) => (
          card.sources.length === 1
          && excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(card.sources[0]))
        )).length;
        const activeCardCount = cards.length - excludedCardCount;
        const displayedGroupCards = showExcludedSources
          ? cards
          : cards.filter((card) => (
            card.sources.length !== 1
            || !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(card.sources[0]))
          ));
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
                <span>
                  {activeCardCount} source(s)
                  {excludedCardCount ? ` · ${excludedCardCount} retirée(s)` : ""}
                </span>
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
            {displayedGroupCards.length ? renderCards(displayedGroupCards, false, true) : (
              <p className="manga-correspondence-view__chapter-group-empty">
                Toutes les sources de ce chapitre ont été retirées.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
  const renderRejectedCards = (groups: RejectedCardGroup[]) => (
    <div className="manga-correspondence-view__results manga-correspondence-view__rejected-grid">
      {groups.map((group) => {
        const decision = group.candidates[0]?.decision ?? "pending";
        return (
          <div
            key={group.result.id}
            className={`manga-correspondence-view__rejected-card is-${decision}`}
          >
            <MultiSearchResultCard
              result={group.result}
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
            <button
              type="button"
              className={`manga-correspondence-view__rejected-score is-${getMangaCorrespondenceScoreBand(group.score)}`}
              onClick={() => openRejectedReview(group)}
              disabled={job?.metadata.status !== "completed"}
              aria-label={`Examiner cette proposition, score ${group.score} sur 100`}
            >
              <strong>{group.score}</strong>
              <span>{decision === "accepted" ? "Acceptée" : decision === "dismissed" ? "Écartée" : "Examiner"}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  if (loading) return <div className="app-route-loading" aria-busy="true" />;
  if (error || !job) return <div className="empty">{error || "Recherche introuvable."}</div>;
  const active = job.metadata.status === "queued" || job.metadata.status === "running";
  const displayedCards = displayMode === "mergedChapters" ? visibleChapterCards : visibleClassicGroups;
  const displayedCardCount = displayMode === "groupedChapters"
    ? visibleGroupedChapterCards.reduce((count, group) => count + group.cards.filter((card) => (
      card.sources.length !== 1
      || !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(card.sources[0]))
    )).length, 0)
    : displayedCards.length;
  const excludedSourceCount = correspondenceMatches.length - eligibleMatches.length;
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
          <p>
            {displayedCardCount} card(s) · {eligibleMatches.length} source(s)
            {excludedSourceCount ? ` · ${excludedSourceCount} retirée(s)` : ""}
            {` · Passe ${result?.passNumber ?? 1} · ${active ? "Recherche en cours" : "Recherche terminée"}`}
          </p>
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
              Réintégrer {excludedReadingListChapters.size} chapitre(s)
            </button>
          ) : null}
          {excludedSourceCount ? (
            <button
              type="button"
              className="manga-correspondence-view__restore-list"
              onClick={() => {
                setExcludedSourceKeys(new Set());
                setShowExcludedSources(false);
              }}
            >
              Réintégrer {excludedSourceCount} source(s)
            </button>
          ) : null}
          {displayMode === "groupedChapters" && excludedSourceCount ? (
            <button
              type="button"
              className={showExcludedSources ? "is-active" : ""}
              aria-pressed={showExcludedSources}
              onClick={() => setShowExcludedSources((current) => !current)}
            >
              {showExcludedSources
                ? "Masquer les sources retirées"
                : `Afficher ${excludedSourceCount} source(s) retirée(s)`}
            </button>
          ) : null}
        </div>
        <MultiSearchLanguageFilterBar
          languageCodes={resultLanguageCodes}
          filterModes={languageFilterModes}
          onToggleFilterMode={toggleLanguageFilter}
        />
      </div>
      {active && !eligibleMatches.length ? (
        <div className="empty">La recherche est en cours. Les correspondances apparaîtront ici dès qu’elles seront trouvées.</div>
      ) : displayMode === "groupedChapters" ? (
        visibleGroupedChapterCards.length
          ? renderGroupedChapterCards(visibleGroupedChapterCards)
          : <div className="empty">Aucun résultat ne correspond aux filtres de langue.</div>
      ) : displayedCards.length ? renderCards(displayedCards, displayMode === "mergedChapters") : (
        <div className="empty">Aucun résultat ne correspond aux filtres de langue.</div>
      )}
      {(result?.rejectedCandidateCount ?? 0) > 0 || rejectedCandidates.length > 0 ? (
        <details className="manga-correspondence-view__rejected">
          <summary>
            <span>Propositions écartées</span>
            <strong>{rejectedCounts.all} à examiner</strong>
            <small>
              {rejectedCandidates.length} conservée(s) sur {result?.rejectedCandidateCount ?? rejectedCandidates.length} candidate(s) analysée(s)
            </small>
          </summary>
          <div className="manga-correspondence-view__rejected-content">
            {acceptedRejectedCount ? (
              <div className="manga-correspondence-view__second-pass">
                <div>
                  <strong>{acceptedRejectedCount} proposition(s) acceptée(s)</strong>
                  <span>{acceptedSearchSeedCount} nouvelle(s) piste(s) prête(s) à être explorée(s)</span>
                </div>
                <button
                  type="button"
                  disabled={active || continuing || acceptedSearchSeedCount === 0}
                  onClick={() => void continueCorrespondenceSearch()}
                >
                  {active && (result?.passNumber ?? 1) > 1
                    ? `Passe ${result?.passNumber} en cours…`
                    : continuing
                      ? "Lancement…"
                      : acceptedSearchSeedCount === 0
                        ? "Pistes déjà explorées"
                        : `Lancer la passe ${(result?.passNumber ?? 1) + 1}`}
                </button>
              </div>
            ) : null}
            {rejectedActionError ? (
              <p className="manga-correspondence-view__rejected-error">{rejectedActionError}</p>
            ) : null}
            <div className="manga-correspondence-view__rejected-filters" aria-label="Filtrer les propositions écartées">
              {([
                ["likely", "Très probables", rejectedCounts.likely],
                ["possible", "Possibles", rejectedCounts.possible],
                ["all", "Toutes", rejectedCounts.all],
                ["accepted", "Acceptées", rejectedCounts.accepted],
                ["dismissed", "Écartées", rejectedCounts.dismissed],
              ] as Array<[RejectedFilter, string, number]>).map(([filter, label, count]) => (
                <button
                  type="button"
                  key={filter}
                  className={rejectedFilter === filter ? "is-active" : ""}
                  onClick={() => setRejectedFilter(filter)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
            {active ? (
              <p className="manga-correspondence-view__rejected-hint">
                Les propositions continuent d’être classées. Leur examen sera disponible à la fin de la passe.
              </p>
            ) : null}
            {visibleRejectedCardGroups.length ? renderRejectedCards(visibleRejectedCardGroups) : (
              <div className="empty">Aucune proposition dans cette catégorie.</div>
            )}
            {visibleRejectedCardGroups.length < rejectedCardGroups.length ? (
              <button
                type="button"
                className="manga-correspondence-view__rejected-more"
                onClick={() => setRejectedVisibleLimit((current) => current + REJECTED_RESULTS_PAGE_SIZE)}
              >
                Afficher {Math.min(
                  REJECTED_RESULTS_PAGE_SIZE,
                  rejectedCardGroups.length - visibleRejectedCardGroups.length,
                )} proposition(s) de plus
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
