import type {
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceReferenceSource,
  BackgroundSearchProgress,
  MangaCorrespondenceBackgroundInput,
} from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  AuthorCorrespondenceMatch,
  BackgroundSearchExecutionResult,
} from "@/renderer/backgroundSearch/types";
import {
  createAuthorCorrespondenceSessionCacheSnapshot,
  hydrateAuthorCorrespondenceSessionCache,
  publishAuthorCorrespondenceSessionCache,
  recordAuthorCorrespondenceAdvancedDiscoveries,
  startAuthorCorrespondenceAdvancedDiscoveryBatch,
  type AuthorCorrespondenceMangaEnrichment,
  type AuthorCorrespondenceSessionCacheSnapshot,
} from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import { mergeAuthorCorrespondenceSessionResults } from "@/renderer/backgroundSearch/authorCorrespondenceSessionResults";
import { buildInitialAuthorCorrespondenceDiscoveries } from "@/renderer/backgroundSearch/authorCorrespondenceDiscoveries";
import { readAuthorCorrespondenceInvalidations } from "@/renderer/backgroundSearch/authorCorrespondenceInvalidations";
import {
  analyzeAdvancedAuthorAliases,
  mergeAuthorCorrespondenceRejectedAuthorCandidates,
} from "@/renderer/backgroundSearch/authorCorrespondenceRejectedAuthors";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import {
  resolveAuthorCorrespondenceAdvancedBatchSize,
  selectAuthorCorrespondenceAdvancedSeeds,
  type AuthorCorrespondenceAdvancedSeed,
} from "@/renderer/searchEngines/authorCorrespondenceAdvancedSelection";
import { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
import { isAuthorCorrespondenceNameSearchSourceVerified } from "@/renderer/searchEngines/authorCorrespondenceNameSearchSources";
import { collectMangaCorrespondenceAuthors } from "@/renderer/searchEngines/authorCorrespondenceMangaDiscovery";
import { loadAuthorCorrespondenceSessionListings } from "@/renderer/searchEngines/authorCorrespondenceSessionListings";
import { runMangaCorrespondenceSearch } from "@/renderer/searchEngines/mangaCorrespondenceSearchEngine";
import type { SearchExecutionContext } from "@/renderer/searchEngines/searchExecutionContext";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import { inferMangaCorrespondenceFirstChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import { resolveCompatibleMangaAuthorName } from "@/renderer/utils/mangaMatching/titleProfiles";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";
import {
  buildAuthorCorrespondenceMatchKey,
  dedupeAuthorCorrespondenceReferenceSources,
} from "@/renderer/utils/authorCorrespondenceIdentity";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

const uniqueText = (values: Array<string | null | undefined>): string[] => Array.from(new Set(
  values.map((value) => value?.trim() ?? "").filter(Boolean),
));

const mergeNameSearchSources = (
  currentSources: MultiSearchSourceResult[] | undefined,
  incomingSources: MultiSearchSourceResult[] | undefined,
): MultiSearchSourceResult[] => {
  const sourcesByKey = new Map<string, MultiSearchSourceResult>();
  [...(currentSources ?? []), ...(incomingSources ?? [])]
    .filter(isAuthorCorrespondenceNameSearchSourceVerified)
    .forEach((source) => {
      sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
    });
  return Array.from(sourcesByKey.values());
};

export const buildAuthorCorrespondenceManualMangaSources = (
  input: AuthorCorrespondenceBackgroundInput,
): MultiSearchSourceResult[] => {
  const sources = (input.mangaReferences ?? []).flatMap((reference) => {
    const scraper = input.scrapers.find((candidate) => candidate.id === reference.scraperId);
    if (!scraper || !reference.sourceUrl.trim() || !reference.title.trim()) return [];
    return [{
      scraper,
      result: {
        title: reference.rawTitle || reference.title,
        detailUrl: reference.sourceUrl,
        detailsMetadataFetched: true,
        detailsTitle: reference.rawTitle || reference.title,
        detailsSourceUrl: reference.sourceUrl,
        authorNames: reference.authors,
        authorUrls: reference.authorUrls,
      },
      searchTerm: reference.title,
      pageIndex: 1,
      sourceLanguageCodes: [],
      detectedLanguageCodes: [],
      tentativeAuthorNames: reference.authors,
      contextualAuthorNames: reference.authors,
      advancedRomanizedTitleVariants: [],
      advancedRomanizedTentativeAuthorNameVariants: [],
      advancedRomanizedContextualAuthorNameVariants: [],
      contentTypes: [],
      canOpenDetails: true,
    } satisfies MultiSearchSourceResult];
  });
  return Array.from(new Map(sources.map((source) => [
    buildMultiSearchSourceIdentityKey(source),
    source,
  ])).values());
};

type AdvancedProgressSummary = NonNullable<AuthorCorrespondenceBackgroundResult["advancedSearch"]>;

export const buildAuthorCorrespondenceAdvancedProgressSummary = (options: {
  batchCompleted: boolean;
  completedBatchCount: number;
  requestedBatchCount: number;
  completedSeedCount: number;
  processedMangaCount: number;
  discoveredMangaSourceCount: number;
  discoveredAuthorMatchKeys: string[];
  remainingCandidateCount: number;
  pendingAuthorNames: string[];
  pendingAuthorReferenceSources: AuthorCorrespondenceReferenceSource[];
  safetyWarnings?: NonNullable<AdvancedProgressSummary["safetyWarnings"]>;
}): AdvancedProgressSummary => {
  const pendingAuthorNames = buildUniqueAuthorSearchNames(options.pendingAuthorNames);
  const pendingAuthorReferenceSources = dedupeAuthorCorrespondenceReferenceSources(
    options.pendingAuthorReferenceSources,
  );
  return {
    completedBatchCount: options.batchCompleted
      ? Math.max(options.completedBatchCount, options.requestedBatchCount)
      : options.completedBatchCount,
    lastBatchMangaCount: options.completedSeedCount,
    processedMangaCount: options.processedMangaCount,
    discoveredMangaSourceCount: options.discoveredMangaSourceCount,
    discoveredAuthorPageCount: options.discoveredAuthorMatchKeys.length,
    discoveredAuthorMatchKeys: options.discoveredAuthorMatchKeys,
    remainingCandidateCount: options.remainingCandidateCount,
    ...(pendingAuthorNames.length ? { pendingAuthorNames } : {}),
    ...(pendingAuthorReferenceSources.length ? { pendingAuthorReferenceSources } : {}),
    ...(options.safetyWarnings?.length ? {
      safetyWarnings: options.safetyWarnings,
      automaticMangaReplayBlocked: true,
    } : {}),
  };
};

const collectActiveAuthorSources = (
  cache: AuthorCorrespondenceSessionCacheSnapshot,
  input: AuthorCorrespondenceBackgroundInput,
  result: AuthorCorrespondenceBackgroundResult,
  liveInvalidatedMatchKeys: ReadonlySet<string> = new Set(),
): MultiSearchSourceResult[] => {
  const invalidatedMatchKeys = new Set([
    ...(input.advancedSearch?.invalidatedAuthorMatchKeys ?? []),
    ...liveInvalidatedMatchKeys,
  ]);
  const activeRunKeys = new Set(result.matches
    .filter((match) => !invalidatedMatchKeys.has(match.key))
    .map((match) => `${match.scraperId}::${match.authorUrl}`));
  const sources = cache.runs
    .filter((run) => activeRunKeys.has(run.key))
    .flatMap((run) => run.results);
  return Array.from(new Map([
    ...sources,
    ...buildAuthorCorrespondenceManualMangaSources(input),
  ].map((source) => [buildMultiSearchSourceIdentityKey(source), source])).values());
};

export const isAuthorCorrespondenceAdvancedSeedActive = (options: {
  seed: AuthorCorrespondenceAdvancedSeed;
  cache: AuthorCorrespondenceSessionCacheSnapshot;
  matches: AuthorCorrespondenceMatch[];
  invalidatedMatchKeys: ReadonlySet<string>;
  additionalActiveSourceKeys?: ReadonlySet<string>;
}): boolean => {
  const activeRunKeys = new Set(options.matches
    .filter((match) => !options.invalidatedMatchKeys.has(match.key))
    .map((match) => `${match.scraperId}::${match.authorUrl}`));
  const activeSourceKeys = new Set(options.cache.runs
    .filter((run) => activeRunKeys.has(run.key))
    .flatMap((run) => run.results.map(buildMultiSearchSourceIdentityKey)));
  return options.seed.anchorSourceKeys.some((sourceKey) => (
    activeSourceKeys.has(sourceKey) || options.additionalActiveSourceKeys?.has(sourceKey)
  ));
};

const mergeMatches = (
  currentMatches: AuthorCorrespondenceMatch[],
  incomingMatches: AuthorCorrespondenceMatch[],
): AuthorCorrespondenceMatch[] => {
  const matchesByKey = new Map(currentMatches.map((match) => [
    buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl),
    match,
  ]));
  incomingMatches.forEach((match) => {
    const key = buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl);
    const current = matchesByKey.get(key);
    if (!current) {
      matchesByKey.set(key, match);
      return;
    }
    const previewsByKey = new Map(
      [...current.previewSources, ...match.previewSources].map((source) => [
        buildMultiSearchSourceIdentityKey(source),
        source,
      ]),
    );
    matchesByKey.set(key, {
      ...current,
      ...match,
      templateContext: match.templateContext ?? current.templateContext,
      discoveryMethods: Array.from(new Set([
        ...current.discoveryMethods,
        ...match.discoveryMethods,
      ])),
      previewSources: Array.from(previewsByKey.values()).slice(0, 6),
    });
  });
  return Array.from(matchesByKey.values()).sort((left, right) => (
    left.authorName.localeCompare(right.authorName)
    || left.scraperName.localeCompare(right.scraperName)
  ));
};

