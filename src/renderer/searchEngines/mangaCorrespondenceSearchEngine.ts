import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchProgress,
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceResultDecision,
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
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
  isScraperFeatureConfigured,
  resolveScraperCardDetails,
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
  MangaCorrespondenceWarning,
} from "@/renderer/backgroundSearch/types";
import {
  buildMangaCorrespondenceDiscoveryKey,
  upsertMangaCorrespondenceDiscovery,
} from "@/renderer/backgroundSearch/mangaCorrespondenceDiscoveries";
import {
  doesCorrespondenceAnalyzedTitleMatchKnownTitle,
  isUsableCorrespondenceDiscoveredTitle,
  selectCorrespondenceDiscoverableTitles,
} from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
import { isBackgroundListingPaginationStalled } from "@/renderer/backgroundSearch/backgroundListingBlacklist";
import { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
import { selectMangaCorrespondenceRomanizedSearchTerms } from "@/renderer/backgroundSearch/mangaCorrespondenceRomanization";
import {
  analyzeMangaCorrespondenceSourceIdentity,
  isClearlyDerivativeMangaCorrespondenceTitle,
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
import { normalizeMangaCorrespondenceSafetySettings } from "@/shared/mangaCorrespondenceSafetySettings";
import {
  advanceSearchProductivity,
  EMPTY_SEARCH_PRODUCTIVITY_STATE,
  hasAbnormalDistinctValueCount,
  shouldAutoInvalidateUnproductiveSeed,
  shouldStopUnproductiveSearch,
} from "@/renderer/searchEngines/searchExpansionGuard";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type DiscoveryTask = {
  kind: "title" | "author";
  term: string;
  parentId?: string;
  initialGeneratedVariant?: boolean;
  protectedSeed?: boolean;
  directOnly?: boolean;
  directTargets?: Array<{
    scraper: ScraperRecord;
    url: string;
    templateContext?: Record<string, string | undefined> | null;
  }>;
};

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
  resultDecisions: Map<string, MangaCorrespondenceResultDecision>,
  warnings: Map<string, MangaCorrespondenceWarning>,
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
  resultDecisions: Array.from(resultDecisions.values()),
  warnings: Array.from(warnings.values()),
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
  matchedByContainment: boolean;
  matchedByMerge: boolean;
  discoverableTitles: string[];
} => {
  const config = getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis"));
  const identity = analyzeMangaCorrespondenceSourceIdentity({
    rawTitle: source.result.title,
    titleAnalysisConfig: config,
    knownAuthors,
    supplementalAuthors: [...(source.result.authorNames ?? []), ...source.tentativeAuthorNames],
  });
  const { analysis, titleAlternatives, authors } = identity;
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
    matchedByContainment: match?.directMatch === true,
    matchedByMerge: Boolean(match && match.mergeMatchKind !== null),
    discoverableTitles,
  };
};

