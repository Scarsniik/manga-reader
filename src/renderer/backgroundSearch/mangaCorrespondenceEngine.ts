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
  createScraperCardDetailsCache,
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import { processScraperListingPage } from "@/renderer/components/MultiSearch/listingSourcePageProcessing";
import { isScraperListingPaginationEndError } from "@/renderer/utils/scraperRuntime";
import type {
  BackgroundSearchExecutionResult,
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
  MangaCorrespondenceRejectedCandidate,
  MangaCorrespondenceRejectionReason,
} from "@/renderer/backgroundSearch/types";
import {
  doesCorrespondenceAnalyzedTitleMatchKnownTitle,
  partitionCorrespondenceAlternativeTitles,
  selectCorrespondenceDiscoverableTitles,
} from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
import { isBackgroundListingPaginationStalled } from "@/renderer/backgroundSearch/backgroundListingBlacklist";
import { runAuthorCorrespondenceSearch } from "@/renderer/backgroundSearch/authorCorrespondenceEngine";
import { selectMangaCorrespondenceRomanizedSearchTerms } from "@/renderer/backgroundSearch/mangaCorrespondenceRomanization";
import {
  isClearlyDerivativeMangaCorrespondenceTitle,
  stripMangaCorrespondenceTrailingKnownAuthor,
} from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import { scoreMangaCorrespondenceRejectedCandidate } from "@/renderer/backgroundSearch/mangaCorrespondenceRejectedCandidates";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type DiscoveryTask = {
  kind: "title" | "author";
  term: string;
  parentId?: string;
  initialGeneratedVariant?: boolean;
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

export const runMangaCorrespondenceSearch = async (
  input: MangaCorrespondenceBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
  previousResult?: MangaCorrespondenceBackgroundResult,
): Promise<MangaCorrespondenceBackgroundResult> => {
  const scrapers = selectScrapers(input);
  if (!scrapers.length) throw new Error("Aucun scrapper compatible n'est sélectionné.");

  const concurrency = Math.max(1, Math.floor(input.scrapingConcurrency));
  const pace = { ...getPaceConfig(input.paceMode), concurrency };
  const detailsCache = createScraperCardDetailsCache();
  const maxPages = input.maxPages === null ? 250 : Math.max(1, input.maxPages);
  const referenceScraper = scrapers.find((scraper) => scraper.id === input.reference.scraperId) ?? scrapers[0];
  const referenceAnalysis = analyzeMangaCorrespondenceTitle(
    input.reference.rawTitle,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(referenceScraper, "titleAnalysis")),
  );
  const isContinuation = Boolean(input.continuation && previousResult);
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
  const knownTitles = uniqueText([
    input.reference.title,
    ...input.reference.alternativeTitles,
    ...acceptedSearchSeeds.flatMap((candidate) => [
      candidate.analyzedTitle,
      ...candidate.alternativeTitles,
    ]),
  ]);
  const referenceChapter = input.reference.chapter
    || referenceAnalysis.chapter
    || inferMangaCorrespondenceFirstChapter(referenceAnalysis, knownTitles);
  const trace: MangaCorrespondenceTraceStep[] = isContinuation
    ? [...(previousResult?.trace ?? [])]
    : [];
  const matches = new Map<string, MangaCorrespondenceMatch>(
    (isContinuation ? previousResult?.matches ?? [] : []).map((match) => [match.key, match]),
  );
  acceptedPreviousCandidates.forEach((candidate) => {
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
  const rejectedCandidates = new Map<string, MangaCorrespondenceRejectedCandidate>(
    previousRejectedCandidates.map((candidate) => [candidate.key, {
      ...candidate,
      searchSeedUsedInPass: acceptedSearchSeedKeys.has(candidate.key)
        ? currentPassNumber
        : candidate.searchSeedUsedInPass,
    }]),
  );
  const rejectedKeysSeen = new Set(previousRejectedCandidates.map((candidate) => candidate.key));
  let rejectedCandidateCount = Math.max(
    previousResult?.rejectedCandidateCount ?? 0,
    rejectedKeysSeen.size,
  );
  const knownAuthors = uniqueText([
    ...input.reference.authors,
    ...acceptedSearchSeeds.flatMap((candidate) => candidate.authors),
  ]);
  const romanizedTitleVariantsByKey = new Map<string, string[]>();
  const searchedTitles: string[] = isContinuation ? [...(previousResult?.searchedTitles ?? [])] : [];
  const searchedAuthors: string[] = isContinuation ? [...(previousResult?.searchedAuthors ?? [])] : [];
  const queuedKeys = new Set<string>([
    ...searchedTitles.map((term) => `title:${normalizeKey(term)}:`),
    ...searchedAuthors.map((term) => `author:${normalizeKey(term)}:`),
  ]);
  const extractedAuthorSourceKeys = new Set<string>();
  const resolvedAuthorPageKeys = new Set<string>();
  const queue: DiscoveryTask[] = [];
  let processedTasks = 0;
  let balancedKind: DiscoveryTask["kind"] = "title";

  const addTask = (task: DiscoveryTask): void => {
    const key = `${task.kind}:${normalizeKey(task.term)}:${task.directTargets?.map((entry) => `${entry.scraper.id}:${entry.url}`).join("|") ?? ""}`;
    if (!normalizeKey(task.term) || queuedKeys.has(key) || queue.length + processedTasks >= MAX_DISCOVERY_TASKS) return;
    queuedKeys.add(key);
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

  const initialTitleTasks = isContinuation
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
  (isContinuation ? initialTitleTasks : knownTitles).forEach((title) => {
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
  const initialAuthorTasks = isContinuation
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
  if (!isContinuation) input.reference.authorUrls.forEach((url) => {
    const scraper = scrapers.find((entry) => entry.id === input.reference.scraperId);
    if (scraper) addTask({ kind: "author", term: knownAuthors[0] || url, directTargets: [{ scraper, url }] });
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
    ),
    {
      completedUnits: processedTasks,
      totalUnits: processedTasks + queue.length,
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
    const existing = rejectedCandidates.get(key);
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
  const discoverFromSources = async (
    sources: MultiSearchSourceResult[],
    step: MangaCorrespondenceTraceStep,
  ): Promise<void> => {
    let accepted = 0;
    const acceptedSources: MultiSearchSourceResult[] = [];
    sources.forEach((source) => {
      const analyzed = sourceMatchesReference(
        input,
        source,
        knownTitles,
        knownAuthors,
        romanizedTitleVariantsByKey,
      );
      if (!analyzed.matchedTerm) {
        storeRejectedCandidate(
          source,
          analyzed,
          analyzed.derivative ? "derivative" : "titleMismatch",
          step,
        );
        return;
      }
      if (
        input.request === "sameManga"
        && referenceChapter
        && analyzed.chapter
        && !doMangaCorrespondenceChaptersOverlap(referenceChapter, analyzed.chapter)
      ) {
        storeRejectedCandidate(source, analyzed, "chapterMismatch", step);
        return;
      }
      const key = buildMultiSearchSourceIdentityKey(source);
      if (rejectedCandidates.get(key)?.decision === "dismissed") return;
      const existing = matches.get(key);
      rejectedCandidates.delete(key);
      matches.set(key, {
        key,
        source,
        analyzedTitle: analyzed.analyzedTitle,
        alternativeTitles: analyzed.alternativeTitles,
        authors: analyzed.authors,
        chapter: analyzed.chapter,
        chapterOverride: existing?.chapterOverride,
        matchedTerm: analyzed.matchedTerm,
        discoveredByStepIds: uniqueText([...(existing?.discoveredByStepIds ?? []), step.id]),
        acceptedManually: existing?.acceptedManually,
      });
      accepted += existing ? 0 : 1;
      acceptedSources.push(source);
      analyzed.authors.forEach((author) => {
        if (knownAuthors.length >= MAX_DISCOVERED_AUTHORS || knownAuthors.some((value) => normalizeKey(value) === normalizeKey(author))) return;
        knownAuthors.push(author);
        const authorStep = addTrace("authorDiscovered", "Auteur correspondant trouvé", author, step.id);
        addTask({ kind: "author", term: author, parentId: authorStep.id });
      });
      const directAuthorUrls = uniqueText([source.result.authorUrl, ...(source.result.authorUrls ?? [])]);
      if (directAuthorUrls.length) {
        addTask({
          kind: "author",
          term: analyzed.authors[0] || directAuthorUrls[0],
          parentId: step.id,
          directTargets: directAuthorUrls.map((url) => ({ scraper: source.scraper, url })),
        });
      }
      analyzed.discoverableTitles.forEach((title) => {
        if (knownTitles.length >= MAX_DISCOVERED_TITLES || knownTitles.some((value) => normalizeKey(value) === normalizeKey(title))) return;
        knownTitles.push(title);
        const titleStep = addTrace("titleDiscovered", "Titre correspondant trouvé", title, step.id);
        addTask({ kind: "title", term: title, parentId: titleStep.id });
      });
    });
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
        { concurrency, signal },
      );
      extracted.authors.forEach((author) => {
        const authorStep = addTrace("authorDiscovered", "Page auteur correspondante trouvée", author.name, step.id);
        if (knownAuthors.length < MAX_DISCOVERED_AUTHORS && !knownAuthors.some((value) => normalizeKey(value) === normalizeKey(author.name))) {
          knownAuthors.push(author.name);
        }
        const scraper = scrapers.find((entry) => entry.id === author.scraperId);
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
    step.detail = `${sources.length} résultat(s) analysé(s), ${accepted} nouvelle(s) correspondance(s).`;
  };

  const loadSearch = async (
    scraper: ScraperRecord,
    term: string,
    pageLimit = maxPages,
  ): Promise<MultiSearchSourceResult[]> => {
    if (!isSearchableScraper(scraper)) return [];
    const results: MultiSearchSourceResult[] = [];
    const resultKeys = new Set<string>();
    let nextPageUrl: string | undefined;
    for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
      if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
      try {
        const requestedPageUrl = nextPageUrl;
        const page = await fetchSearchPageWithRetry(scraper, getSearchConfig(scraper), term, pageIndex, nextPageUrl, pace, {
          scrapeDetailsWithCards: input.scrapeDetailsWithCards,
          detailsCache,
        });
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
          || !resolveHasNextPage(getSearchConfig(scraper), page)
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
    let nextPageUrl: string | undefined;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
      try {
        const requestedPageUrl = nextPageUrl;
        const page = await fetchAuthorPageWithRetry(
          scraper,
          getAuthorConfig(scraper),
          term,
          pageIndex,
          nextPageUrl,
          pace,
          templateContext ?? null,
          { scrapeDetailsWithCards: input.scrapeDetailsWithCards, detailsCache },
        );
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
          || !resolveHasNextAuthorPage(getAuthorConfig(scraper), page)
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
    const isTitle = task.kind === "title";
    const searched = isTitle ? searchedTitles : searchedAuthors;
    searched.push(task.term);
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
        scrapeDetailsWithCards: input.scrapeDetailsWithCards,
      };
      try {
        const authorResult = await runAuthorCorrespondenceSearch(
          authorInput,
          signal,
          async () => {},
        );
        await runWithConcurrency(authorResult.matches.map((authorMatch) => async () => {
          if (resolvedAuthorPageKeys.has(authorMatch.key)) return;
          resolvedAuthorPageKeys.add(authorMatch.key);
          const scraper = scrapers.find((entry) => entry.id === authorMatch.scraperId);
          if (!scraper) return;

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
    processedTasks += 1;
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
  );
};