export { collectEvidenceBackedAdvancedAuthorAliases } from "@/renderer/backgroundSearch/authorCorrespondenceRejectedAuthors";

export const filterIncompatibleAdvancedAuthorMatches = (options: {
  matches: AuthorCorrespondenceMatch[];
  discoveredMatchKeys: string[];
  referenceNames: string[];
}): AuthorCorrespondenceMatch[] => {
  const discoveredMatchKeys = new Set(options.discoveredMatchKeys);
  const referenceNames = buildUniqueAuthorSearchNames(options.referenceNames);
  if (!discoveredMatchKeys.size || !referenceNames.length) return options.matches;

  return options.matches.filter((match) => {
    const key = buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl);
    if (!discoveredMatchKeys.has(key)) return true;

    return Boolean(
      resolveCompatibleMangaAuthorName(match.authorName, referenceNames)
      || resolveCompatibleMangaAuthorName(match.matchedName, referenceNames),
    );
  });
};

const analyzeAdvancedSeedSourceTitle = (source: MultiSearchSourceResult) => (
  analyzeMangaCorrespondenceTitle(
    source.result.title,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis")),
  )
);

export const buildAuthorCorrespondenceAdvancedMangaInput = (
  input: AuthorCorrespondenceBackgroundInput,
  seed: AuthorCorrespondenceAdvancedSeed,
  referenceNames = buildUniqueAuthorSearchNames([
    input.referenceName,
    ...(input.names ?? []),
  ]),
): MangaCorrespondenceBackgroundInput => {
  const referenceAnalysis = analyzeAdvancedSeedSourceTitle(seed.referenceSource);
  const parsedTitles = uniqueText(seed.result.sources.flatMap((source) => {
    const analysis = analyzeAdvancedSeedSourceTitle(source);
    return [analysis.title, ...analysis.alternativeTitles];
  }));
  const referenceTitle = referenceAnalysis.title || seed.result.title;
  const referenceChapter = referenceAnalysis.chapter
    ?? inferMangaCorrespondenceFirstChapter(referenceAnalysis, parsedTitles);
  const resolveAuthorName = (authorName: string): string | undefined => (
    referenceNames.length
      ? resolveCompatibleMangaAuthorName(authorName, referenceNames)
      : authorName.trim() || undefined
  );
  const authors = uniqueText(seed.result.sources.flatMap((source) => [
    ...(source.result.authorNames ?? []),
    ...source.tentativeAuthorNames,
    ...(source.contextualAuthorNames ?? []),
  ].map(resolveAuthorName)));
  const referenceAuthorUrls = (seed.referenceSource.result.authorUrls?.length
    ? seed.referenceSource.result.authorUrls
    : seed.referenceSource.result.authorUrl
      ? [seed.referenceSource.result.authorUrl]
      : []);
  const referenceSourceAuthorNames = seed.referenceSource.result.authorNames?.length
    ? seed.referenceSource.result.authorNames
    : seed.referenceSource.contextualAuthorNames?.length
      ? seed.referenceSource.contextualAuthorNames
      : seed.referenceSource.tentativeAuthorNames;
  const authorUrls = uniqueText(referenceAuthorUrls.filter((_authorUrl, index) => {
    if (!referenceNames.length) return true;
    const authorName = referenceSourceAuthorNames[index]
      ?? (referenceAuthorUrls.length === 1 ? referenceSourceAuthorNames[0] : undefined);
    return Boolean(authorName && resolveAuthorName(authorName));
  }));

  return {
    reference: {
      scraperId: seed.referenceSource.scraper.id,
      sourceUrl: seed.referenceSource.result.detailUrl ?? "",
      rawTitle: seed.referenceSource.result.title,
      title: referenceTitle,
      alternativeTitles: uniqueText([
        ...referenceAnalysis.alternativeTitles,
        ...parsedTitles,
      ]).filter((title) => title !== referenceTitle),
      authors,
      authorUrls,
      ...(referenceChapter ? { chapter: referenceChapter } : {}),
    },
    ...(referenceNames.length ? { authorPropagationReferenceNames: referenceNames } : {}),
    request: "sameManga",
    strategy: "titleFirst",
    scraperFilterValues: input.scraperFilterValues,
    scrapers: input.scrapers,
    maxPages: input.maxPages,
    paceMode: input.paceMode,
    scrapingConcurrency: input.scrapingConcurrency,
    scrapeDetailsWithCards: input.scrapeDetailsWithCards,
    enableRomajiPhoneticMerge: input.advancedSearch?.enableRomajiPhoneticMerge === true,
    safety: input.correspondenceSafety,
  };
};

