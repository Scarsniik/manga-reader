import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceDiscovery,
  MangaCorrespondenceMatch,
  MangaCorrespondenceRejectedCandidate,
} from "@/renderer/backgroundSearch/types";
import type {
  BackgroundSearchJob,
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceResultDecision,
} from "@/shared/backgroundSearch";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
import ChapterGroupList from "@/renderer/components/ChapterGroups/ChapterGroupList";
import MergedChapterCardGrid from "@/renderer/components/ChapterGroups/MergedChapterCardGrid";
import { buildMangaChapterCard } from "@/renderer/components/ChapterGroups/mangaChapterCard";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  buildMultiSearchSourceIdentityKey,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import { applyManualMultiSearchSplits } from "@/renderer/components/MultiSearch/multiSearchManualSplit";
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
import { getLanguageLabel } from "@/renderer/utils/languageDetection";
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
} from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import { getMangaCorrespondenceScoreBand } from "@/renderer/backgroundSearch/mangaCorrespondenceRejectedCandidates";
import MangaCorrespondenceRejectedReviewDialog from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceRejectedReviewDialog";
import MangaCorrespondenceChapterEditDialog, {
  type MangaCorrespondenceChapterEditEntry,
} from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceChapterEditDialog";
import {
  buildMangaCorrespondenceContinuationInput,
  countAcceptedMangaCorrespondenceRejections,
  getEffectiveMangaCorrespondenceMatches,
  updateMangaCorrespondenceRejectedReview,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedReview";
import useIncrementalMultiSearchMerge from "@/renderer/components/MultiSearch/useIncrementalMultiSearchMerge";
import useAdaptiveMultiSearchListProcessing from "@/renderer/components/MultiSearch/useAdaptiveMultiSearchListProcessing";
import {
  resetMangaCorrespondenceChapterOverrides,
  updateMangaCorrespondenceChapterOverrides,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceChapterOverrides";
import MangaCorrespondenceDiscoveriesDialog from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceDiscoveriesDialog";
import {
  buildInitialMangaCorrespondenceDiscoveries,
  buildMangaCorrespondenceReplayInput,
  normalizeMangaCorrespondenceDiscoveryValue,
} from "@/renderer/backgroundSearch/mangaCorrespondenceDiscoveries";
import {
  buildMangaCorrespondenceResultDecisions,
  updateMangaCorrespondenceResultStatuses,
} from "@/renderer/backgroundSearch/mangaCorrespondenceResultDecisions";
import { resolveMangaCorrespondenceManualDiscovery } from "@/renderer/backgroundSearch/mangaCorrespondenceManualDiscoveries";
import { buildMangaCorrespondenceSafetySettings } from "@/shared/mangaCorrespondenceSafetySettings";
import AuthorCorrespondenceDialog from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceDialog";
import ExistingAuthorSearchDialog from "@/renderer/components/MangaCorrespondence/ExistingAuthorSearchDialog";
import { filterMangaCorrespondenceRejectedCandidatesByText } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedFilters";
import { collectMangaCorrespondenceAuthors } from "@/renderer/searchEngines/authorCorrespondenceMangaDiscovery";
import {
  resolveMangaCorrespondenceChapterGroups,
  type MangaCorrespondenceChapterMatchGroup,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceChapterGroups";
import useRelatedBackgroundSearchJobs from "@/renderer/backgroundSearch/useRelatedBackgroundSearchJobs";
import { importLinkedAuthorSearchIntoManga } from "@/renderer/backgroundSearch/linkedAuthorSearchOrchestration";
import { requestBackgroundSearchOpenInCurrentView } from "@/renderer/backgroundSearch/backgroundSearchNavigation";
import {
  buildMangaCorrespondenceReferenceMatch,
  includeMangaCorrespondenceReferenceMatch,
} from "@/renderer/backgroundSearch/mangaCorrespondenceReferenceMatch";
import "@/renderer/components/MultiSearch/style.scss";
import "./view.scss";

type Props = { backgroundSearchJobId?: string; resultOnly?: boolean };
type DisplayMode = "mergedChapters" | "groupedChapters" | "classic";
type RejectedFilter = "likely" | "possible" | "all" | "accepted" | "dismissed";
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

const LINKED_AUTHOR_STATUS_LABELS: Record<string, string> = {
  waiting: "En cours",
  manualReady: "Prête à importer",
  pending: "Import automatique en attente",
  processing: "Import du corpus en cours",
  completed: "À jour",
  blocked: "Relance automatique bloquée",
  error: "Échec de l’import automatique",
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
  const [rejectedTextFilter, setRejectedTextFilter] = useState("");
  const [rejectedVisibleLimit, setRejectedVisibleLimit] = useState(REJECTED_RESULTS_PAGE_SIZE);
  const [continuing, setContinuing] = useState(false);
  const [rejectedActionError, setRejectedActionError] = useState<string | null>(null);
  const [linkedAuthorActionJobId, setLinkedAuthorActionJobId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const result = job?.result as MangaCorrespondenceBackgroundResult | undefined;
  const input = job?.input as MangaCorrespondenceBackgroundInput | undefined;
  const linkedAuthorSearches = useRelatedBackgroundSearchJobs(
    backgroundSearchJobId,
    input?.linkedAuthorImports?.map((entry) => entry.authorJobId) ?? [],
  );
  const editableDiscoveries = useMemo(() => {
    const baseDiscoveries = result?.discoveries?.length
      ? result.discoveries
      : input
        ? buildInitialMangaCorrespondenceDiscoveries(input)
        : [];
    const mangaDetailUrls = new Set([
      input?.reference.sourceUrl,
      ...(result?.matches ?? []).map((match) => match.source.result.detailUrl),
      ...(result?.rejectedCandidates ?? []).map((candidate) => candidate.source.result.detailUrl),
    ].filter((url): url is string => Boolean(url?.trim())));
    const referenceAuthorUrls = input?.reference.authorUrls ?? [];
    return baseDiscoveries.map((discovery) => {
      if (discovery.kind !== "author" || discovery.authorPageUrl) return discovery;
      const referenceAuthorIndex = input?.reference.authors.findIndex((author) => (
        normalizeMangaCorrespondenceDiscoveryValue(author) === discovery.normalizedValue
      )) ?? -1;
      const referenceAuthorUrl = referenceAuthorIndex >= 0
        ? referenceAuthorUrls[referenceAuthorIndex]
          ?? (referenceAuthorUrls.length === 1 ? referenceAuthorUrls[0] : undefined)
        : undefined;
      const legacyAuthorPageUrl = discovery.sourceUrl
        && (
          discovery.origin === "authorPage"
          || (discovery.origin !== "reference" && !mangaDetailUrls.has(discovery.sourceUrl))
        )
        ? discovery.sourceUrl
        : undefined;
      const authorPageUrl = referenceAuthorUrl ?? legacyAuthorPageUrl;
      return authorPageUrl ? { ...discovery, authorPageUrl } : discovery;
    });
  }, [input, result]);
  const editableResultDecisions = useMemo(
    () => buildMangaCorrespondenceResultDecisions(result),
    [result],
  );
  const mergeOptions = useMemo<MultiSearchMergeOptions>(() => ({
    enableRomajiPhoneticMerge: true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [params?.multiSearchMergedTitleLanguagePriority]);
  const referenceMatch = useMemo(
    () => buildMangaCorrespondenceReferenceMatch(input),
    [input],
  );
  const effectiveMatches = useMemo(
    () => includeMangaCorrespondenceReferenceMatch(
      input,
      getEffectiveMangaCorrespondenceMatches(
        result,
        input?.reference.title || job?.metadata.primaryTerm || "Manga",
      ),
    ),
    [input, job?.metadata.primaryTerm, result],
  );
  const correspondenceMatches = useMemo(
    () => effectiveMatches.filter((match) => (
      match.key === referenceMatch?.key
      || !isClearlyDerivativeMangaCorrespondenceTitle(match.source.result.title)
    )),
    [effectiveMatches, referenceMatch?.key],
  );
  const chapterGroupResolution = useMemo(
    () => resolveMangaCorrespondenceChapterGroups(correspondenceMatches, input?.reference),
    [correspondenceMatches, input?.reference],
  );
  const chapterResolutionByMatchKey = chapterGroupResolution.resolutionByMatchKey;
  const correspondenceMatchBySourceKey = useMemo(() => new Map(
    correspondenceMatches.map((match) => [
      buildMultiSearchSourceIdentityKey(match.source),
      match,
    ]),
  ), [correspondenceMatches]);
  const eligibleMatches = useMemo(
    () => correspondenceMatches.filter((match) => (
      !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(match.source))
    )),
    [correspondenceMatches, excludedSourceKeys],
  );
  const allSources = useMemo(() => eligibleMatches.map((match) => match.source), [eligibleMatches]);
  const { mergedResults: classicGroups } = useIncrementalMultiSearchMerge(
    allSources,
    0,
    mergeOptions,
  );
  const allChapterMatchGroups = chapterGroupResolution.groups;
  const chapterMatchGroups = useMemo<MangaCorrespondenceChapterMatchGroup[]>(() => (
    allChapterMatchGroups.flatMap((group) => {
      const matches = group.matches.filter((match) => (
        !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(match.source))
      ));
      return matches.length ? [{ ...group, matches }] : [];
    })
  ), [allChapterMatchGroups, excludedSourceKeys]);
  const chapterEntries = useMemo<MangaCorrespondenceReadingListChapter[]>(() => (
    chapterMatchGroups.flatMap(({ chapter, matches }) => {
      const resultCard = buildMangaChapterCard({
        chapter,
        fallbackTitle: job?.metadata.primaryTerm || "Manga",
        idPrefix: "manga-correspondence",
        mergeOptions,
        sources: matches.map((match) => match.source),
      });
      return resultCard ? [{ chapter, result: resultCard }] : [];
    })
  ), [chapterMatchGroups, job?.metadata.primaryTerm, mergeOptions]);
  const groupedChapterCards = useMemo<ChapterCardGroup[]>(() => (
    allChapterMatchGroups.flatMap(({ chapter, matches }) => {
      const chapterCard = buildMangaChapterCard({
        chapter,
        fallbackTitle: job?.metadata.primaryTerm || "Manga",
        idPrefix: "manga-correspondence",
        mergeOptions,
        sources: matches.map((match) => match.source),
      });
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
  const correspondenceListFilters = useMemo(() => ({
    languageFilterModes,
    readingStatusFilters: [],
    textFilter: "",
    readingStatusContext: {
      libraryMangas: [],
      bookmarkedSourceKeys: EMPTY_SOURCE_KEYS,
      sourceProgressIndex: EMPTY_PROGRESS_INDEX,
      viewHistoryRecordsById: EMPTY_HISTORY,
    },
  }), [languageFilterModes]);
  const { results: visibleClassicGroups } = useAdaptiveMultiSearchListProcessing(
    classicGroups,
    [],
    correspondenceListFilters,
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
  const categoryFilteredRejectedCandidates = useMemo(() => rejectedCandidates.filter((candidate) => {
    if (rejectedFilter === "accepted") return candidate.decision === "accepted";
    if (rejectedFilter === "dismissed") return candidate.decision === "dismissed";
    if (candidate.decision !== "pending") return false;
    if (rejectedFilter === "all") return true;
    return getMangaCorrespondenceScoreBand(candidate.score) === rejectedFilter;
  }), [rejectedCandidates, rejectedFilter]);
  const filteredRejectedCandidates = useMemo(
    () => filterMangaCorrespondenceRejectedCandidatesByText(
      categoryFilteredRejectedCandidates,
      rejectedTextFilter,
    ),
    [categoryFilteredRejectedCandidates, rejectedTextFilter],
  );
  const rejectedSources = useMemo(
    () => filteredRejectedCandidates.map((candidate) => candidate.source),
    [filteredRejectedCandidates],
  );
  const { mergedResults: rejectedMergedResults } = useIncrementalMultiSearchMerge(
    rejectedSources,
    0,
    mergeOptions,
  );
  const { results: visibleRejectedMergedResults } = useAdaptiveMultiSearchListProcessing(
    rejectedMergedResults,
    [],
    correspondenceListFilters,
  );
  const rejectedCardGroups = useMemo<RejectedCardGroup[]>(() => {
    const candidatesBySourceKey = new Map(filteredRejectedCandidates.map((candidate) => (
      [buildMultiSearchSourceIdentityKey(candidate.source), candidate]
    )));
    return visibleRejectedMergedResults.map((mergedResult) => {
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
  }, [filteredRejectedCandidates, visibleRejectedMergedResults]);
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
    setRejectedTextFilter("");
    setRejectedVisibleLimit(REJECTED_RESULTS_PAGE_SIZE);
    setRejectedActionError(null);
    setContinuing(false);
  }, [backgroundSearchJobId]);

  useEffect(() => {
    setExcludedSourceKeys(new Set(editableResultDecisions
      .filter((decision) => decision.status === "invalidated")
      .map((decision) => decision.key)));
  }, [editableResultDecisions]);

  useEffect(() => {
    setRejectedVisibleLimit(REJECTED_RESULTS_PAGE_SIZE);
  }, [rejectedFilter, rejectedTextFilter]);

  const toggleReadingListChapter = (chapter: string) => {
    setExcludedReadingListChapters((current) => (
      toggleMangaCorrespondenceChapterExclusion(current, chapter)
    ));
  };

  const persistResultStatuses = async (
    updates: ReadonlyMap<string, MangaCorrespondenceResultDecision["status"]>,
  ): Promise<void> => {
    if (!result || !backgroundSearchJobId) {
      throw new Error("Le résultat de cette recherche n’est plus disponible.");
    }
    const nextResult = updateMangaCorrespondenceResultStatuses(result, updates);
    const invalidatedKeys = new Set((nextResult.resultDecisions ?? [])
      .filter((decision) => decision.status === "invalidated")
      .map((decision) => decision.key));
    const saved = await window.api?.saveBackgroundSearchResult?.({
      jobId: backgroundSearchJobId,
      result: nextResult,
      resultCount: correspondenceMatches.filter((match) => !invalidatedKeys.has(match.key)).length,
    });
    if (!saved) throw new Error("Les invalidations n’ont pas pu être enregistrées.");
    await reload();
  };

  const toggleSourceExclusion = async (sourceKey: string) => {
    const nextExcluded = toggleMangaCorrespondenceSourceExclusion(excludedSourceKeys, sourceKey);
    setExcludedSourceKeys(nextExcluded);
    setRejectedActionError(null);
    try {
      await persistResultStatuses(new Map([[
        sourceKey,
        nextExcluded.has(sourceKey) ? "invalidated" : "active",
      ]]));
    } catch (toggleError) {
      setExcludedSourceKeys(excludedSourceKeys);
      setRejectedActionError(
        toggleError instanceof Error ? toggleError.message : "Impossible d’enregistrer l’invalidation.",
      );
    }
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
  const persistChapterOverrides = async (
    matches: MangaCorrespondenceMatch[],
    mode: "match" | "group",
    value: string | null,
    replaceMatchOverrides: boolean,
  ): Promise<void> => {
    if (!result || !backgroundSearchJobId) {
      throw new Error("Le résultat de cette recherche n’est plus disponible.");
    }
    const nextResult = updateMangaCorrespondenceChapterOverrides(result, {
      matchKeys: matches.map((match) => match.key),
      value,
      scope: mode,
      preserveMatchOverrides: mode === "group" && !replaceMatchOverrides,
    });
    const resultCount = includeMangaCorrespondenceReferenceMatch(
      input,
      getEffectiveMangaCorrespondenceMatches(
        nextResult,
        input?.reference.title || job?.metadata.primaryTerm || "Manga",
      ),
    ).length;
    const saved = await window.api?.saveBackgroundSearchResult?.({
      jobId: backgroundSearchJobId,
      result: nextResult,
      resultCount,
    });
    if (!saved) throw new Error("La correction n’a pas pu être enregistrée.");
    closeModal();
    await reload();
  };
  const resetChapterOverrides = async (
    matches: MangaCorrespondenceMatch[],
    mode: "match" | "group",
  ): Promise<void> => {
    if (!result || !backgroundSearchJobId) {
      throw new Error("Le résultat de cette recherche n’est plus disponible.");
    }
    const nextResult = resetMangaCorrespondenceChapterOverrides(
      result,
      matches.map((match) => match.key),
      mode,
    );
    const saved = await window.api?.saveBackgroundSearchResult?.({
      jobId: backgroundSearchJobId,
      result: nextResult,
      resultCount: correspondenceMatches.length,
    });
    if (!saved) throw new Error("La détection automatique n’a pas pu être restaurée.");
    closeModal();
    await reload();
  };
  const openChapterEditor = (
    matches: MangaCorrespondenceMatch[],
    mode: "match" | "group",
    currentChapter: string,
  ) => {
    const entries: MangaCorrespondenceChapterEditEntry[] = matches.map((match) => {
      const resolution = chapterResolutionByMatchKey.get(match.key);
      return {
        key: match.key,
        rawTitle: match.source.result.title,
        detectedChapter: resolution?.detectedChapter ?? "Non renseigné",
        chapterOverride: match.chapterOverride,
        detection: resolution?.detection,
      };
    });
    openModal({
      title: mode === "group" ? "Corriger une catégorie" : "Corriger une carte",
      className: "manga-correspondence-chapter-edit-modal",
      content: (
        <MangaCorrespondenceChapterEditDialog
          mode={mode}
          entries={entries}
          currentChapter={currentChapter}
          onCancel={closeModal}
          onSave={(value, replaceMatchOverrides) => persistChapterOverrides(
            matches,
            mode,
            value,
            replaceMatchOverrides,
          )}
          onReset={() => resetChapterOverrides(matches, mode)}
        />
      ),
    });
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
    const resultCount = includeMangaCorrespondenceReferenceMatch(
      input,
      getEffectiveMangaCorrespondenceMatches(
        nextResult,
        input?.reference.title || job?.metadata.primaryTerm || "Manga",
      ),
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
  const saveDiscoveries = async (
    discoveries: MangaCorrespondenceDiscovery[],
    resultDecisions: MangaCorrespondenceResultDecision[],
    replay: boolean,
  ): Promise<void> => {
    if (!backgroundSearchJobId || !input || !result) {
      throw new Error("Le résultat de cette recherche n’est plus disponible.");
    }
    const nextResult: MangaCorrespondenceBackgroundResult = {
      ...result,
      discoveries,
      resultDecisions,
    };
    const invalidatedKeys = new Set(resultDecisions
      .filter((decision) => decision.status === "invalidated")
      .map((decision) => decision.key));
    const saved = await window.api?.saveBackgroundSearchResult?.({
      jobId: backgroundSearchJobId,
      result: nextResult,
      resultCount: correspondenceMatches.filter((match) => !invalidatedKeys.has(match.key)).length,
    });
    if (!saved) throw new Error("Les découvertes n’ont pas pu être enregistrées.");
    if (replay) {
      const replayed = await window.api?.replayBackgroundSearch?.({
        jobId: backgroundSearchJobId,
        input: {
          ...buildMangaCorrespondenceReplayInput(input, nextResult),
          safety: buildMangaCorrespondenceSafetySettings(params),
        },
      });
      if (!replayed) throw new Error("Le rejeu de la recherche n’a pas pu être lancé.");
    }
    closeModal();
    await reload();
  };
  const openDiscoveries = () => {
    openModal({
      title: "Résultats, titres et auteurs",
      className: "manga-correspondence-discoveries-modal",
      content: (
        <MangaCorrespondenceDiscoveriesDialog
          discoveries={editableDiscoveries}
          resultDecisions={editableResultDecisions}
          disabled={active}
          onCancel={closeModal}
          onOpenAuthorPage={async (discovery) => {
            if (!discovery.authorPageUrl) return;
            const opened = await openWorkspaceTarget({
              kind: "scraper.author",
              scraperId: discovery.scraperId,
              query: discovery.authorPageUrl,
              title: discovery.value,
              templateContext: discovery.authorTemplateContext,
            });
            if (!opened) throw new Error("La page auteur n’a pas pu être ouverte dans un nouvel onglet.");
          }}
          onResolveManualDiscovery={async (kind, value) => {
            if (!input) throw new Error("Les paramètres de cette recherche ne sont plus disponibles.");
            return resolveMangaCorrespondenceManualDiscovery({
              kind,
              rawValue: value,
              input,
              fetchDocument: window.api?.fetchScraperDocument,
            });
          }}
          onSave={saveDiscoveries}
        />
      ),
    });
  };
  const openAuthorExpansionDialog = () => {
    if (!backgroundSearchJobId || !input || !result) return;
    const discoveredAuthors = collectMangaCorrespondenceAuthors(result, {
      referenceNames: input.reference.authors,
    });
    const initialNames = discoveredAuthors.names.length
      ? discoveredAuthors.names
      : input.reference.authors;
    openModal({
      title: "Approfondir les auteurs de la correspondance",
      className: "manga-correspondence-modal-shell",
      content: (
        <AuthorCorrespondenceDialog
          initialName={initialNames[0] ?? ""}
          initialNames={initialNames}
          referenceSources={discoveredAuthors.referenceSources}
          mangaSeed={{
            reference: input.reference,
            enableRomajiPhoneticMerge: input.enableRomajiPhoneticMerge,
          }}
          linkedMangaJobId={backgroundSearchJobId}
          initialAdvancedSearchEnabled
          onCancel={closeModal}
          onQueued={() => {
            closeModal();
            void linkedAuthorSearches.reload();
          }}
        />
      ),
    });
  };
  const openExistingAuthorSearchDialog = () => {
    if (!backgroundSearchJobId || !input || !result || !job) return;
    openModal({
      title: "Lier une recherche auteur existante",
      className: "manga-correspondence-modal-shell existing-author-search-modal",
      content: (
        <ExistingAuthorSearchDialog
          mangaJob={job as BackgroundSearchJob<
            MangaCorrespondenceBackgroundInput,
            MangaCorrespondenceBackgroundResult
          > & { result: MangaCorrespondenceBackgroundResult }}
          onCancel={closeModal}
          onImported={async () => {
            closeModal();
            await Promise.all([reload(), linkedAuthorSearches.reload()]);
          }}
        />
      ),
    });
  };
  const openLinkedAuthorSearch = async (jobId: string) => {
    const linkedJob = await window.api?.getBackgroundSearchJob?.(jobId) as BackgroundSearchJob | null;
    if (!linkedJob) {
      setRejectedActionError("La recherche auteur liée n’est plus disponible.");
      return;
    }
    requestBackgroundSearchOpenInCurrentView(linkedJob);
  };
  const importLinkedAuthorSearch = async (jobId: string) => {
    setLinkedAuthorActionJobId(jobId);
    setRejectedActionError(null);
    try {
      const outcome = await importLinkedAuthorSearchIntoManga({
        authorJobId: jobId,
        mangaJobId: backgroundSearchJobId,
        automatic: false,
      });
      if (outcome === "deferred") {
        throw new Error("Attends la fin de la passe manga actuelle avant d’importer le corpus auteur.");
      }
      await Promise.all([reload(), linkedAuthorSearches.reload()]);
    } catch (importError) {
      setRejectedActionError(importError instanceof Error
        ? importError.message
        : "Le corpus auteur n’a pas pu être importé.");
    } finally {
      setLinkedAuthorActionJobId(null);
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
  const renderResultCard = (item: MultiSearchMergedResult) => (
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
  );
  const renderCards = (
    items: MultiSearchMergedResult[],
    withSourceInvalidation = false,
  ) => (
    <div className="manga-correspondence-view__results">
      {items.map((item) => {
        const source = withSourceInvalidation && item.sources.length === 1
          ? item.sources[0]
          : undefined;
        const sourceKey = source ? buildMultiSearchSourceIdentityKey(source) : undefined;
        const isSourceExcluded = sourceKey ? excludedSourceKeys.has(sourceKey) : false;
        const editableMatch = sourceKey ? correspondenceMatchBySourceKey.get(sourceKey) : undefined;
        const editableChapter = editableMatch
          ? chapterResolutionByMatchKey.get(editableMatch.key)?.effectiveChapter
          : undefined;
        return (
          <div
            key={item.id}
            className={[
              "manga-correspondence-view__result",
              isSourceExcluded ? "is-source-excluded" : "",
            ].join(" ").trim()}
          >
            {source && sourceKey ? (
              <div className="manga-correspondence-view__list-preparation is-source">
                <span>
                  {isSourceExcluded
                    ? `${source.scraper.name} · source retirée des résultats`
                    : `${source.scraper.name} · source conservée`}
                  {editableMatch?.chapterOverride ? " · numéro corrigé" : ""}
                </span>
                <div className="manga-correspondence-view__list-preparation-actions">
                  {editableMatch && editableChapter ? (
                    <button
                      type="button"
                      className="is-correction"
                      disabled={job?.metadata.status !== "completed"}
                      onClick={() => openChapterEditor([editableMatch], "match", editableChapter)}
                    >
                      Corriger
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={isSourceExcluded ? "is-excluded" : ""}
                    aria-pressed={isSourceExcluded}
                    disabled={job?.metadata.status === "queued" || job?.metadata.status === "running"}
                    onClick={() => void toggleSourceExclusion(sourceKey)}
                  >
                    {isSourceExcluded ? "Réactiver" : "Invalider"}
                  </button>
                </div>
              </div>
            ) : null}
            {renderResultCard(item)}
          </div>
        );
      })}
    </div>
  );
  const renderMergedChapterCards = (items: MultiSearchMergedResult[]) => (
    <MergedChapterCardGrid
      entries={items.flatMap((result) => {
        const chapter = chapterByResultId.get(result.id);
        return chapter ? [{ chapter, result }] : [];
      })}
      isExcluded={({ chapter }) => (
        chapter !== "Non renseigné" && excludedReadingListChapters.has(chapter)
      )}
      renderActions={({ chapter, result }) => {
        const categoryMatches = Array.from(new Map(result.sources.flatMap((source) => {
          const match = correspondenceMatchBySourceKey.get(buildMultiSearchSourceIdentityKey(source));
          return match ? [[match.key, match] as const] : [];
        })).values());
        const isReadingListChapter = chapter !== "Non renseigné";
        const isExcluded = isReadingListChapter && excludedReadingListChapters.has(chapter);
        return (
          <>
            <button
              type="button"
              className="is-correction"
              disabled={job?.metadata.status !== "completed" || !categoryMatches.length}
              onClick={() => openChapterEditor(categoryMatches, "group", chapter)}
            >
              Corriger
            </button>
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
          </>
        );
      }}
      renderCard={({ result }) => renderResultCard(result)}
    />
  );
  const renderGroupedChapterCards = (groups: ChapterCardGroup[]) => (
    <ChapterGroupList
      groups={groups.map(({ chapter, cards }) => ({ chapter, value: cards }))}
      getSubtitle={({ chapter, value: cards }) => {
        const excludedCardCount = cards.filter((card) => (
          card.sources.length === 1
          && excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(card.sources[0]))
        )).length;
        const activeCardCount = cards.length - excludedCardCount;
        return (
          <>
            {activeCardCount} source(s)
            {excludedCardCount ? ` · ${excludedCardCount} retirée(s)` : ""}
          </>
        );
      }}
      isMuted={({ chapter }) => (
        chapter !== "Non renseigné" && excludedReadingListChapters.has(chapter)
      )}
      renderActions={({ chapter, value: cards }) => {
        const isReadingListChapter = chapter !== "Non renseigné";
        const isExcluded = isReadingListChapter && excludedReadingListChapters.has(chapter);
        const groupMatches = Array.from(new Map(cards.flatMap((card) => (
          card.sources.flatMap((source) => {
            const match = correspondenceMatchBySourceKey.get(buildMultiSearchSourceIdentityKey(source));
            return match ? [[match.key, match] as const] : [];
          })
        ))).values());
        return (
          <>
            <button
              type="button"
              className="is-correction"
              disabled={job?.metadata.status !== "completed" || !groupMatches.length}
              onClick={() => openChapterEditor(groupMatches, "group", chapter)}
            >
              Corriger la catégorie
            </button>
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
          </>
        );
      }}
      renderContent={({ value: cards }) => {
        const displayedGroupCards = showExcludedSources
          ? cards
          : cards.filter((card) => (
            card.sources.length !== 1
            || !excludedSourceKeys.has(buildMultiSearchSourceIdentityKey(card.sources[0]))
          ));
        return displayedGroupCards.length ? renderCards(displayedGroupCards, true) : (
          <p className="manga-correspondence-view__chapter-group-empty">
            Toutes les sources de ce chapitre ont été retirées.
          </p>
        );
      }}
    />
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
            {` · Passe ${result?.passNumber ?? 1} · ${job.metadata.prefilled
              ? "Vue préremplie"
              : active
                ? "Recherche en cours"
              : job.metadata.status === "cancelled"
                ? "Recherche arrêtée"
                : "Recherche terminée"}`}
          </p>
        </div>
        {active ? <button type="button" className="manga-correspondence-view__stop" onClick={() => void cancel()}>Arrêter</button> : null}
      </header> : null}
      {result?.warnings?.length ? (
        <div className="manga-correspondence-view__warnings" role="alert">
          <strong>Protections de la recherche</strong>
          <ul>
            {result.warnings.slice(-8).map((warning) => <li key={warning.key}>{warning.message}</li>)}
          </ul>
          {result.warnings.length > 8 ? <small>{result.warnings.length - 8} autre(s) alerte(s) dans cette recherche.</small> : null}
        </div>
      ) : null}
      <section className="manga-correspondence-view__linked-authors">
        <header>
          <div>
            <strong>Approfondissement des auteurs</strong>
            <span>
              {linkedAuthorSearches.jobs.length
                ? `${linkedAuthorSearches.jobs.length} recherche(s) liée(s)`
                : "Aucune recherche auteur liée"}
            </span>
          </div>
          <div className="manga-correspondence-view__linked-author-header-actions">
            <button type="button" disabled={active} onClick={openExistingAuthorSearchDialog}>
              Lier une recherche existante
            </button>
            <button type="button" disabled={active} onClick={openAuthorExpansionDialog}>
              {linkedAuthorSearches.jobs.length ? "Nouvelle recherche auteur" : "Approfondir les auteurs"}
            </button>
          </div>
        </header>
        {linkedAuthorSearches.error ? (
          <small className="is-error">{linkedAuthorSearches.error}</small>
        ) : null}
        {!linkedAuthorSearches.jobs.length ? (
          <small>
            À la fin de la recherche manga, le meilleur corpus portant exactement sur le même auteur
            est lié automatiquement. Le sélecteur manuel reste disponible si aucun corpus sûr n’est trouvé.
          </small>
        ) : null}
        {linkedAuthorSearches.jobs.map((linkedJob) => {
          const importedLink = input?.linkedAuthorImports?.find((entry) => (
            entry.authorJobId === linkedJob.id
          ));
          const localRelation = linkedJob.relation?.parentJobId === backgroundSearchJobId
            ? linkedJob.relation
            : undefined;
          const relationStatus = localRelation?.automationStatus
            ?? (importedLink ? "completed" : "waiting");
          const running = linkedJob.status === "queued" || linkedJob.status === "running";
          const canImport = !active
            && linkedJob.resultAvailable
            && !running
            && relationStatus !== "pending"
            && relationStatus !== "processing";
          const statusLabel = running
            ? linkedJob.status === "queued" ? "En attente" : "En cours"
            : LINKED_AUTHOR_STATUS_LABELS[relationStatus] ?? linkedJob.status;
          return (
            <article key={linkedJob.id} className={`is-${relationStatus}`}>
              <div>
                <strong>{linkedJob.primaryTerm}</strong>
                <span>{statusLabel} · {linkedJob.progress.resultCount} page(s) auteur</span>
                {localRelation?.automationError ? (
                  <small>{localRelation.automationError}</small>
                ) : null}
                {importedLink ? (
                  <small>
                    Corpus réutilisé
                    {importedLink.autoRefreshOnCompletion ? " · actualisation automatique" : ""}
                  </small>
                ) : null}
                {relationStatus === "blocked" ? (
                  <small>
                    Une protection anti-emballement s’est déclenchée. Le corpus reste importable manuellement.
                  </small>
                ) : null}
              </div>
              <div className="manga-correspondence-view__linked-author-actions">
                <button type="button" onClick={() => void openLinkedAuthorSearch(linkedJob.id)}>
                  Voir
                </button>
                {canImport ? (
                  <button
                    type="button"
                    disabled={linkedAuthorActionJobId === linkedJob.id}
                    onClick={() => void importLinkedAuthorSearch(linkedJob.id)}
                  >
                    {linkedAuthorActionJobId === linkedJob.id
                      ? "Import…"
                      : relationStatus === "blocked"
                        ? "Importer et relancer malgré l’alerte"
                        : relationStatus === "completed"
                          ? "Réimporter et relancer"
                        : "Importer et relancer"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
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
          <button type="button" onClick={openDiscoveries}>
            {job.metadata.prefilled ? "Lancer la recherche" : "Réviser et rejouer"}
            {` · ${eligibleMatches.length} résultat(s) · ${rejectedCounts.all} potentiel(s) · ${editableDiscoveries.length} piste(s)`}
          </button>
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
              disabled={active}
              onClick={() => void persistResultStatuses(new Map(
                Array.from(excludedSourceKeys).map((key) => [key, "active" as const]),
              )).then(() => setShowExcludedSources(false)).catch((restoreError) => {
                setRejectedActionError(
                  restoreError instanceof Error ? restoreError.message : "Impossible de réactiver les sources.",
                );
              })}
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
      ) : displayedCards.length ? (
        displayMode === "mergedChapters"
          ? renderMergedChapterCards(displayedCards)
          : renderCards(displayedCards)
      ) : (
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
            <div className="manga-correspondence-view__rejected-text-filter">
              <MultiSearchTextFilterBar
                value={rejectedTextFilter}
                baseQuery={input?.reference.title ?? ""}
                placeholder="Titre, auteur, source, motif, chapitre ou score…"
                ariaLabel="Filtrer les propositions écartées"
                onChange={setRejectedTextFilter}
                onFillFromBaseQuery={() => setRejectedTextFilter(input?.reference.title ?? "")}
                onClear={() => setRejectedTextFilter("")}
              />
              <span>
                {rejectedCardGroups.length} card(s) affichée(s)
                {rejectedTextFilter.trim()
                  ? ` sur ${categoryFilteredRejectedCandidates.length} proposition(s)`
                  : ""}
              </span>
            </div>
            {visibleRejectedCardGroups.length ? renderRejectedCards(visibleRejectedCardGroups) : (
              <div className="empty">
                {rejectedTextFilter.trim()
                  ? "Aucune proposition ne correspond à ce filtre."
                  : "Aucune proposition dans cette catégorie."}
              </div>
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
