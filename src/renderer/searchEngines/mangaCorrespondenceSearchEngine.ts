import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchProgress,
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceTraceStep,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import {
  fetchAuthorPageWithRetry,
  fetchSearchPageWithRetry,
  getAuthorConfig,
  getPaceConfig,
  getSearchConfig,
  resolveHasNextAuthorPage,
  resolveHasNextPage,
  runWithConcurrency,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import { extractMultiSearchAuthors } from "@/renderer/components/MultiSearch/multiSearchAuthors";
import { isSearchableScraper } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import { loadAdvancedJapaneseRomanizationVariants } from "@/renderer/utils/advancedJapaneseRomanization";
import { getMangaTitleMergeMatchKind } from "@/renderer/utils/mangaMatching/titleProfiles";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  doMangaCorrespondenceChaptersOverlap,
  inferMangaCorrespondenceFirstChapter,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import {
  doesScraperCardNeedMetadata,
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
  isScraperFeatureConfigured,
  SCRAPER_METADATA_REQUIREMENTS_BY_PHASE,
} from "@/renderer/utils/scraperRuntime";
import {
  enrichScraperListingSourcesWithCardDetails,
  processScraperListingPage,
} from "@/renderer/components/MultiSearch/listingSourcePageProcessing";
import { isScraperListingPaginationEndError } from "@/renderer/utils/scraperRuntime";
import type {
  BackgroundSearchExecutionResult,
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceDiscovery,
  MangaCorrespondenceEngineCheckpoint,
  MangaCorrespondenceMatch,
  MangaCorrespondenceRejectedCandidate,
  MangaCorrespondenceRejectionReason,
} from "@/renderer/backgroundSearch/types";
import {
  buildMangaCorrespondenceDiscoveryKey,
  upsertMangaCorrespondenceDiscovery,
} from "@/renderer/backgroundSearch/mangaCorrespondenceDiscoveries";
import {
  doesCorrespondenceAnalyzedTitleMatchKnownTitle,
  partitionCorrespondenceAlternativeTitles,
  selectCorrespondenceDiscoverableTitles,
} from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
import { isBackgroundListingPaginationStalled } from "@/renderer/backgroundSearch/backgroundListingBlacklist";
import { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
import { selectMangaCorrespondenceRomanizedSearchTerms } from "@/renderer/backgroundSearch/mangaCorrespondenceRomanization";
import {
  isClearlyDerivativeMangaCorrespondenceTitle,
  stripMangaCorrespondenceTrailingKnownAuthor,
} from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import {
  scoreMangaCorrespondenceRejectedCandidate,
  shouldFetchMangaCorrespondenceCandidateDetails,
} from "@/renderer/backgroundSearch/mangaCorrespondenceRejectedCandidates";
import {
  getOrCreateSearchExecutionContext,
  type SearchExecutionContext,
} from "@/renderer/searchEngines/searchExecutionContext";
import { buildScraperListingPageRequestKey } from "@/renderer/utils/scraperLatestExecutionPlanning";
import { appendScraperLatestDiagnosticEvent } from "@/renderer/utils/scraperLatestDiagnostics";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type DiscoveryTask = {
  kind: "title" | "author";
  term: string;
  parentId?: string;
  initialGeneratedVariant?: boolean;
  directOnly?: boolean;
  directTargets?: Array<{
    scraper: ScraperRecord;
    url: string;
    templateContext?: Record<string, string | undefined> | null;
  }>;
};

const MAX_DISCOVERY_TASKS = 80;
const MAX_DISCOVERED_TITLES = 18;
const MAX_DISCOVERED_AUTHORS = 18;
const MAX_STORED_REJECTED_CANDIDATES = 500;
const CORRESPONDENCE_DETAIL_REQUIREMENTS = SCRAPER_METADATA_REQUIREMENTS_BY_PHASE.correspondenceCandidate;

const normalizeKey = (value: string): string => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const uniqueText = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  return values.map((value) => value?.trim().replace(/\s+/g, " ") ?? "").filter((value) => {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildTaskKey = (task: Pick<DiscoveryTask, "kind" | "term">): string => (
  `${task.kind}:${normalizeKey(task.term)}`
);

const buildDirectTargetKey = (target: NonNullable<DiscoveryTask["directTargets"]>[number]): string => (
  `${target.scraper.id}:${target.url.trim()}`
);

const selectScrapers = (input: MangaCorrespondenceBackgroundInput): ScraperRecord[] => {
  const filter = splitIncludeFilterValues(input.scraperFilterValues);
  return input.scrapers.filter((scraper) => (
    !filter.excludedValues.includes(scraper.id)
    && (!filter.includedValues.length || filter.includedValues.includes(scraper.id))
  ));
};

const canSearchAuthors = (scraper: ScraperRecord): boolean => {
  const feature = getScraperFeature(scraper, "author");
  if (!isScraperFeatureConfigured(feature)) return false;
  try {
    return Boolean(getAuthorConfig(scraper));
  } catch {
    return false;
  }
};

const buildResult = (
  input: MangaCorrespondenceBackgroundInput,
  matches: Map<string, MangaCorrespondenceMatch>,
  rejectedCandidates: Map<string, MangaCorrespondenceRejectedCandidate>,
  rejectedCandidateCount: number,
  trace: MangaCorrespondenceTraceStep[],
  searchedTitles: string[],
  searchedAuthors: string[],
  discoveries: Map<string, MangaCorrespondenceDiscovery>,
  checkpoint?: MangaCorrespondenceEngineCheckpoint,
): MangaCorrespondenceBackgroundResult => ({
  request: input.request,
  matches: Array.from(matches.values()),
  rejectedCandidates: Array.from(rejectedCandidates.values()).sort((left, right) => (
    right.score - left.score
    || left.source.result.title.localeCompare(right.source.result.title)
  )),
  rejectedCandidateCount,
  passNumber: Math.max(1, Math.floor(input.continuation?.passNumber ?? 1)),
  trace: [...trace],
  searchedTitles: [...searchedTitles],
  searchedAuthors: [...searchedAuthors],
  discoveries: Array.from(discoveries.values()).sort((left, right) => (
    left.kind.localeCompare(right.kind)
    || left.scraperName.localeCompare(right.scraperName)
    || left.value.localeCompare(right.value)
  )),
  ...(checkpoint ? { checkpoint } : {}),
});

const sourceMatchesReference = (
  input: MangaCorrespondenceBackgroundInput,
  source: MultiSearchSourceResult,
  knownTitles: string[],
  knownAuthors: string[],
  romanizedTitleVariantsByKey: Map<string, string[]>,
): {
  analyzedTitle: string;
  alternativeTitles: string[];
  authors: string[];
  chapter?: string;
  chapterConfidence: MangaCorrespondenceRejectedCandidate["chapterConfidence"];
  hasSequenceMarker: boolean;
  derivative: boolean;
  matchedTerm?: string;
  discoverableTitles: string[];
} => {
  const config = getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis"));
  const analysis = analyzeMangaCorrespondenceTitle(
    stripMangaCorrespondenceTrailingKnownAuthor(source.result.title, knownAuthors),
    config,
  );
  const {
    titleAlternatives,
    authorAlternatives,
  } = partitionCorrespondenceAlternativeTitles(analysis.alternativeTitles, knownAuthors);
  const parsedAuthorKeys = analysis.authors.map(normalizeKey);
  const supplementalAuthors = [...(source.result.authorNames ?? []), ...source.tentativeAuthorNames]
    .filter((author) => !parsedAuthorKeys.some((parsedAuthor) => normalizeKey(author).includes(parsedAuthor)));
  const authors = uniqueText([...analysis.authors, ...supplementalAuthors, ...authorAlternatives]);
  const candidate = {
    title: [analysis.title, ...titleAlternatives].join(", "),
    sourceUrl: source.result.detailUrl,
    authorNames: authors,
    advancedRomanizedTitleVariants: source.advancedRomanizedTitleVariants,
    advancedRomanizedAuthorNameVariants: source.advancedRomanizedTentativeAuthorNameVariants,
  };
  const analyzedTitleFields = uniqueText([analysis.title, ...titleAlternatives]);
  const derivative = isClearlyDerivativeMangaCorrespondenceTitle(source.result.title);
  const match = derivative
    ? undefined
    : knownTitles.map((title) => {
      const directMatch = doesCorrespondenceAnalyzedTitleMatchKnownTitle(
        analysis.title,
        titleAlternatives,
        title,
      );
      const mergeMatchKind = getMangaTitleMergeMatchKind(
        {
          title,
          authorNames: input.reference.authors,
          advancedRomanizedTitleVariants: romanizedTitleVariantsByKey.get(normalizeKey(title)) ?? [],
        },
        candidate,
        { enableRomajiPhoneticMerge: input.enableRomajiPhoneticMerge },
      );
      return { title, directMatch, mergeMatchKind };
    }).find((entry) => entry.directMatch || entry.mergeMatchKind !== null);
  const discoverableTitles = selectCorrespondenceDiscoverableTitles(
    analyzedTitleFields,
    knownTitles,
    match?.directMatch === true,
    Boolean(match && match.mergeMatchKind !== null),
  );
  const inferredFirstChapter = analysis.chapter
    ? undefined
    : inferMangaCorrespondenceFirstChapter(analysis, knownTitles);
  const chapter = analysis.chapter ?? inferredFirstChapter;
  return {
    analyzedTitle: analysis.title,
    alternativeTitles: titleAlternatives,
    authors,
    chapter,
    chapterConfidence: analysis.chapter
      ? analysis.chapterDetection?.confidence ?? "medium"
      : "low",
    hasSequenceMarker: analysis.sequenceMarkers.length > 0,
    derivative,
    matchedTerm: match?.title,
    discoverableTitles,
  };
};

const resolveSourceRejectionReason = (
  request: MangaCorrespondenceBackgroundInput["request"],
  referenceChapter: string | undefined,
  analyzed: ReturnType<typeof sourceMatchesReference>,
): MangaCorrespondenceRejectionReason | undefined => {
  if (!analyzed.matchedTerm) {
    return analyzed.derivative ? "derivative" : "titleMismatch";
  }
  if (
    request === "sameManga"
    && referenceChapter
    && analyzed.chapter
    && !doMangaCorrespondenceChaptersOverlap(referenceChapter, analyzed.chapter)
  ) {
    return "chapterMismatch";
  }
  return undefined;
};

export const runMangaCorrespondenceSearch = async (
  input: MangaCorrespondenceBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
  previousResult?: MangaCorrespondenceBackgroundResult,
  executionContextInput?: SearchExecutionContext,
): Promise<MangaCorrespondenceBackgroundResult> => {
  const scrapers = selectScrapers(input);
  if (!scrapers.length) throw new Error("Aucun scrapper compatible n'est sélectionné.");

  const concurrency = Math.max(1, Math.floor(input.scrapingConcurrency));
  const pace = { ...getPaceConfig(input.paceMode), concurrency };
  const executionContext = getOrCreateSearchExecutionContext(executionContextInput, {
    kind: "mangaCorrespondence",
  });
  const detailsCache = executionContext.detailsCache;
  const recordDiagnostic = (event: string, data?: Record<string, unknown>, sourceKey?: string): void => {
    appendScraperLatestDiagnosticEvent(
      executionContext.diagnostics ? { profileId: executionContext.diagnostics.profileId } : null,
      event,
      data,
      sourceKey,
    );
  };
  const searchPagePrefetch = executionContext.getPagePrefetchCache<import("@/renderer/utils/scraperRuntime").ScraperRuntimeSearchPageResult>(
    "manga-correspondence-search",
  );
  const authorPagePrefetch = executionContext.getPagePrefetchCache<import("@/renderer/utils/scraperRuntime").ScraperRuntimeSearchPageResult>(
    "manga-correspondence-author",
  );
  const maxPages = input.maxPages === null ? 250 : Math.max(1, input.maxPages);
  const referenceScraper = scrapers.find((scraper) => scraper.id === input.reference.scraperId) ?? scrapers[0];
  const referenceAnalysis = analyzeMangaCorrespondenceTitle(
    input.reference.rawTitle,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(referenceScraper, "titleAnalysis")),
  );
  const checkpointInput = {
    reference: input.reference,
    request: input.request,
    strategy: input.strategy,
    scraperFilterValues: input.scraperFilterValues,
    scrapers: input.scrapers.map((scraper) => ({ id: scraper.id, updatedAt: scraper.updatedAt })),
    maxPages: input.maxPages,
    paceMode: input.paceMode,
    scrapingConcurrency: input.scrapingConcurrency,
    scrapeDetailsWithCards: input.scrapeDetailsWithCards,
    enableRomajiPhoneticMerge: input.enableRomajiPhoneticMerge,
  };
  const inputFingerprint = executionContext.checkpointAdapter.fingerprint(checkpointInput);
  const isContinuation = Boolean(input.continuation && previousResult);
  const isReplay = Boolean(input.replay && previousResult);
  const isResume = Boolean(
    !isContinuation
    && !isReplay
    && previousResult?.checkpoint?.version === 1
    && executionContext.checkpointAdapter.isCompatible(
      previousResult.checkpoint.inputFingerprint,
      checkpointInput,
    ),
  );
  const previousRejectedCandidates = previousResult?.rejectedCandidates ?? [];
  const acceptedPreviousCandidates = previousRejectedCandidates.filter((candidate) => (
    candidate.decision === "accepted"
  ));
  const requestedSeedCandidateKeys = input.continuation?.seedCandidateKeys;
  const requestedSeedKeys = new Set(requestedSeedCandidateKeys ?? []);
  const acceptedSearchSeeds = acceptedPreviousCandidates.filter((candidate) => (
    candidate.useAsSearchSeed
    && (requestedSeedCandidateKeys === undefined || requestedSeedKeys.has(candidate.key))
  ));
  const discoveryDecisions = new Map(
    (input.replay?.discoveryDecisions ?? previousResult?.discoveries ?? []).map((entry) => [
      entry.key,
      entry.status,
    ]),
  );
  const discoveries = new Map<string, MangaCorrespondenceDiscovery>();
  if (isContinuation || isReplay || isResume) {
    (previousResult?.discoveries ?? []).forEach((discovery) => {
      discoveries.set(discovery.key, {
        ...discovery,
        status: discoveryDecisions.get(discovery.key) ?? discovery.status,
      });
    });
  }
  const addDiscovery = (discovery: Parameters<typeof upsertMangaCorrespondenceDiscovery>[1]) => (
    upsertMangaCorrespondenceDiscovery(discoveries, discovery, discoveryDecisions)
  );
  uniqueText([input.reference.title, ...input.reference.alternativeTitles]).forEach((title) => {
    addDiscovery({
      kind: "title",
      value: title,
      scraperId: referenceScraper.id,
      scraperName: referenceScraper.name,
      origin: "reference",
      sourceUrl: input.reference.sourceUrl,
      parentStepIds: [],
    });
  });
  input.reference.authors.forEach((author) => {
    addDiscovery({
      kind: "author",
      value: author,
      scraperId: referenceScraper.id,
      scraperName: referenceScraper.name,
      origin: "reference",
      sourceUrl: input.reference.sourceUrl,
      parentStepIds: [],
    });
  });
  acceptedSearchSeeds.forEach((candidate) => {
    candidate.alternativeTitles.concat(candidate.analyzedTitle).forEach((title) => {
      addDiscovery({
        kind: "title",
        value: title,
        scraperId: candidate.source.scraper.id,
        scraperName: candidate.source.scraper.name,
        origin: candidate.source.result.detailsMetadataFetched ? "details" : "card",
        sourceUrl: candidate.source.result.detailUrl,
        parentStepIds: candidate.discoveredByStepIds,
      });
    });
    candidate.authors.forEach((author) => {
      addDiscovery({
        kind: "author",
        value: author,
        scraperId: candidate.source.scraper.id,
        scraperName: candidate.source.scraper.name,
        origin: candidate.source.result.detailsMetadataFetched ? "details" : "card",
        sourceUrl: candidate.source.result.detailUrl,
        parentStepIds: candidate.discoveredByStepIds,
      });
    });
  });
  const knownTitles = uniqueText(Array.from(discoveries.values())
    .filter((discovery) => discovery.kind === "title" && discovery.status === "active")
    .map((discovery) => discovery.value));
  if (!knownTitles.length) {
    throw new Error("Au moins un titre actif est requis pour rejouer la correspondance.");
  }
  const referenceChapter = input.reference.chapter
    || referenceAnalysis.chapter
    || inferMangaCorrespondenceFirstChapter(referenceAnalysis, knownTitles);
  const trace: MangaCorrespondenceTraceStep[] = isContinuation || isResume
    ? [...(previousResult?.trace ?? [])]
    : [];
  const matches = new Map<string, MangaCorrespondenceMatch>(
    (isContinuation || isResume ? previousResult?.matches ?? [] : []).map((match) => [match.key, match]),
  );
  const previousMatchesByKey = new Map((previousResult?.matches ?? []).map((match) => [match.key, match]));
  if (!isReplay) acceptedPreviousCandidates.forEach((candidate) => {
    if (matches.has(candidate.key)) return;
    matches.set(candidate.key, {
      key: candidate.key,
      source: candidate.source,
      analyzedTitle: candidate.analyzedTitle,
      alternativeTitles: candidate.alternativeTitles,
      authors: candidate.authors,
      chapter: candidate.acceptedChapter || candidate.suggestedChapter,
      chapterOverride: candidate.chapterOverride,
      matchedTerm: candidate.matchedTerm || input.reference.title,
      discoveredByStepIds: [...candidate.discoveredByStepIds],
      acceptedManually: true,
    });
  });
  const currentPassNumber = Math.max(1, Math.floor(input.continuation?.passNumber ?? 1));
  const acceptedSearchSeedKeys = new Set(acceptedSearchSeeds.map((candidate) => candidate.key));
  const previousCandidateReviews = new Map(previousRejectedCandidates.map((candidate) => [candidate.key, candidate]));
  const rejectedCandidates = new Map<string, MangaCorrespondenceRejectedCandidate>(
    (isReplay ? [] : previousRejectedCandidates).map((candidate) => [candidate.key, {
      ...candidate,
      searchSeedUsedInPass: acceptedSearchSeedKeys.has(candidate.key)
        ? currentPassNumber
        : candidate.searchSeedUsedInPass,
    }]),
  );
  const rejectedKeysSeen = new Set((isReplay ? [] : previousRejectedCandidates).map((candidate) => candidate.key));
  let rejectedCandidateCount = Math.max(
    isReplay ? 0 : previousResult?.rejectedCandidateCount ?? 0,
    rejectedKeysSeen.size,
  );
  const knownAuthors = uniqueText(Array.from(discoveries.values())
    .filter((discovery) => discovery.kind === "author" && discovery.status === "active")
    .map((discovery) => discovery.value));
  const romanizedTitleVariantsByKey = new Map<string, string[]>();
  const searchedTitles: string[] = isContinuation || isResume ? [...(previousResult?.searchedTitles ?? [])] : [];
  const searchedAuthors: string[] = isContinuation || isResume ? [...(previousResult?.searchedAuthors ?? [])] : [];
  const processedTaskKeys = new Set<string>(isResume && previousResult?.checkpoint
    ? previousResult.checkpoint.processedTaskKeys
    : [
      ...searchedTitles.map((term) => `title:${normalizeKey(term)}`),
      ...searchedAuthors.map((term) => `author:${normalizeKey(term)}`),
    ]);
  const processedDirectTargetKeys = new Set<string>(isResume
    ? previousResult?.checkpoint?.processedDirectTargetKeys ?? []
    : []);
  const queuedTasksByKey = new Map<string, DiscoveryTask>();
  const extractedAuthorSourceKeys = new Set<string>();
  const resolvedAuthorPageKeys = new Set<string>();
  const attemptedDetailSourceKeys = new Set<string>();
  const queue: DiscoveryTask[] = [];
  let activeTask: DiscoveryTask | null = null;
  let processedTasks = 0;
  let balancedKind: DiscoveryTask["kind"] = "title";

  const addTask = (task: DiscoveryTask): void => {
    const key = buildTaskKey(task);
    if (!normalizeKey(task.term) || queue.length + processedTasks >= MAX_DISCOVERY_TASKS) return;
    const existing = queuedTasksByKey.get(key);
    if (existing) {
      const targets = new Map((existing.directTargets ?? []).map((target) => [buildDirectTargetKey(target), target]));
      (task.directTargets ?? []).forEach((target) => targets.set(buildDirectTargetKey(target), target));
      existing.directTargets = Array.from(targets.values());
      existing.parentId ??= task.parentId;
      recordDiagnostic("task.merged", { kind: task.kind, term: task.term, directTargetCount: targets.size });
      return;
    }
    if (processedTaskKeys.has(key)) {
      const newTargets = (task.directTargets ?? []).filter((target) => (
        !processedDirectTargetKeys.has(buildDirectTargetKey(target))
      ));
      if (!newTargets.length) return;
      const deltaTask = { ...task, directTargets: newTargets, directOnly: true };
      const deltaKey = `${key}:direct`;
      const existingDelta = queuedTasksByKey.get(deltaKey);
      if (existingDelta) {
        const targets = new Map((existingDelta.directTargets ?? []).map((target) => [buildDirectTargetKey(target), target]));
        newTargets.forEach((target) => targets.set(buildDirectTargetKey(target), target));
        existingDelta.directTargets = Array.from(targets.values());
        return;
      }
      queuedTasksByKey.set(deltaKey, deltaTask);
      queue.push(deltaTask);
      recordDiagnostic("task.delta-queued", { kind: task.kind, term: task.term, directTargetCount: newTargets.length });
      return;
    }
    queuedTasksByKey.set(key, task);
    queue.push(task);
  };

  const addTrace = (
    kind: MangaCorrespondenceTraceStep["kind"],
    label: string,
    term: string,
    parentId?: string,
  ): MangaCorrespondenceTraceStep => {
    const step = { id: crypto.randomUUID(), parentId, kind, label, term, createdAt: new Date().toISOString() };
    trace.push(step);
    return step;
  };
  const continuationStep = isContinuation ? addTrace(
    "passStarted",
    `Passe ${Math.max(2, Math.floor(input.continuation?.passNumber ?? 2))} lancée`,
    `${acceptedSearchSeeds.length} proposition(s) utilisée(s) comme nouvelles pistes`,
  ) : undefined;
  if (continuationStep) {
    acceptedPreviousCandidates.forEach((candidate) => {
      addTrace(
        "manualAcceptance",
        "Proposition acceptée manuellement",
        candidate.source.result.title,
        continuationStep.id,
      );
    });
  }
  const initialRomanizedVariants = await loadAdvancedJapaneseRomanizationVariants(
    knownTitles,
    { includeKanaOnly: true },
  );
  knownTitles.forEach((title) => {
    const variants = initialRomanizedVariants.get(title) ?? [];
    if (variants.length) {
      romanizedTitleVariantsByKey.set(normalizeKey(title), variants);
    }
  });

  const initialTitleTasks = isResume
    ? []
    : isContinuation
    ? uniqueText(acceptedSearchSeeds.flatMap((candidate) => [
      candidate.analyzedTitle,
      ...candidate.alternativeTitles,
    ]))
    : [...knownTitles];
  initialTitleTasks.forEach((term) => addTask({
    kind: "title",
    term,
    parentId: continuationStep?.id,
  }));
  (isResume ? [] : isContinuation ? initialTitleTasks : knownTitles).forEach((title) => {
    selectMangaCorrespondenceRomanizedSearchTerms(
      romanizedTitleVariantsByKey.get(normalizeKey(title)) ?? [],
    ).forEach((term) => {
      const romanizedStep = addTrace(
        "titleDiscovered",
        "Variante rōmaji générée",
        term,
      );
      addTask({
        kind: "title",
        term,
        parentId: romanizedStep.id,
        initialGeneratedVariant: true,
      });
    });
  });
  const initialAuthorTasks = isResume
    ? []
    : isContinuation
    ? uniqueText(acceptedSearchSeeds.flatMap((candidate) => candidate.authors))
    : [...knownAuthors];
  initialAuthorTasks.forEach((term) => addTask({
    kind: "author",
    term,
    parentId: continuationStep?.id,
  }));
  if (isContinuation) acceptedSearchSeeds.forEach((candidate) => {
    const scraper = scrapers.find((entry) => entry.id === candidate.source.scraper.id);
    if (!scraper) return;
    uniqueText([
      candidate.source.result.authorUrl,
      ...(candidate.source.result.authorUrls ?? []),
    ]).forEach((url) => addTask({
      kind: "author",
      term: candidate.authors[0] || url,
      parentId: continuationStep?.id,
      directTargets: [{ scraper, url }],
    }));
  });
  if (!isContinuation && !isResume && knownAuthors.length) input.reference.authorUrls.forEach((url) => {
    const scraper = scrapers.find((entry) => entry.id === input.reference.scraperId);
    if (scraper) addTask({ kind: "author", term: knownAuthors[0] || url, directTargets: [{ scraper, url }] });
  });

  if (isResume) {
    recordDiagnostic("checkpoint.resumed", {
      pendingTaskCount: previousResult?.checkpoint?.pendingTasks.length ?? 0,
      processedTaskCount: previousResult?.checkpoint?.processedTaskKeys.length ?? 0,
    });
    (previousResult?.checkpoint?.pendingTasks ?? []).forEach((pendingTask) => {
      const directTargets = (pendingTask.directTargets ?? []).flatMap((target) => {
        const scraper = scrapers.find((entry) => entry.id === target.scraperId);
        return scraper ? [{
          scraper,
          url: target.url,
          templateContext: target.templateContext,
        }] : [];
      });
      addTask({
        kind: pendingTask.kind,
        term: pendingTask.term,
        parentId: pendingTask.parentId,
        initialGeneratedVariant: pendingTask.initialGeneratedVariant,
        directOnly: pendingTask.directOnly,
        directTargets,
      });
    });
  }

  const buildCheckpoint = (): MangaCorrespondenceEngineCheckpoint => ({
    version: 1,
    inputFingerprint,
    pendingTasks: [
      ...(activeTask ? [activeTask] : []),
      ...queue,
    ].map((task) => ({
      kind: task.kind,
      term: task.term,
      parentId: task.parentId,
      initialGeneratedVariant: task.initialGeneratedVariant,
      directOnly: task.directOnly,
      directTargets: task.directTargets?.map((target) => ({
        scraperId: target.scraper.id,
        url: target.url,
        templateContext: target.templateContext,
      })),
    })),
    processedTaskKeys: Array.from(processedTaskKeys),
    processedDirectTargetKeys: Array.from(processedDirectTargetKeys),
  });

  const emit = async (label?: string): Promise<void> => onSnapshot(
    buildResult(
      input,
      matches,
      rejectedCandidates,
      rejectedCandidateCount,
      trace,
      searchedTitles,
      searchedAuthors,
      discoveries,
      buildCheckpoint(),
    ),
    {
      completedUnits: processedTasks,
      totalUnits: processedTasks + queue.length + (activeTask ? 1 : 0),
      resultCount: matches.size,
      currentLabel: label,
    },
  );
  const storeRejectedCandidate = (
    source: MultiSearchSourceResult,
    analyzed: ReturnType<typeof sourceMatchesReference>,
    rejectionReason: MangaCorrespondenceRejectionReason,
    step: MangaCorrespondenceTraceStep,
  ): void => {
    const key = buildMultiSearchSourceIdentityKey(source);
    const existing = rejectedCandidates.get(key) ?? previousCandidateReviews.get(key);
    const scored = scoreMangaCorrespondenceRejectedCandidate({
      titleFields: [analyzed.analyzedTitle, ...analyzed.alternativeTitles],
      candidateAuthors: analyzed.authors,
      knownTitles,
      knownAuthors,
      rejectionReason,
      matchedTerm: analyzed.matchedTerm,
    });
    const suggestedChapter = analyzed.chapter
      || (!analyzed.hasSequenceMarker && scored.score >= 60 ? "1" : undefined);
    rejectedCandidates.set(key, {
      key,
      source,
      analyzedTitle: analyzed.analyzedTitle,
      alternativeTitles: analyzed.alternativeTitles,
      authors: analyzed.authors,
      suggestedChapter,
      chapterConfidence: analyzed.chapter ? analyzed.chapterConfidence : "low",
      matchedTerm: analyzed.matchedTerm || scored.bestKnownTitle,
      rejectionReason,
      score: scored.score,
      scoreReasons: scored.reasons,
      discoveredByStepIds: uniqueText([...(existing?.discoveredByStepIds ?? []), step.id]),
      decision: existing?.decision ?? "pending",
      acceptedChapter: existing?.acceptedChapter,
      chapterOverride: existing?.chapterOverride,
      useAsSearchSeed: existing?.useAsSearchSeed ?? true,
    });
    if (!rejectedKeysSeen.has(key)) {
      rejectedKeysSeen.add(key);
      rejectedCandidateCount += 1;
    }
  };
  const pruneRejectedCandidates = (): void => {
    if (rejectedCandidates.size <= MAX_STORED_REJECTED_CANDIDATES) return;
    const reviewed = Array.from(rejectedCandidates.values()).filter((candidate) => (
      candidate.decision !== "pending"
    ));
    const availablePendingSlots = Math.max(0, MAX_STORED_REJECTED_CANDIDATES - reviewed.length);
    const pending = Array.from(rejectedCandidates.values())
      .filter((candidate) => candidate.decision === "pending")
      .sort((left, right) => right.score - left.score)
      .slice(0, availablePendingSlots);
    rejectedCandidates.clear();
    [...reviewed, ...pending].forEach((candidate) => rejectedCandidates.set(candidate.key, candidate));
  };
  const refreshRejectedCandidateScores = (): void => {
    rejectedCandidates.forEach((candidate, key) => {
      const scored = scoreMangaCorrespondenceRejectedCandidate({
        titleFields: [candidate.analyzedTitle, ...candidate.alternativeTitles],
        candidateAuthors: candidate.authors,
        knownTitles,
        knownAuthors,
        rejectionReason: candidate.rejectionReason,
        matchedTerm: candidate.rejectionReason === "chapterMismatch"
          ? candidate.matchedTerm
          : undefined,
      });
      rejectedCandidates.set(key, {
        ...candidate,
        matchedTerm: candidate.matchedTerm || scored.bestKnownTitle,
        score: scored.score,
        scoreReasons: scored.reasons,
      });
    });
    pruneRejectedCandidates();
  };
  const shouldEnrichSourceWithDetails = (
    source: MultiSearchSourceResult,
    analyzed: ReturnType<typeof sourceMatchesReference>,
  ): boolean => {
    if (input.scrapeDetailsWithCards !== true || source.result.detailsMetadataFetched === true) {
      return false;
    }
    if (!doesScraperCardNeedMetadata(source.result, CORRESPONDENCE_DETAIL_REQUIREMENTS)) {
      recordDiagnostic("details.skipped-present", undefined, source.scraper.id);
      return false;
    }
    const rejectionReason = resolveSourceRejectionReason(
      input.request,
      referenceChapter,
      analyzed,
    );
    return shouldFetchMangaCorrespondenceCandidateDetails({
      titleFields: [analyzed.analyzedTitle, ...analyzed.alternativeTitles],
      candidateAuthors: analyzed.authors,
      knownTitles,
      knownAuthors,
      rejectionReason: rejectionReason ?? "titleMismatch",
      matchedTerm: analyzed.matchedTerm,
    });
  };
  const enrichCandidateSource = async (
    source: MultiSearchSourceResult,
  ): Promise<MultiSearchSourceResult> => {
    recordDiagnostic("details.requested", undefined, source.scraper.id);
    const enriched = await enrichScraperListingSourcesWithCardDetails(
      source.scraper,
      [source],
      {
        scrapeDetailsWithCards: true,
        detailConcurrency: 1,
        detailsCache,
        fetchDocument: executionContext.fetchDocument,
      },
    );
    return enriched[0] ?? source;
  };
  const discoverFromSources = async (
    sources: MultiSearchSourceResult[],
    step: MangaCorrespondenceTraceStep,
  ): Promise<void> => {
    let accepted = 0;
    let checkedDetailCount = 0;
    const acceptedSources: MultiSearchSourceResult[] = [];
    const enrichedSources = new Map<MultiSearchSourceResult, MultiSearchSourceResult>();
    const initialDetailCandidates = sources.filter((source) => {
      const key = buildMultiSearchSourceIdentityKey(source);
      if (attemptedDetailSourceKeys.has(key)) return false;
      const analyzed = sourceMatchesReference(
        input,
        source,
        knownTitles,
        knownAuthors,
        romanizedTitleVariantsByKey,
      );
      if (!shouldEnrichSourceWithDetails(source, analyzed)) return false;
      attemptedDetailSourceKeys.add(key);
      return true;
    });
    await runWithConcurrency(initialDetailCandidates.map((source) => async () => {
      enrichedSources.set(source, await enrichCandidateSource(source));
      checkedDetailCount += 1;
    }), concurrency);

    for (const listedSource of sources) {
      let source = enrichedSources.get(listedSource) ?? listedSource;
      let analyzed = sourceMatchesReference(
        input,
        source,
        knownTitles,
        knownAuthors,
        romanizedTitleVariantsByKey,
      );
      const sourceKey = buildMultiSearchSourceIdentityKey(source);
      if (
        !attemptedDetailSourceKeys.has(sourceKey)
        && shouldEnrichSourceWithDetails(source, analyzed)
      ) {
        attemptedDetailSourceKeys.add(sourceKey);
        source = await enrichCandidateSource(source);
        analyzed = sourceMatchesReference(
          input,
          source,
          knownTitles,
          knownAuthors,
          romanizedTitleVariantsByKey,
        );
        checkedDetailCount += 1;
      }
      const rejectionReason = resolveSourceRejectionReason(
        input.request,
        referenceChapter,
        analyzed,
      );
      if (rejectionReason) {
        storeRejectedCandidate(source, analyzed, rejectionReason, step);
        continue;
      }
      const key = buildMultiSearchSourceIdentityKey(source);
      const previousReview = previousCandidateReviews.get(key);
      if ((rejectedCandidates.get(key) ?? previousReview)?.decision === "dismissed") continue;
      const existing = matches.get(key) ?? previousMatchesByKey.get(key);
      rejectedCandidates.delete(key);
      const acceptedManually = existing?.acceptedManually === true
        || previousReview?.decision === "accepted";
      matches.set(key, {
        key,
        source,
        analyzedTitle: analyzed.analyzedTitle,
        alternativeTitles: analyzed.alternativeTitles,
        authors: analyzed.authors,
        chapter: analyzed.chapter,
        chapterOverride: existing?.chapterOverride,
        matchedTerm: analyzed.matchedTerm!,
        discoveredByStepIds: uniqueText([...(existing?.discoveredByStepIds ?? []), step.id]),
        ...(acceptedManually ? { acceptedManually: true } : {}),
      });
      accepted += existing ? 0 : 1;
      acceptedSources.push(source);
      analyzed.authors.forEach((author) => {
        const discovery = addDiscovery({
          kind: "author",
          value: author,
          scraperId: source.scraper.id,
          scraperName: source.scraper.name,
          origin: source.result.detailsMetadataFetched ? "details" : "card",
          sourceUrl: source.result.detailUrl,
          parentStepIds: [step.id],
        });
        if (!discovery || discovery.status !== "active") return;
        const isNewAuthor = !knownAuthors.some((value) => normalizeKey(value) === normalizeKey(author));
        if (knownAuthors.length >= MAX_DISCOVERED_AUTHORS && isNewAuthor) return;
        if (isNewAuthor) knownAuthors.push(author);
        const authorStep = addTrace("authorDiscovered", "Auteur correspondant trouvé", author, step.id);
        addTask({ kind: "author", term: author, parentId: authorStep.id });
      });
      const directAuthorUrls = uniqueText([source.result.authorUrl, ...(source.result.authorUrls ?? [])]);
      const hasActiveDiscoveredAuthor = analyzed.authors.some((author) => (
        discoveries.get(buildMangaCorrespondenceDiscoveryKey("author", source.scraper.id, author))?.status === "active"
      ));
      if (directAuthorUrls.length && hasActiveDiscoveredAuthor) {
        addTask({
          kind: "author",
          term: analyzed.authors[0] || directAuthorUrls[0],
          parentId: step.id,
          directTargets: directAuthorUrls.map((url) => ({ scraper: source.scraper, url })),
        });
      }
      analyzed.discoverableTitles.forEach((title) => {
        const discovery = addDiscovery({
          kind: "title",
          value: title,
          scraperId: source.scraper.id,
          scraperName: source.scraper.name,
          origin: source.result.detailsMetadataFetched ? "details" : "card",
          sourceUrl: source.result.detailUrl,
          parentStepIds: [step.id],
        });
        if (!discovery || discovery.status !== "active") return;
        const isNewTitle = !knownTitles.some((value) => normalizeKey(value) === normalizeKey(title));
        if (knownTitles.length >= MAX_DISCOVERED_TITLES && isNewTitle) return;
        if (isNewTitle) knownTitles.push(title);
        const titleStep = addTrace("titleDiscovered", "Titre correspondant trouvé", title, step.id);
        addTask({ kind: "title", term: title, parentId: titleStep.id });
      });
    }
    pruneRejectedCandidates();
    const sourcesRequiringAuthorExtraction = acceptedSources.filter((source) => {
      const key = buildMultiSearchSourceIdentityKey(source);
      if (extractedAuthorSourceKeys.has(key)) return false;
      extractedAuthorSourceKeys.add(key);
      return true;
    });
    if (sourcesRequiringAuthorExtraction.length) {
      const extracted = await extractMultiSearchAuthors(
        sourcesRequiringAuthorExtraction,
        input.paceMode,
        undefined,
        {
          concurrency,
          signal,
          detailsCache,
          fetchDocument: executionContext.fetchDocument,
        },
      );
      extracted.authors.forEach((author) => {
        const scraper = scrapers.find((entry) => entry.id === author.scraperId);
        if (!scraper) return;
        const discovery = addDiscovery({
          kind: "author",
          value: author.name,
          scraperId: scraper.id,
          scraperName: scraper.name,
          origin: author.discoveryMethod === "details" ? "details" : "card",
          sourceUrl: author.url,
          parentStepIds: [step.id],
        });
        if (!discovery || discovery.status !== "active") return;
        const authorStep = addTrace("authorDiscovered", "Page auteur correspondante trouvée", author.name, step.id);
        if (knownAuthors.length < MAX_DISCOVERED_AUTHORS && !knownAuthors.some((value) => normalizeKey(value) === normalizeKey(author.name))) {
          knownAuthors.push(author.name);
        }
        if (scraper) {
          addTask({
            kind: "author",
            term: author.name,
            parentId: authorStep.id,
            directTargets: [{ scraper, url: author.url }],
          });
        }
      });
    }
    step.resultCount = accepted;
    step.detail = `${sources.length} résultat(s) analysé(s), ${accepted} nouvelle(s) correspondance(s), ${checkedDetailCount} fiche(s) vérifiée(s) après préfiltrage.`;
  };

  const loadSearch = async (
    scraper: ScraperRecord,
    term: string,
    pageLimit = maxPages,
  ): Promise<MultiSearchSourceResult[]> => {
    if (!isSearchableScraper(scraper)) return [];
    const results: MultiSearchSourceResult[] = [];
    const resultKeys = new Set<string>();
    const prefetchSourceKey = `${scraper.id}:${normalizeKey(term)}`;
    let nextPageUrl: string | undefined;
    for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
      if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
      try {
        const requestedPageUrl = nextPageUrl;
        const loadPage = () => fetchSearchPageWithRetry(
          scraper,
          getSearchConfig(scraper),
          term,
          pageIndex,
          nextPageUrl,
          pace,
          { scrapeDetailsWithCards: false, fetchDocument: executionContext.fetchDocument },
        );
        const page = await searchPagePrefetch.load(
          prefetchSourceKey,
          buildScraperListingPageRequestKey(pageIndex, nextPageUrl),
          loadPage,
        );
        const pageHasNext = resolveHasNextPage(getSearchConfig(scraper), page);
        if (pageHasNext && pageIndex + 1 < pageLimit) {
          const followingPageIndex = pageIndex + 1;
          const followingPageUrl = page.nextPageUrl;
          searchPagePrefetch.preload(
            prefetchSourceKey,
            buildScraperListingPageRequestKey(followingPageIndex, followingPageUrl),
            () => fetchSearchPageWithRetry(
              scraper,
              getSearchConfig(scraper),
              term,
              followingPageIndex,
              followingPageUrl,
              pace,
              { scrapeDetailsWithCards: false, fetchDocument: executionContext.fetchDocument },
            ),
          );
        }
        const { sources: pageSources } = await processScraperListingPage({
          scraper,
          page,
          pageIndex,
          searchTerm: term,
        });
        const newSources = pageSources.filter((source) => {
          const key = buildMultiSearchSourceIdentityKey(source);
          if (resultKeys.has(key)) return false;
          resultKeys.add(key);
          return true;
        });
        results.push(...newSources);
        nextPageUrl = page.nextPageUrl;
        if (
          (pageSources.length > 0 && newSources.length === 0)
          || isBackgroundListingPaginationStalled(requestedPageUrl, nextPageUrl)
          || !pageHasNext
        ) break;
      } catch (error) {
        if (!isScraperListingPaginationEndError(error) && results.length === 0) throw error;
        break;
      }
    }
    return results;
  };
  const loadAuthor = async (
    scraper: ScraperRecord,
    term: string,
    templateContext?: Record<string, string | undefined> | null,
  ): Promise<MultiSearchSourceResult[]> => {
    if (!canSearchAuthors(scraper)) return [];
    const results: MultiSearchSourceResult[] = [];
    const resultKeys = new Set<string>();
    const prefetchSourceKey = `${scraper.id}:${normalizeKey(term)}:${JSON.stringify(templateContext ?? null)}`;
    let nextPageUrl: string | undefined;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
      try {
        const requestedPageUrl = nextPageUrl;
        const loadPage = () => fetchAuthorPageWithRetry(
          scraper, getAuthorConfig(scraper), term, pageIndex, nextPageUrl, pace,
          templateContext ?? null,
          { scrapeDetailsWithCards: false, fetchDocument: executionContext.fetchDocument },
        );
        const page = await authorPagePrefetch.load(
          prefetchSourceKey,
          buildScraperListingPageRequestKey(pageIndex, nextPageUrl),
          loadPage,
        );
        const pageHasNext = resolveHasNextAuthorPage(getAuthorConfig(scraper), page);
        if (pageHasNext && pageIndex + 1 < maxPages) {
          const followingPageIndex = pageIndex + 1;
          const followingPageUrl = page.nextPageUrl;
          authorPagePrefetch.preload(
            prefetchSourceKey,
            buildScraperListingPageRequestKey(followingPageIndex, followingPageUrl),
            () => fetchAuthorPageWithRetry(
              scraper, getAuthorConfig(scraper), term, followingPageIndex, followingPageUrl, pace,
              templateContext ?? null,
              { scrapeDetailsWithCards: false, fetchDocument: executionContext.fetchDocument },
            ),
          );
        }
        const { sources: pageSources } = await processScraperListingPage({
          scraper,
          page,
          pageIndex,
          searchTerm: term,
        });
        const newSources = pageSources.filter((source) => {
          const key = buildMultiSearchSourceIdentityKey(source);
          if (resultKeys.has(key)) return false;
          resultKeys.add(key);
          return true;
        });
        results.push(...newSources);
        nextPageUrl = page.nextPageUrl;
        if (
          (pageSources.length > 0 && newSources.length === 0)
          || isBackgroundListingPaginationStalled(requestedPageUrl, nextPageUrl)
          || !pageHasNext
        ) break;
      } catch (error) {
        if (!isScraperListingPaginationEndError(error) && results.length === 0) throw error;
        break;
      }
    }
    return results;
  };

  await emit();
  while (queue.length && processedTasks < MAX_DISCOVERY_TASKS) {
    if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
    let index = 0;
    if (input.strategy === "titleFirst") index = Math.max(0, queue.findIndex((task) => task.kind === "title"));
    if (input.strategy === "authorFirst") index = Math.max(0, queue.findIndex((task) => task.kind === "author"));
    if (input.strategy === "balanced") {
      const discoveredTitle = queue.findIndex((task) => (
        task.kind === "title"
        && Boolean(task.parentId)
        && !task.initialGeneratedVariant
      ));
      const preferred = discoveredTitle >= 0
        ? discoveredTitle
        : queue.findIndex((task) => task.kind === balancedKind);
      index = preferred >= 0 ? preferred : 0;
      balancedKind = balancedKind === "title" ? "author" : "title";
    }
    const task = queue.splice(index, 1)[0];
    activeTask = task;
    queuedTasksByKey.delete(task.directOnly ? `${buildTaskKey(task)}:direct` : buildTaskKey(task));
    const isTitle = task.kind === "title";
    const searched = isTitle ? searchedTitles : searchedAuthors;
    if (!searched.some((term) => normalizeKey(term) === normalizeKey(task.term))) searched.push(task.term);
    const step = addTrace(
      isTitle ? "titleSearch" : "authorSearch",
      isTitle ? "Recherche avec le titre" : "Recherche avec l'auteur",
      task.term,
      task.parentId,
    );
    await emit(task.term);
    const collected: MultiSearchSourceResult[] = [];
    if (isTitle) {
      await runWithConcurrency(scrapers.map((scraper) => async () => {
        try {
          collected.push(...await loadSearch(scraper, task.term));
        } catch (error) {
          console.warn(`Correspondence search failed for ${scraper.name}`, error);
        }
      }), concurrency);
    } else if (task.directOnly) {
      await runWithConcurrency((task.directTargets ?? []).map((target) => async () => {
        try {
          collected.push(...await loadAuthor(target.scraper, target.url, target.templateContext));
        } catch (error) {
          console.warn(`Correspondence direct author page failed for ${target.scraper.name}`, error);
        }
      }), concurrency);
    } else {
      const authorInput: AuthorCorrespondenceBackgroundInput = {
        referenceName: task.term,
        names: [task.term],
        referenceSources: (task.directTargets ?? []).map((target) => ({
          scraperId: target.scraper.id,
          authorUrl: target.url,
          name: task.term,
          templateContext: target.templateContext,
        })),
        scraperFilterValues: input.scraperFilterValues,
        scrapers: input.scrapers,
        maxPages: input.maxPages,
        paceMode: input.paceMode,
        scrapingConcurrency: concurrency,
        scrapeDetailsWithCards: false,
      };
      try {
        const authorResult = await runAuthorCorrespondenceSearch(
          authorInput,
          signal,
          async () => {},
          executionContext,
        );
        await runWithConcurrency(authorResult.matches.map((authorMatch) => async () => {
          if (resolvedAuthorPageKeys.has(authorMatch.key)) return;
          resolvedAuthorPageKeys.add(authorMatch.key);
          const scraper = scrapers.find((entry) => entry.id === authorMatch.scraperId);
          if (!scraper) return;

          const discovery = addDiscovery({
            kind: "author",
            value: authorMatch.authorName,
            scraperId: scraper.id,
            scraperName: scraper.name,
            origin: "authorPage",
            sourceUrl: authorMatch.authorUrl,
            parentStepIds: [step.id],
          });
          if (!discovery || discovery.status !== "active") return;

          if (
            knownAuthors.length < MAX_DISCOVERED_AUTHORS
            && !knownAuthors.some((value) => normalizeKey(value) === normalizeKey(authorMatch.authorName))
          ) {
            knownAuthors.push(authorMatch.authorName);
          }
          const authorPageStep = addTrace(
            "authorDiscovered",
            "Page auteur équivalente trouvée",
            `${authorMatch.authorName} · ${authorMatch.scraperName}`,
            step.id,
          );
          try {
            const sources = await loadAuthor(
              scraper,
              authorMatch.authorUrl,
              authorMatch.templateContext,
            );
            collected.push(...(sources.length ? sources : authorMatch.previewSources));
            authorPageStep.resultCount = sources.length || authorMatch.previewSources.length;
            authorPageStep.detail = `${sources.length || authorMatch.previewSources.length} résultat(s) récupéré(s) sur la page auteur.`;
          } catch (error) {
            collected.push(...authorMatch.previewSources);
            authorPageStep.resultCount = authorMatch.previewSources.length;
            authorPageStep.detail = authorMatch.previewSources.length
              ? `${authorMatch.previewSources.length} aperçu(s) récupéré(s), la page complète n'a pas pu être chargée.`
              : "La page auteur n'a pas pu être chargée.";
            console.warn(`Correspondence author page failed for ${scraper.name}`, error);
          }
        }), concurrency);
      } catch (error) {
        console.warn(`Author correspondence discovery failed for ${task.term}`, error);
        await runWithConcurrency((task.directTargets ?? []).map((target) => async () => {
          try {
            collected.push(...await loadAuthor(
              target.scraper,
              target.url,
              target.templateContext,
            ));
          } catch (targetError) {
            console.warn(`Correspondence author page failed for ${target.scraper.name}`, targetError);
          }
        }), concurrency);
      }
    }
    await discoverFromSources(collected, step);
    processedTaskKeys.add(buildTaskKey(task));
    (task.directTargets ?? []).forEach((target) => processedDirectTargetKeys.add(buildDirectTargetKey(target)));
    processedTasks += 1;
    activeTask = null;
    await emit(task.term);
  }

  refreshRejectedCandidateScores();
  return buildResult(
    input,
    matches,
    rejectedCandidates,
    rejectedCandidateCount,
    trace,
    searchedTitles,
    searchedAuthors,
    discoveries,
    buildCheckpoint(),
  );
};