const mergeEnrichment = (
  enrichments: AuthorCorrespondenceMangaEnrichment[],
  seed: AuthorCorrespondenceAdvancedSeed,
  sources: MultiSearchSourceResult[],
): AuthorCorrespondenceMangaEnrichment[] => {
  const existing = enrichments.find((enrichment) => enrichment.seedKey === seed.key);
  const sourcesByKey = new Map([
    ...(existing?.sources ?? []),
    ...sources,
  ].map((source) => [buildMultiSearchSourceIdentityKey(source), source]));
  const next: AuthorCorrespondenceMangaEnrichment = {
    seedKey: seed.key,
    anchorSourceKeys: seed.anchorSourceKeys,
    sources: Array.from(sourcesByKey.values()),
  };
  return [
    ...enrichments.filter((enrichment) => enrichment.seedKey !== seed.key),
    next,
  ];
};

const createCacheController = (jobId?: string) => {
  let localCache = createAuthorCorrespondenceSessionCacheSnapshot();
  const read = async (): Promise<AuthorCorrespondenceSessionCacheSnapshot> => (
    jobId ? hydrateAuthorCorrespondenceSessionCache(jobId) : localCache
  );
  const publish = async (
    updater: (
      current: AuthorCorrespondenceSessionCacheSnapshot,
    ) => AuthorCorrespondenceSessionCacheSnapshot,
  ): Promise<AuthorCorrespondenceSessionCacheSnapshot> => {
    if (jobId) return publishAuthorCorrespondenceSessionCache(jobId, updater);
    localCache = {
      ...updater(localCache),
      revision: localCache.revision + 1,
    };
    return localCache;
  };
  return { read, publish };
};