const resolveSourceRejectionReason = (
  request: MangaCorrespondenceBackgroundInput["request"],
  referenceChapter: string | undefined,
  analyzed: ReturnType<typeof sourceMatchesReference>,
  requireContainment = false,
): MangaCorrespondenceRejectionReason | undefined => {
  if (!analyzed.matchedTerm || (requireContainment && !analyzed.matchedByContainment)) {
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
  const safety = normalizeMangaCorrespondenceSafetySettings(input.safety);
  const safeguardsEnabled = safety.enabled;
  const maxPages = input.maxPages === null
    ? (safeguardsEnabled && safety.unboundedPageLimitEnabled
      ? safety.unboundedPageLimit
      : Number.MAX_SAFE_INTEGER)
    : Math.max(1, input.maxPages);
  const maxDiscoveryTasks = safeguardsEnabled && safety.taskExpansionGuardEnabled
    ? safety.maxDiscoveryTaskCount
    : Number.MAX_SAFE_INTEGER;
  const maxStoredRejectedCandidates = safeguardsEnabled && safety.retainedPotentialGuardEnabled
    ? safety.retainedPotentialCount
    : Number.MAX_SAFE_INTEGER;
  const authorDiscoveryOnly = input.purpose === "authorDiscovery";
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
    purpose: input.purpose ?? "correspondence",
    safety,
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
  const warnings = new Map<string, MangaCorrespondenceWarning>(
    (isContinuation || isResume ? previousResult?.warnings ?? [] : []).map((warning) => [warning.key, warning]),
  );
  const previousRejectedCandidates = previousResult?.rejectedCandidates ?? [];
  const resultDecisions = new Map(
    (input.replay?.resultDecisions ?? previousResult?.resultDecisions ?? []).map((decision) => [
      decision.key,
      decision,
    ]),
  );
  const invalidatedResultKeys = new Set(Array.from(resultDecisions.values())
    .filter((decision) => decision.status === "invalidated")
    .map((decision) => decision.key));
  const invalidatedResultReferences = Array.from(resultDecisions.values()).filter((decision) => (
    decision.status === "invalidated"
  ));
  const invalidatedTitleOwners = new Map<string, MangaCorrespondenceResultDecision>();
  const invalidatedKnownTitles = uniqueText(invalidatedResultReferences.flatMap((decision) => {
    const titles = [decision.analyzedTitle, ...decision.alternativeTitles, decision.title];
    titles.forEach((title) => invalidatedTitleOwners.set(normalizeKey(title), decision));
    return titles;
  }));
  const invalidatedKnownAuthors = uniqueText(invalidatedResultReferences.flatMap((decision) => (
    decision.authors
  )));
  const invalidatedDiscoverySourceKeys = new Set(invalidatedResultReferences.flatMap((decision) => (
    decision.sourceUrl ? [`${decision.scraperId}:${decision.sourceUrl}`] : []
  )));
  const comesFromInvalidatedResult = (discovery: MangaCorrespondenceDiscovery): boolean => (
    discovery.origin !== "reference"
    && discovery.origin !== "manual"
    && Boolean(discovery.sourceUrl)
    && invalidatedDiscoverySourceKeys.has(`${discovery.scraperId}:${discovery.sourceUrl}`)
  );
  const acceptedPreviousCandidates = previousRejectedCandidates.filter((candidate) => (
    candidate.decision === "accepted"
    && !invalidatedResultKeys.has(candidate.key)
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
      propagationConfidence: "reference",
    });
  });
  input.reference.authors.forEach((author, index) => {
    const authorPageUrl = input.reference.authorUrls[index]
      ?? (input.reference.authorUrls.length === 1 ? input.reference.authorUrls[0] : undefined);
    addDiscovery({
      kind: "author",
      value: author,
      scraperId: referenceScraper.id,
      scraperName: referenceScraper.name,
      origin: "reference",
      sourceUrl: input.reference.sourceUrl,
      ...(authorPageUrl ? { authorPageUrl } : {}),
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
        propagationConfidence: "manual",
      });
    });
    const candidateAuthorUrls = uniqueText([
      candidate.source.result.authorUrl,
      ...(candidate.source.result.authorUrls ?? []),
    ]);
    candidate.authors.forEach((author, index) => {
      const authorPageUrl = candidateAuthorUrls[index]
        ?? (candidateAuthorUrls.length === 1 ? candidateAuthorUrls[0] : undefined);
      addDiscovery({
        kind: "author",
        value: author,
        scraperId: candidate.source.scraper.id,
        scraperName: candidate.source.scraper.name,
        origin: candidate.source.result.detailsMetadataFetched ? "details" : "card",
        sourceUrl: candidate.source.result.detailUrl,
        ...(authorPageUrl ? { authorPageUrl } : {}),
        parentStepIds: candidate.discoveredByStepIds,
      });
    });
  });
  const previousTraceKinds = new Map((previousResult?.trace ?? []).map((step) => [step.id, step.kind]));
  const isUnsafeLegacyAuthorTitle = (discovery: MangaCorrespondenceDiscovery): boolean => (
    discovery.kind === "title"
    && discovery.origin !== "reference"
    && !discovery.propagationConfidence
    && discovery.parentStepIds.some((stepId) => previousTraceKinds.get(stepId) === "authorSearch")
  );
  const discoveryPriority = (discovery: MangaCorrespondenceDiscovery): number => (
    discovery.origin === "reference" ? 0 : discovery.origin === "manual" ? 1 : 2
  );
  const knownTitles = uniqueText(Array.from(discoveries.values())
    .filter((discovery) => (
      discovery.kind === "title"
      && discovery.status === "active"
      && !comesFromInvalidatedResult(discovery)
      && !isUnsafeLegacyAuthorTitle(discovery)
      && (
        discovery.origin === "reference"
        || isUsableCorrespondenceDiscoveredTitle(discovery.value)
      )
    ))
    .sort((left, right) => discoveryPriority(left) - discoveryPriority(right))
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
    (isContinuation || isResume ? previousResult?.matches ?? [] : [])
      .filter((match) => !invalidatedResultKeys.has(match.key))
      .map((match) => [match.key, match]),
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
    .filter((discovery) => (
      discovery.kind === "author"
      && discovery.status === "active"
      && !comesFromInvalidatedResult(discovery)
      && discovery.propagationConfidence !== "fuzzyTitle"
    ))
    .sort((left, right) => discoveryPriority(left) - discoveryPriority(right))
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
  let authorExpansionPaused = safeguardsEnabled
    && safety.authorExpansionGuardEnabled
    && hasAbnormalDistinctValueCount(knownAuthors.length, safety.abnormalAuthorLimit);

  const addWarning = (
    warning: Omit<MangaCorrespondenceWarning, "createdAt"> & { createdAt?: string },
  ): void => {
    if (warnings.has(warning.key)) return;
    warnings.set(warning.key, {
      ...warning,
      createdAt: warning.createdAt ?? new Date().toISOString(),
    });
    recordDiagnostic(`guard.${warning.code}`, warning.evidence, warning.scraperId);
  };

  const countDistinctActiveAuthors = (): number => new Set(
    Array.from(discoveries.values())
      .filter((discovery) => discovery.kind === "author" && discovery.status === "active")
      .map((discovery) => normalizeKey(discovery.value))
      .filter(Boolean),
  ).size;

  const pauseAutomaticAuthorExpansion = (term?: string): boolean => {
    if (!safeguardsEnabled || !safety.authorExpansionGuardEnabled) return false;
    const distinctAuthorCount = countDistinctActiveAuthors();
    if (!hasAbnormalDistinctValueCount(distinctAuthorCount, safety.abnormalAuthorLimit)) return false;
    authorExpansionPaused = true;
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const queuedTask = queue[index];
      if (queuedTask.kind !== "author" || queuedTask.protectedSeed) continue;
      queue.splice(index, 1);
      queuedTasksByKey.delete(queuedTask.directOnly
        ? `${buildTaskKey(queuedTask)}:direct`
        : buildTaskKey(queuedTask));
    }
    addWarning({
      key: "author-expansion",
      code: "authorExpansion",
      message: `L’expansion automatique des auteurs a été suspendue après ${distinctAuthorCount} noms différents. Les références et ajouts manuels restent traités.`,
      term,
      evidence: { distinctAuthorCount, limit: safety.abnormalAuthorLimit },
    });
    return true;
  };

  const queueDirectTargetDelta = (
    task: DiscoveryTask,
    key: string,
    targetsToAdd: NonNullable<DiscoveryTask["directTargets"]>,
  ): void => {
    if (!targetsToAdd.length) return;
    const deltaKey = `${key}:direct`;
    const existingDelta = queuedTasksByKey.get(deltaKey);
    if (existingDelta) {
      const targets = new Map((existingDelta.directTargets ?? []).map((target) => [
        buildDirectTargetKey(target),
        target,
      ]));
      targetsToAdd.forEach((target) => targets.set(buildDirectTargetKey(target), target));
      existingDelta.directTargets = Array.from(targets.values());
      existingDelta.protectedSeed ||= task.protectedSeed;
      return;
    }
    const deltaTask: DiscoveryTask = {
      ...task,
      directTargets: targetsToAdd,
      directOnly: true,
    };
    queuedTasksByKey.set(deltaKey, deltaTask);
    queue.push(deltaTask);
    recordDiagnostic("task.delta-queued", {
      kind: task.kind,
      term: task.term,
      directTargetCount: targetsToAdd.length,
    });
  };

  const addTask = (task: DiscoveryTask): void => {
    const key = buildTaskKey(task);
    if (!normalizeKey(task.term)) return;
    const existing = queuedTasksByKey.get(key);
    if (existing) {
      const targets = new Map((existing.directTargets ?? []).map((target) => [buildDirectTargetKey(target), target]));
      (task.directTargets ?? []).forEach((target) => targets.set(buildDirectTargetKey(target), target));
      existing.directTargets = Array.from(targets.values());
      existing.parentId ??= task.parentId;
      existing.protectedSeed ||= task.protectedSeed;
      recordDiagnostic("task.merged", { kind: task.kind, term: task.term, directTargetCount: targets.size });
      return;
    }
    if (authorExpansionPaused && task.kind === "author" && !task.protectedSeed) return;
    if (queue.length + processedTaskKeys.size >= maxDiscoveryTasks && !task.protectedSeed) {
      addWarning({
        key: "task-expansion",
        code: "taskExpansion",
        message: `La recherche a atteint la limite de ${maxDiscoveryTasks} tâches de découverte. Les références et ajouts manuels restent prioritaires.`,
        term: task.term,
        evidence: {
          limit: maxDiscoveryTasks,
          queuedTaskCount: queue.length,
          processedTaskCount: processedTaskKeys.size,
        },
      });
      return;
    }
    if (activeTask && buildTaskKey(activeTask) === key) {
      const alreadyTargeted = new Set([
        ...(activeTask.directTargets ?? []).map(buildDirectTargetKey),
        ...Array.from(processedDirectTargetKeys),
      ]);
      const newTargets = (task.directTargets ?? []).filter((target) => (
        !alreadyTargeted.has(buildDirectTargetKey(target))
      ));
      if (newTargets.length) queueDirectTargetDelta(task, key, newTargets);
      recordDiagnostic("task.merged", {
        kind: task.kind,
        term: task.term,
        active: true,
        directTargetCount: newTargets.length,
      });
      return;
    }
    if (processedTaskKeys.has(key)) {
      const newTargets = (task.directTargets ?? []).filter((target) => (
        !processedDirectTargetKeys.has(buildDirectTargetKey(target))
      ));
      if (!newTargets.length) return;
      queueDirectTargetDelta(task, key, newTargets);
      return;
    }
    queuedTasksByKey.set(key, task);
    queue.push(task);
  };

  if (authorExpansionPaused) pauseAutomaticAuthorExpansion();

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
  const isProtectedSeedTerm = (kind: DiscoveryTask["kind"], term: string): boolean => (
    Array.from(discoveries.values()).some((discovery) => (
      discovery.kind === kind
      && discovery.status === "active"
      && normalizeKey(discovery.value) === normalizeKey(term)
      && (
        discovery.origin === "reference"
        || discovery.origin === "manual"
        || discovery.propagationConfidence === "manual"
      )
    ))
  );

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
    protectedSeed: isContinuation || isProtectedSeedTerm("title", term),
  }));
  if (!isContinuation && !isResume) {
    Array.from(discoveries.values()).forEach((discovery) => {
      if (
        discovery.kind !== "title"
        || discovery.origin !== "manual"
        || discovery.status !== "active"
        || !discovery.sourceUrl
      ) return;
      const scraper = scrapers.find((entry) => entry.id === discovery.scraperId);
      if (!scraper) return;
      addTask({
        kind: "title",
        term: discovery.value,
        protectedSeed: true,
        directTargets: [{ scraper, url: discovery.sourceUrl }],
      });
    });
  }
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
        protectedSeed: isProtectedSeedTerm("title", title),
      });
    });
  });
  const initialAuthorTasks = authorDiscoveryOnly
    ? []
    : isResume
    ? []
    : isContinuation
    ? uniqueText(acceptedSearchSeeds.flatMap((candidate) => candidate.authors))
    : [...knownAuthors];
  initialAuthorTasks.forEach((term) => addTask({
    kind: "author",
    term,
    parentId: continuationStep?.id,
    protectedSeed: isContinuation || isProtectedSeedTerm("author", term),
  }));
  if (!isContinuation && !isResume) {
    Array.from(discoveries.values()).forEach((discovery) => {
      if (
        discovery.kind !== "author"
        || discovery.status !== "active"
        || !discovery.authorPageUrl
      ) return;
      const scraper = scrapers.find((entry) => entry.id === discovery.scraperId);
      if (!scraper) return;
      addTask({
        kind: "author",
        term: discovery.value,
        protectedSeed: discovery.origin === "reference" || discovery.origin === "manual",
        directTargets: [{
          scraper,
          url: discovery.authorPageUrl,
          templateContext: discovery.authorTemplateContext,
        }],
      });
    });
  }
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
      protectedSeed: true,
      directTargets: [{ scraper, url }],
    }));
  });
  if (!isContinuation && !isResume && knownAuthors.length) input.reference.authorUrls.forEach((url) => {
    const scraper = scrapers.find((entry) => entry.id === input.reference.scraperId);
    if (scraper) addTask({
      kind: "author",
      term: knownAuthors[0] || url,
      protectedSeed: true,
      directTargets: [{ scraper, url }],
    });
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
        protectedSeed: pendingTask.protectedSeed,
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
      protectedSeed: task.protectedSeed,
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
      resultDecisions,
      warnings,
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
    scoreOverride?: ReturnType<typeof scoreMangaCorrespondenceRejectedCandidate>,
  ): void => {
    const key = buildMultiSearchSourceIdentityKey(source);
    const existing = rejectedCandidates.get(key) ?? previousCandidateReviews.get(key);
    const scored = scoreOverride ?? scoreMangaCorrespondenceRejectedCandidate({
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
    if (rejectedCandidates.size <= maxStoredRejectedCandidates) return;
    const reviewed = Array.from(rejectedCandidates.values()).filter((candidate) => (
      candidate.decision !== "pending"
    ));
    const availablePendingSlots = Math.max(0, maxStoredRejectedCandidates - reviewed.length);
    const pending = Array.from(rejectedCandidates.values())
      .filter((candidate) => candidate.decision === "pending")
      .sort((left, right) => (
        Number(right.rejectionReason === "invalidatedResult")
        - Number(left.rejectionReason === "invalidatedResult")
        || right.score - left.score
      ))
      .slice(0, availablePendingSlots);
    rejectedCandidates.clear();
    [...reviewed, ...pending].forEach((candidate) => rejectedCandidates.set(candidate.key, candidate));
  };
  const refreshRejectedCandidateScores = (): void => {
    rejectedCandidates.forEach((candidate, key) => {
      if (candidate.rejectionReason === "invalidatedResult") return;
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
  const compareWithInvalidatedResults = (
    source: MultiSearchSourceResult,
    analyzed: ReturnType<typeof sourceMatchesReference>,
  ): ReturnType<typeof scoreMangaCorrespondenceRejectedCandidate> | undefined => {
    if (!invalidatedResultReferences.length) return undefined;
    const titleFields = [analyzed.analyzedTitle, ...analyzed.alternativeTitles];
    const positive = scoreMangaCorrespondenceRejectedCandidate({
      titleFields,
      candidateAuthors: analyzed.authors,
      knownTitles,
      knownAuthors,
      rejectionReason: "titleMismatch",
      matchedTerm: analyzed.matchedTerm,
    });
    const sourceKey = buildMultiSearchSourceIdentityKey(source);
    const negative = scoreMangaCorrespondenceRejectedCandidate({
      titleFields,
      candidateAuthors: analyzed.authors,
      knownTitles: invalidatedKnownTitles,
      knownAuthors: invalidatedKnownAuthors,
      rejectionReason: "titleMismatch",
    });
    const isDirectInvalidation = invalidatedResultKeys.has(sourceKey);
    if (!isDirectInvalidation && negative.score <= positive.score) {
      return undefined;
    }
    const negativeOwner = invalidatedTitleOwners.get(normalizeKey(negative.bestKnownTitle ?? ""));
    const negativeTitle = negativeOwner?.title || negative.bestKnownTitle || "résultat retiré";
    return {
      score: Math.max(50, positive.score),
      bestKnownTitle: positive.bestKnownTitle,
      reasons: uniqueText([
        isDirectInvalidation
          ? "Résultat invalidé manuellement"
          : `Correspond davantage au résultat invalidé « ${negativeTitle} » (${negative.score}) qu’aux références actives (${positive.score})`,
        ...positive.reasons,
      ]),
    };
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
  ): Promise<{ newMatchCount: number; matchedSourceCount: number }> => {
    let accepted = 0;
    let matchedSourceCount = 0;
    let checkedDetailCount = 0;
    const acceptedSources: MultiSearchSourceResult[] = [];
    const enrichedSources = new Map<MultiSearchSourceResult, MultiSearchSourceResult>();
    const initialDetailCandidates = sources.filter((source) => {
      const key = buildMultiSearchSourceIdentityKey(source);
      if (attemptedDetailSourceKeys.has(key) || invalidatedResultKeys.has(key)) return false;
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
        && !invalidatedResultKeys.has(sourceKey)
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
        step.kind === "authorSearch",
      );
      const invalidatedResultScore = compareWithInvalidatedResults(source, analyzed);
      if (invalidatedResultScore) {
        storeRejectedCandidate(source, analyzed, "invalidatedResult", step, invalidatedResultScore);
        matches.delete(sourceKey);
        continue;
      }
      if (rejectionReason) {
        storeRejectedCandidate(source, analyzed, rejectionReason, step);
        continue;
      }
      const key = sourceKey;
      const previousReview = previousCandidateReviews.get(key);
      if ((rejectedCandidates.get(key) ?? previousReview)?.decision === "dismissed") continue;
      const existing = matches.get(key) ?? previousMatchesByKey.get(key);
      rejectedCandidates.delete(key);
      const acceptedManually = existing?.acceptedManually === true
        || previousReview?.decision === "accepted";
      const canPropagateFromSource = analyzed.matchedByContainment || acceptedManually;
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
      matchedSourceCount += 1;
      accepted += existing ? 0 : 1;
      if (canPropagateFromSource) acceptedSources.push(source);
      const directAuthorUrls = uniqueText([source.result.authorUrl, ...(source.result.authorUrls ?? [])]);
      analyzed.authors.forEach((author, index) => {
        const isNewAuthor = !knownAuthors.some((value) => normalizeKey(value) === normalizeKey(author));
        const discoveryKey = buildMangaCorrespondenceDiscoveryKey("author", source.scraper.id, author);
        const wasAlreadyDiscovered = discoveries.has(discoveryKey);
        const authorPageUrl = directAuthorUrls[index]
          ?? (directAuthorUrls.length === 1 ? directAuthorUrls[0] : undefined);
        const discovery = addDiscovery({
          kind: "author",
          value: author,
          scraperId: source.scraper.id,
          scraperName: source.scraper.name,
          origin: source.result.detailsMetadataFetched ? "details" : "card",
          sourceUrl: source.result.detailUrl,
          ...(authorPageUrl ? { authorPageUrl } : {}),
          parentStepIds: [step.id],
          propagationConfidence: canPropagateFromSource ? "directTitle" : "fuzzyTitle",
        });
        if (!discovery || discovery.status !== "active") return;
        if (!canPropagateFromSource || pauseAutomaticAuthorExpansion(author)) return;
        if (isNewAuthor) knownAuthors.push(author);
        const authorParentId = wasAlreadyDiscovered
          ? step.id
          : addTrace("authorDiscovered", "Auteur correspondant trouvé", author, step.id).id;
        if (!authorDiscoveryOnly) {
          addTask({ kind: "author", term: author, parentId: authorParentId });
        }
      });
      const hasActiveDiscoveredAuthor = analyzed.authors.some((author) => (
        discoveries.get(buildMangaCorrespondenceDiscoveryKey("author", source.scraper.id, author))?.status === "active"
      ));
      if (canPropagateFromSource && !authorDiscoveryOnly && directAuthorUrls.length && hasActiveDiscoveredAuthor) {
        addTask({
          kind: "author",
          term: analyzed.authors[0] || directAuthorUrls[0],
          parentId: step.id,
          directTargets: directAuthorUrls.map((url) => ({ scraper: source.scraper, url })),
        });
      }
      analyzed.discoverableTitles.forEach((title) => {
        const isNewTitle = !knownTitles.some((value) => normalizeKey(value) === normalizeKey(title));
        const discoveryKey = buildMangaCorrespondenceDiscoveryKey("title", source.scraper.id, title);
        const wasAlreadyDiscovered = discoveries.has(discoveryKey);
        const discovery = addDiscovery({
          kind: "title",
          value: title,
          scraperId: source.scraper.id,
          scraperName: source.scraper.name,
          origin: source.result.detailsMetadataFetched ? "details" : "card",
          sourceUrl: source.result.detailUrl,
          parentStepIds: [step.id],
          propagationConfidence: analyzed.matchedByContainment ? "directTitle" : "fuzzyTitle",
        });
        if (!discovery || discovery.status !== "active") return;
        if (!canPropagateFromSource) return;
        if (isNewTitle && queue.length + processedTaskKeys.size >= maxDiscoveryTasks) {
          addTask({ kind: "title", term: title, parentId: step.id });
          return;
        }
        if (isNewTitle) knownTitles.push(title);
        const titleParentId = wasAlreadyDiscovered
          ? step.id
          : addTrace("titleDiscovered", "Titre correspondant trouvé", title, step.id).id;
        addTask({ kind: "title", term: title, parentId: titleParentId });
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
        const isNewAuthor = !knownAuthors.some((value) => normalizeKey(value) === normalizeKey(author.name));
        const discovery = addDiscovery({
          kind: "author",
          value: author.name,
          scraperId: scraper.id,
          scraperName: scraper.name,
          origin: author.discoveryMethod === "details" ? "details" : "card",
          sourceUrl: author.url,
          authorPageUrl: author.url,
          parentStepIds: [step.id],
          propagationConfidence: "directTitle",
        });
        if (!discovery || discovery.status !== "active") return;
        if (pauseAutomaticAuthorExpansion(author.name)) return;
        const authorStep = addTrace("authorDiscovered", "Page auteur correspondante trouvée", author.name, step.id);
        if (isNewAuthor) knownAuthors.push(author.name);
        if (scraper && !authorDiscoveryOnly) {
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
    return { newMatchCount: accepted, matchedSourceCount };
  };

  const loadSearch = async (
    scraper: ScraperRecord,
    term: string,
    pageLimit = maxPages,
  ): Promise<{
    sources: MultiSearchSourceResult[];
    scannedCandidateCount: number;
    stoppedForUnproductivePages: boolean;
  }> => {
    if (!isSearchableScraper(scraper)) return {
      sources: [],
      scannedCandidateCount: 0,
      stoppedForUnproductivePages: false,
    };
    const results: MultiSearchSourceResult[] = [];
    const resultKeys = new Set<string>();
    const prefetchSourceKey = `${scraper.id}:${normalizeKey(term)}`;
    let nextPageUrl: string | undefined;
    let productivity = { ...EMPTY_SEARCH_PRODUCTIVITY_STATE };
    let stoppedForUnproductivePages = false;
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
        const productiveCandidateCount = pageSources.filter((source) => {
          const analyzed = sourceMatchesReference(
            input,
            source,
            knownTitles,
            knownAuthors,
            romanizedTitleVariantsByKey,
          );
          if (analyzed.derivative) return false;
          const rejectionReason = resolveSourceRejectionReason(input.request, referenceChapter, analyzed);
          return !rejectionReason || shouldFetchMangaCorrespondenceCandidateDetails({
            titleFields: [analyzed.analyzedTitle, ...analyzed.alternativeTitles],
            candidateAuthors: analyzed.authors,
            knownTitles,
            knownAuthors,
            rejectionReason,
            matchedTerm: analyzed.matchedTerm,
          });
        }).length;
        productivity = advanceSearchProductivity(productivity, {
          scannedCandidateCount: pageSources.length,
          productiveCandidateCount,
        });
        nextPageUrl = page.nextPageUrl;
        if (
          safeguardsEnabled
          && safety.emptyPageGuardEnabled
          && pageHasNext
          && shouldStopUnproductiveSearch(productivity, safety.consecutiveUnproductivePageLimit)
        ) {
          stoppedForUnproductivePages = true;
          searchPagePrefetch.clear(prefetchSourceKey);
          addWarning({
            key: `unproductive-pages:${scraper.id}:${normalizeKey(term)}`,
            code: "unproductivePages",
            message: `La source ${scraper.name} a été arrêtée pour « ${term} » après ${productivity.consecutiveUnproductiveUnits} pages consécutives sans piste plausible.`,
            term,
            scraperId: scraper.id,
            scraperName: scraper.name,
            evidence: {
              consecutivePageCount: productivity.consecutiveUnproductiveUnits,
              scannedCandidateCount: productivity.scannedCandidateCount,
            },
          });
          break;
        }
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
    return {
      sources: results,
      scannedCandidateCount: productivity.scannedCandidateCount,
      stoppedForUnproductivePages,
    };
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

  const loadDirectManga = async (
    scraper: ScraperRecord,
    url: string,
    term: string,
  ): Promise<MultiSearchSourceResult[]> => {
    const details = await resolveScraperCardDetails({
      scraper,
      detailsConfig: getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details")),
      detailUrl: url,
      fetchDocument: executionContext.fetchDocument,
      detailsCache,
    });
    if (!details?.title?.trim()) return [];
    const page = {
      currentPageUrl: url,
      items: [{
        title: details.title,
        detailUrl: url,
        detailsMetadataFetched: true,
        authorUrl: details.authorUrls[0],
        authorUrls: details.authorUrls,
        authorNames: details.authors,
        tags: details.tags,
        tagUrls: details.tagUrls,
        thumbnailUrl: details.cover,
        thumbnailCandidates: details.coverCandidates,
        summary: details.description,
        pageCount: details.pageCount,
        languageCodes: details.languageCodes,
      }],
    };
    return (await processScraperListingPage({
      scraper,
      page,
      pageIndex: 0,
      searchTerm: term,
    })).sources;
  };

  await emit();
  while (queue.length) {
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
    let scannedCandidateCount = 0;
    let stoppedUnproductiveSourceCount = 0;
    if (isTitle) {
      const directTasks = (task.directTargets ?? []).map((target) => async () => {
        try {
          collected.push(...await loadDirectManga(target.scraper, target.url, task.term));
        } catch (error) {
          console.warn(`Correspondence direct manga page failed for ${target.scraper.name}`, error);
        }
      });
      await runWithConcurrency([...directTasks, ...scrapers.map((scraper) => async () => {
        try {
          const loaded = await loadSearch(scraper, task.term);
          collected.push(...loaded.sources);
          scannedCandidateCount += loaded.scannedCandidateCount;
          stoppedUnproductiveSourceCount += Number(loaded.stoppedForUnproductivePages);
        } catch (error) {
          console.warn(`Correspondence search failed for ${scraper.name}`, error);
        }
      })], concurrency);
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
        correspondenceSafety: safety,
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
          const isNewAuthor = !knownAuthors.some((value) => (
            normalizeKey(value) === normalizeKey(authorMatch.authorName)
          ));
          const discovery = addDiscovery({
            kind: "author",
            value: authorMatch.authorName,
            scraperId: scraper.id,
            scraperName: scraper.name,
            origin: "authorPage",
            sourceUrl: authorMatch.authorUrl,
            authorPageUrl: authorMatch.authorUrl,
            ...(authorMatch.templateContext
              ? { authorTemplateContext: authorMatch.templateContext }
              : {}),
            parentStepIds: [step.id],
            propagationConfidence: task.protectedSeed ? "manual" : "directTitle",
          });
          if (!discovery || discovery.status !== "active") return;
          if (!task.protectedSeed && pauseAutomaticAuthorExpansion(authorMatch.authorName)) return;

          if (isNewAuthor) knownAuthors.push(authorMatch.authorName);
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
    const discoveryResult = await discoverFromSources(collected, step);
    if (
      isTitle
      && safeguardsEnabled
      && safety.autoInvalidateUnproductiveTitles
      && shouldAutoInvalidateUnproductiveSeed({
        protectedSeed: task.protectedSeed === true,
        scannedCandidateCount,
        acceptedCandidateCount: discoveryResult.matchedSourceCount,
        stoppedUnproductiveSourceCount,
        minimumCandidateCount: safety.autoInvalidateMinCandidateCount,
      })
    ) {
      const invalidatedAt = new Date().toISOString();
      const message = `Titre invalidé automatiquement après ${scannedCandidateCount} candidats sans correspondance plausible.`;
      let invalidatedDiscoveryCount = 0;
      discoveries.forEach((discovery, key) => {
        if (
          discovery.kind !== "title"
          || discovery.status !== "active"
          || normalizeKey(discovery.value) !== normalizeKey(task.term)
          || discovery.origin === "reference"
          || discovery.origin === "manual"
        ) return;
        discoveries.set(key, {
          ...discovery,
          status: "invalidated",
          automaticInvalidation: {
            code: "unproductiveTitle",
            message,
            invalidatedAt,
          },
        });
        discoveryDecisions.set(key, "invalidated");
        invalidatedDiscoveryCount += 1;
      });
      if (invalidatedDiscoveryCount > 0) {
        const stillActive = Array.from(discoveries.values()).some((discovery) => (
          discovery.kind === "title"
          && discovery.status === "active"
          && normalizeKey(discovery.value) === normalizeKey(task.term)
        ));
        if (!stillActive) {
          for (let index = knownTitles.length - 1; index >= 0; index -= 1) {
            if (normalizeKey(knownTitles[index]) === normalizeKey(task.term)) knownTitles.splice(index, 1);
          }
        }
        addWarning({
          key: `automatic-title-invalidation:${normalizeKey(task.term)}`,
          code: "automaticTitleInvalidation",
          message,
          term: task.term,
          evidence: { scannedCandidateCount, invalidatedDiscoveryCount },
        });
      }
    }
    processedTaskKeys.add(buildTaskKey(task));
    (task.directTargets ?? []).forEach((target) => processedDirectTargetKeys.add(buildDirectTargetKey(target)));
    processedTasks += 1;
    activeTask = null;
    await emit(task.term);
    if (authorDiscoveryOnly && knownAuthors.length > 0) break;
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
    resultDecisions,
    warnings,
    buildCheckpoint(),
  );
};