export const runAuthorCorrespondenceAdvancedSearch = async (
  input: AuthorCorrespondenceBackgroundInput,
  initialResult: AuthorCorrespondenceBackgroundResult,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
  executionContext: SearchExecutionContext,
): Promise<AuthorCorrespondenceBackgroundResult> => {
  const request = input.advancedSearch;
  if (!request?.enabled) return initialResult;
  const jobId = executionContext.backgroundJobId ?? `memory:${input.referenceName}`;
  const readLiveInvalidatedMatchKeys = (): Set<string> => new Set([
    ...(request.invalidatedAuthorMatchKeys ?? []),
    ...(executionContext.backgroundJobId
      ? readAuthorCorrespondenceInvalidations(executionContext.backgroundJobId)
      : []),
  ]);
  const buildLiveInput = (): AuthorCorrespondenceBackgroundInput => ({
    ...input,
    advancedSearch: {
      ...request,
      invalidatedAuthorMatchKeys: Array.from(readLiveInvalidatedMatchKeys()),
    },
  });
  const inputReferenceNames = buildUniqueAuthorSearchNames([
    input.referenceName,
    ...(input.names ?? []),
  ]);
  const cacheController = createCacheController(executionContext.backgroundJobId);
  let cache = await cacheController.read();
  const manualMangaSources = buildAuthorCorrespondenceManualMangaSources(input);
  const manualMangaSourceKeys = new Set(
    manualMangaSources.map(buildMultiSearchSourceIdentityKey),
  );
  const hasUnprocessedManualManga = manualMangaSources.some((source) => (
    !cache.processedMangaKeys.includes(buildMultiSearchSourceIdentityKey(source))
  ));
  const cachedAliasAnalysis = analyzeAdvancedAuthorAliases({
    enrichments: cache.mangaEnrichments,
    authorSources: collectActiveAuthorSources(
      cache,
      input,
      initialResult,
      readLiveInvalidatedMatchKeys(),
    ),
    referenceNames: inputReferenceNames,
  });
  const cachedAliases = cachedAliasAnalysis.acceptedAliases;
  const referenceNames = buildUniqueAuthorSearchNames([
    ...inputReferenceNames,
    ...cachedAliases.map((alias) => alias.name),
  ]);
  const historicalDiscoveredMatchKeys = Array.from(new Set([
    ...cache.discoveredAuthorMatchKeys,
    ...(initialResult.advancedSearch?.discoveredAuthorMatchKeys ?? []),
  ]));
  const retainedMatches = filterIncompatibleAdvancedAuthorMatches({
    matches: initialResult.matches,
    discoveredMatchKeys: historicalDiscoveredMatchKeys,
    referenceNames,
  });
  const isCompatibleReferenceName = (authorName: string): boolean => Boolean(
    resolveCompatibleMangaAuthorName(authorName, referenceNames),
  );
  let result: AuthorCorrespondenceBackgroundResult = {
    ...initialResult,
    matches: retainedMatches,
    searchedNames: initialResult.searchedNames.filter(isCompatibleReferenceName),
    nameSearchSources: initialResult.nameSearchSources?.filter((source) => (
      isAuthorCorrespondenceNameSearchSourceVerified(source)
      && isCompatibleReferenceName(source.searchTerm)
    )),
    rejectedAuthorCandidates: mergeAuthorCorrespondenceRejectedAuthorCandidates([
      ...(initialResult.rejectedAuthorCandidates ?? []),
      ...cachedAliasAnalysis.rejectedCandidates,
    ]),
    discoveries: initialResult.discoveries?.filter((discovery) => (
      discovery.kind !== "author" || isCompatibleReferenceName(discovery.value)
    )),
    advancedSearch: initialResult.advancedSearch ? {
      ...initialResult.advancedSearch,
      discoveredAuthorPageCount: 0,
      discoveredAuthorMatchKeys: [],
      safetyWarnings: undefined,
      automaticMangaReplayBlocked: false,
    } : undefined,
  };
  cache = await cacheController.publish((current) => (
    startAuthorCorrespondenceAdvancedDiscoveryBatch(
      current,
      historicalDiscoveredMatchKeys,
    )
  ));
  await onSnapshot(result, {
    completedUnits: 0,
    totalUnits: 0,
    resultCount: result.matches.length,
    currentLabel: "Préparation · nouvelle vague d’approfondissement",
  });
  const requestedBatchCount = Math.max(1, Math.floor(request.requestedBatchCount));
  const completedBatchCount = result.advancedSearch?.completedBatchCount ?? 0;
  const existingAuthorNameKeys = new Set([
    ...result.searchedNames,
    ...result.matches.flatMap((match) => [match.authorName, match.matchedName]),
  ].map(normalizeFuzzyText));
  const hasUnsearchedCachedAlias = cachedAliases.some((alias) => (
    !existingAuthorNameKeys.has(normalizeFuzzyText(alias.name))
  ));
  const hasUnsearchedInputName = inputReferenceNames.some((authorName) => (
    !existingAuthorNameKeys.has(normalizeFuzzyText(authorName))
  ));
  if (
    requestedBatchCount <= completedBatchCount
    && cache.processedMangaKeys.length
    && !hasUnsearchedCachedAlias
    && !hasUnsearchedInputName
    && !hasUnprocessedManualManga
  ) return result;
  const remainingBatchSize = resolveAuthorCorrespondenceAdvancedBatchSize({
    batchSize: request.batchSize,
    cachedMangaCount: cache.mangaEnrichments.length,
    requestedBatchCount,
    requestedProcessedMangaCount: request.requestedProcessedMangaCount,
  });

  const emitProgress = async (label: string, completedUnits = 0, totalUnits = 0) => {
    await onSnapshot(result, {
      completedUnits,
      totalUnits,
      resultCount: result.matches.length,
      currentLabel: label,
    });
  };
  cache = await loadAuthorCorrespondenceSessionListings({
    jobId,
    input: buildLiveInput(),
    result,
    cache,
    signal,
    executionContext,
    publishCache: cacheController.publish,
    onProgress: (label) => emitProgress(`Préparation · ${label}`),
  });

  const authorSources = collectActiveAuthorSources(
    cache,
    input,
    result,
    readLiveInvalidatedMatchKeys(),
  );
  const authorSourceKeys = new Set(authorSources.map(buildMultiSearchSourceIdentityKey));
  const mergeOptions = {
    enableRomajiPhoneticMerge: request.enableRomajiPhoneticMerge === true,
    preferredTitleLanguageCodes: [],
  };
  const mergedResults = mergeAuthorCorrespondenceSessionResults(
    authorSources,
    cache.mangaEnrichments,
    mergeOptions,
  );
  const processedMangaKeys = new Set(cache.processedMangaKeys);
  const unprocessedManualMangaCount = Array.from(manualMangaSourceKeys).filter((sourceKey) => (
    !processedMangaKeys.has(sourceKey)
  )).length;
  let completedSeedCount = 0;
  const safetyWarnings: NonNullable<AdvancedProgressSummary["safetyWarnings"]> = [];
  const resolveAdvancedAuthorName = (authorName: string): string | undefined => (
    resolveCompatibleMangaAuthorName(authorName, referenceNames)
  );
  const discoveredNames = (result.advancedSearch?.pendingAuthorNames ?? [])
    .map(resolveAdvancedAuthorName)
    .filter((authorName): authorName is string => Boolean(authorName));
  discoveredNames.push(
    ...inputReferenceNames,
    ...cachedAliases.map((alias) => alias.name),
  );
  const discoveredReferenceSources = (result.advancedSearch?.pendingAuthorReferenceSources ?? [])
    .flatMap((source) => {
      const name = resolveAdvancedAuthorName(source.name);
      return name ? [{ ...source, name }] : [];
    });
  const updateAdvancedProgressResult = (
    batchCompleted: boolean,
    pendingAuthorNames = discoveredNames,
    pendingAuthorReferenceSources = discoveredReferenceSources,
  ): AuthorCorrespondenceBackgroundResult => {
    const liveInvalidatedMatchKeys = readLiveInvalidatedMatchKeys();
    const refreshedAuthorSources = collectActiveAuthorSources(
      cache,
      input,
      result,
      liveInvalidatedMatchKeys,
    );
    const refreshedAuthorSourceKeys = new Set(
      refreshedAuthorSources.map(buildMultiSearchSourceIdentityKey),
    );
    const refreshedResults = mergeAuthorCorrespondenceSessionResults(
      refreshedAuthorSources,
      cache.mangaEnrichments,
      mergeOptions,
    );
    const remainingCandidateCount = selectAuthorCorrespondenceAdvancedSeeds(
      refreshedResults,
      refreshedAuthorSourceKeys,
      new Set(cache.processedMangaKeys),
      Number.MAX_SAFE_INTEGER,
    ).length;
    const discoveredMangaSourceCount = new Set(cache.mangaEnrichments.flatMap((enrichment) => (
      enrichment.sources.map(buildMultiSearchSourceIdentityKey)
    ))).size;
    const resultMatchKeys = new Set(result.matches
      .filter((match) => !liveInvalidatedMatchKeys.has(match.key))
      .map((match) => buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl)));
    const discoveredAuthorMatchKeys = Array.from(new Set([
      ...cache.newAuthorMatchKeys,
      ...(result.advancedSearch?.discoveredAuthorMatchKeys ?? []),
    ])).filter((matchKey) => resultMatchKeys.has(matchKey));
    return {
      ...result,
      advancedSearch: buildAuthorCorrespondenceAdvancedProgressSummary({
        batchCompleted,
        completedBatchCount,
        requestedBatchCount,
        completedSeedCount,
        processedMangaCount: cache.mangaEnrichments.length,
        discoveredMangaSourceCount,
        discoveredAuthorMatchKeys,
        remainingCandidateCount,
        pendingAuthorNames,
        pendingAuthorReferenceSources,
        safetyWarnings,
      }),
    };
  };
  const unlimitedBatch = Math.floor(request.batchSize) === 0;
  const selectionSize = remainingBatchSize === Number.MAX_SAFE_INTEGER
    ? remainingBatchSize
    : Math.max(remainingBatchSize, unprocessedManualMangaCount);
  const prioritizedMergedResults = [...mergedResults].sort((left, right) => {
    const leftManual = left.sources.some((source) => (
      manualMangaSourceKeys.has(buildMultiSearchSourceIdentityKey(source))
    ));
    const rightManual = right.sources.some((source) => (
      manualMangaSourceKeys.has(buildMultiSearchSourceIdentityKey(source))
    ));
    return Number(rightManual) - Number(leftManual);
  });
  const seeds = selectionSize
    ? selectAuthorCorrespondenceAdvancedSeeds(
      prioritizedMergedResults,
      authorSourceKeys,
      processedMangaKeys,
      selectionSize,
    )
    : [];
  const scheduledMangaSourceKeys = new Set(seeds.flatMap((seed) => seed.anchorSourceKeys));
  const appendNewUnlimitedSeeds = () => {
    if (!unlimitedBatch) return;
    const liveInvalidatedMatchKeys = readLiveInvalidatedMatchKeys();
    const refreshedAuthorSources = collectActiveAuthorSources(
      cache,
      input,
      result,
      liveInvalidatedMatchKeys,
    );
    const refreshedAuthorSourceKeys = new Set(
      refreshedAuthorSources.map(buildMultiSearchSourceIdentityKey),
    );
    const refreshedResults = mergeAuthorCorrespondenceSessionResults(
      refreshedAuthorSources,
      cache.mangaEnrichments,
      mergeOptions,
    );
    selectAuthorCorrespondenceAdvancedSeeds(
      refreshedResults,
      refreshedAuthorSourceKeys,
      new Set(cache.processedMangaKeys),
      0,
    ).forEach((seed) => {
      if (seed.anchorSourceKeys.some((sourceKey) => scheduledMangaSourceKeys.has(sourceKey))) {
        return;
      }
      seed.anchorSourceKeys.forEach((sourceKey) => scheduledMangaSourceKeys.add(sourceKey));
      seeds.push(seed);
    });
  };
  const attemptedReferenceSourceKeys = new Set<string>();
  const collectPendingAuthorNames = (): string[] => {
    const searchedNameKeys = new Set(result.searchedNames.map(normalizeFuzzyText));
    return buildUniqueAuthorSearchNames(discoveredNames).filter((name) => (
      !searchedNameKeys.has(normalizeFuzzyText(name))
    ));
  };
  const collectPendingReferenceSources = (): AuthorCorrespondenceReferenceSource[] => {
    const currentMatchKeys = new Set(result.matches.map((match) => (
      buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl)
    )));
    return dedupeAuthorCorrespondenceReferenceSources(discoveredReferenceSources)
      .filter((source) => {
        const sourceKey = buildAuthorCorrespondenceMatchKey(source.scraperId, source.authorUrl);
        return !currentMatchKeys.has(sourceKey) && !attemptedReferenceSourceKeys.has(sourceKey);
      });
  };
  const flushAuthorDiscoveries = async (
    progressPrefix: string,
    completedUnits: number,
  ): Promise<void> => {
    const aliasAnalysis = analyzeAdvancedAuthorAliases({
      enrichments: cache.mangaEnrichments,
      authorSources: collectActiveAuthorSources(
        cache,
        input,
        result,
        readLiveInvalidatedMatchKeys(),
      ),
      referenceNames: inputReferenceNames,
    });
    discoveredNames.push(...aliasAnalysis.acceptedAliases.map((alias) => alias.name));
    result = {
      ...result,
      rejectedAuthorCandidates: mergeAuthorCorrespondenceRejectedAuthorCandidates([
        ...(result.rejectedAuthorCandidates ?? []),
        ...aliasAnalysis.rejectedCandidates,
      ]),
    };

    const newNames = collectPendingAuthorNames();
    const newReferenceSources = collectPendingReferenceSources();
    const incrementalNames = buildUniqueAuthorSearchNames([
      ...newNames,
      ...newReferenceSources.map((source) => source.name),
    ]);
    result = updateAdvancedProgressResult(
      false,
      newNames,
      newReferenceSources,
    );
    if (!incrementalNames.length && !newReferenceSources.length) return;

    newReferenceSources.forEach((source) => {
      attemptedReferenceSourceKeys.add(buildAuthorCorrespondenceMatchKey(
        source.scraperId,
        source.authorUrl,
      ));
    });
    const matchKeysBeforeSearch = new Set(result.matches.map((match) => (
      buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl)
    )));
    const incrementalInput: AuthorCorrespondenceBackgroundInput = {
      ...input,
      referenceName: incrementalNames[0] ?? input.referenceName,
      names: incrementalNames,
      referenceSources: newReferenceSources,
      advancedSearch: undefined,
      mangaSeed: undefined,
      replay: undefined,
    };
    const incrementalResult = await runAuthorCorrespondenceSearch(
      incrementalInput,
      signal,
      async (partialResult, progress) => {
        const partialAuthorResult = partialResult as AuthorCorrespondenceBackgroundResult;
        const partialMatches = mergeMatches(result.matches, partialAuthorResult.matches);
        const partialNewMatchKeys = partialMatches
          .map((match) => buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl))
          .filter((matchKey) => !matchKeysBeforeSearch.has(matchKey));
        result = {
          ...result,
          matches: partialMatches,
          searchedNames: buildUniqueAuthorSearchNames([
            ...result.searchedNames,
            ...partialAuthorResult.searchedNames,
          ]),
          nameSearchSources: mergeNameSearchSources(
            result.nameSearchSources,
            partialAuthorResult.nameSearchSources,
          ),
          advancedSearch: result.advancedSearch ? {
            ...result.advancedSearch,
            discoveredAuthorPageCount: new Set([
              ...(result.advancedSearch.discoveredAuthorMatchKeys ?? []),
              ...partialNewMatchKeys,
            ]).size,
            discoveredAuthorMatchKeys: Array.from(new Set([
              ...(result.advancedSearch.discoveredAuthorMatchKeys ?? []),
              ...partialNewMatchKeys,
            ])),
          } : undefined,
        };
        result = updateAdvancedProgressResult(
          false,
          collectPendingAuthorNames(),
          collectPendingReferenceSources(),
        );
        await emitProgress(
          progress.currentLabel
            ? `${progressPrefix} · nouveaux auteurs · ${progress.currentLabel}`
            : `${progressPrefix} · recherche des nouvelles pages auteur`,
          completedUnits,
          seeds.length,
        );
      },
      executionContext,
    );
    const mergedMatches = mergeMatches(result.matches, incrementalResult.matches);
    const newMatchKeys = mergedMatches
      .map((match) => buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl))
      .filter((matchKey) => !matchKeysBeforeSearch.has(matchKey));
    result = {
      ...result,
      matches: mergedMatches,
      searchedNames: buildUniqueAuthorSearchNames([
        ...result.searchedNames,
        ...incrementalResult.searchedNames,
      ]),
      nameSearchSources: mergeNameSearchSources(
        result.nameSearchSources,
        incrementalResult.nameSearchSources,
      ),
    };
    cache = await cacheController.publish((current) => (
      recordAuthorCorrespondenceAdvancedDiscoveries(current, newMatchKeys)
    ));
    result = {
      ...result,
      discoveries: buildInitialAuthorCorrespondenceDiscoveries({
        ...input,
        names: result.searchedNames,
        referenceSources: dedupeAuthorCorrespondenceReferenceSources([
          ...input.referenceSources,
          ...discoveredReferenceSources,
        ]),
      }, result),
    };
    cache = await loadAuthorCorrespondenceSessionListings({
      jobId,
      input: buildLiveInput(),
      result,
      cache,
      signal,
      executionContext,
      publishCache: cacheController.publish,
      onProgress: (label) => emitProgress(
        `${progressPrefix} · nouvelles pages auteur · ${label}`,
        completedUnits,
        seeds.length,
      ),
    });
    result = updateAdvancedProgressResult(
      false,
      collectPendingAuthorNames(),
      collectPendingReferenceSources(),
    );
  };
  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    const seed = seeds[seedIndex];
    const liveInvalidatedMatchKeys = readLiveInvalidatedMatchKeys();
    if (!isAuthorCorrespondenceAdvancedSeedActive({
      seed,
      cache,
      matches: result.matches,
      invalidatedMatchKeys: liveInvalidatedMatchKeys,
      additionalActiveSourceKeys: manualMangaSourceKeys,
    })) {
      result = updateAdvancedProgressResult(false);
      await emitProgress(
        `Manga ignoré · page auteur invalidée · ${seed.result.title}`,
        seedIndex + 1,
        seeds.length,
      );
      appendNewUnlimitedSeeds();
      continue;
    }
    const mangaResult = await runMangaCorrespondenceSearch(
      buildAuthorCorrespondenceAdvancedMangaInput(input, seed, referenceNames),
      signal,
      async (_partialResult, progress) => emitProgress(
        `Correspondances du manga ${seedIndex + 1}/${seeds.length} · ${progress.currentLabel ?? seed.result.title}`,
        seedIndex,
        seeds.length,
      ),
      undefined,
      executionContext,
    );
    (mangaResult.warnings ?? []).forEach((warning) => {
      if (safetyWarnings.some((entry) => `${entry.seedKey}:${entry.code}:${entry.message}` === (
        `${seed.key}:${warning.code}:${warning.message}`
      ))) return;
      safetyWarnings.push({
        seedKey: seed.key,
        seedTitle: seed.result.title,
        code: warning.code,
        message: warning.message,
      });
      if (safetyWarnings.length > 50) safetyWarnings.shift();
    });
    const seedSourceKeys = new Set(seed.result.sources.map(buildMultiSearchSourceIdentityKey));
    const equivalentSources = mangaResult.matches
      .map((match) => match.source)
      .filter((source) => !seedSourceKeys.has(buildMultiSearchSourceIdentityKey(source)));
    const discovered = collectMangaCorrespondenceAuthors(mangaResult, { referenceNames });
    discoveredNames.push(...discovered.names);
    discoveredReferenceSources.push(...discovered.referenceSources);
    if (discovered.rejectedAuthors.length) {
      result = {
        ...result,
        rejectedAuthorCandidates: mergeAuthorCorrespondenceRejectedAuthorCandidates([
          ...(result.rejectedAuthorCandidates ?? []),
          ...discovered.rejectedAuthors.map((author) => {
            const hasConcreteScraper = author.scraperId !== "all-scrapers";
            return {
              key: `rejected-author::${normalizeFuzzyText(author.name)}`,
              name: author.name,
              reason: "multipleAuthorsOnly" as const,
              decision: "pending" as const,
              mangaCount: 1,
              soleAuthorMangaCount: 0,
              scraperCount: hasConcreteScraper ? 1 : 0,
              evidenceMangaKeys: [seed.key],
              scraperIds: hasConcreteScraper ? [author.scraperId] : [],
              scraperNames: hasConcreteScraper ? [author.scraperName] : [],
              sampleTitles: [author.sourceTitle?.trim() || seed.result.title],
              referenceSources: author.authorUrl && hasConcreteScraper
                ? [{
                  scraperId: author.scraperId,
                  authorUrl: author.authorUrl,
                  name: author.name,
                  templateContext: author.templateContext,
                }]
                : [],
            };
          }),
        ]),
      };
    }
    seed.anchorSourceKeys.forEach((sourceKey) => processedMangaKeys.add(sourceKey));
    cache = await cacheController.publish((current) => ({
      ...current,
      processedMangaKeys: Array.from(new Set([
        ...current.processedMangaKeys,
        ...seed.anchorSourceKeys,
      ])),
      mangaEnrichments: mergeEnrichment(current.mangaEnrichments, seed, equivalentSources),
    }));
    completedSeedCount += 1;
    result = updateAdvancedProgressResult(false);
    await flushAuthorDiscoveries(
      `Manga ${seedIndex + 1}/${seeds.length}`,
      seedIndex + 1,
    );
    appendNewUnlimitedSeeds();
    await emitProgress(`Manga approfondi · ${seed.result.title}`, seedIndex + 1, seeds.length);
  }
  await flushAuthorDiscoveries("Finalisation", seeds.length);
  result = updateAdvancedProgressResult(true, [], []);
  await emitProgress("Recherche auteur poussée terminée", seeds.length, seeds.length);
  return result;
};
