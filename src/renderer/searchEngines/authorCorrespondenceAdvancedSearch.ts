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
  type AuthorCorrespondenceMangaEnrichment,
  type AuthorCorrespondenceSessionCacheSnapshot,
} from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import { mergeAuthorCorrespondenceSessionResults } from "@/renderer/backgroundSearch/authorCorrespondenceSessionResults";
import { buildInitialAuthorCorrespondenceDiscoveries } from "@/renderer/backgroundSearch/authorCorrespondenceDiscoveries";
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
import { inferMangaCorrespondenceFirstChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
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
  };
};

const collectActiveAuthorSources = (
  cache: AuthorCorrespondenceSessionCacheSnapshot,
  input: AuthorCorrespondenceBackgroundInput,
  result: AuthorCorrespondenceBackgroundResult,
): MultiSearchSourceResult[] => {
  const invalidatedMatchKeys = new Set(input.advancedSearch?.invalidatedAuthorMatchKeys ?? []);
  const activeRunKeys = new Set(result.matches
    .filter((match) => !invalidatedMatchKeys.has(match.key))
    .map((match) => `${match.scraperId}::${match.authorUrl}`));
  return cache.runs
    .filter((run) => activeRunKeys.has(run.key))
    .flatMap((run) => run.results);
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

const analyzeAdvancedSeedSourceTitle = (source: MultiSearchSourceResult) => (
  analyzeMangaCorrespondenceTitle(
    source.result.title,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis")),
  )
);

export const buildAuthorCorrespondenceAdvancedMangaInput = (
  input: AuthorCorrespondenceBackgroundInput,
  seed: AuthorCorrespondenceAdvancedSeed,
): MangaCorrespondenceBackgroundInput => {
  const referenceAnalysis = analyzeAdvancedSeedSourceTitle(seed.referenceSource);
  const parsedTitles = uniqueText(seed.result.sources.flatMap((source) => {
    const analysis = analyzeAdvancedSeedSourceTitle(source);
    return [analysis.title, ...analysis.alternativeTitles];
  }));
  const referenceTitle = referenceAnalysis.title || seed.result.title;
  const referenceChapter = referenceAnalysis.chapter
    ?? inferMangaCorrespondenceFirstChapter(referenceAnalysis, parsedTitles);

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
      authors: uniqueText(seed.result.sources.flatMap((source) => [
        ...(source.result.authorNames ?? []),
        ...source.tentativeAuthorNames,
      ])),
      authorUrls: uniqueText(seed.result.sources.flatMap((source) => [
        source.result.authorUrl,
        ...(source.result.authorUrls ?? []),
      ])),
      ...(referenceChapter ? { chapter: referenceChapter } : {}),
    },
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
  const cacheController = createCacheController(executionContext.backgroundJobId);
  let result: AuthorCorrespondenceBackgroundResult = {
    ...initialResult,
    nameSearchSources: initialResult.nameSearchSources?.filter(
      isAuthorCorrespondenceNameSearchSourceVerified,
    ),
  };
  let cache = await cacheController.read();
  const requestedBatchCount = Math.max(1, Math.floor(request.requestedBatchCount));
  const completedBatchCount = result.advancedSearch?.completedBatchCount ?? 0;
  if (requestedBatchCount <= completedBatchCount && cache.processedMangaKeys.length) return result;
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
  const jobId = executionContext.backgroundJobId ?? `memory:${input.referenceName}`;
  cache = await loadAuthorCorrespondenceSessionListings({
    jobId,
    input,
    result,
    cache,
    signal,
    executionContext,
    publishCache: cacheController.publish,
    onProgress: (label) => emitProgress(`Préparation · ${label}`),
  });

  const authorSources = collectActiveAuthorSources(cache, input, result);
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
  let completedSeedCount = 0;
  const discoveredNames: string[] = [
    ...(result.advancedSearch?.pendingAuthorNames ?? []),
  ];
  const discoveredReferenceSources: AuthorCorrespondenceReferenceSource[] = [
    ...(result.advancedSearch?.pendingAuthorReferenceSources ?? []),
  ];
  const updateAdvancedProgressResult = (
    batchCompleted: boolean,
    pendingAuthorNames = discoveredNames,
    pendingAuthorReferenceSources = discoveredReferenceSources,
  ): AuthorCorrespondenceBackgroundResult => {
    const refreshedAuthorSources = collectActiveAuthorSources(cache, input, result);
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
    const discoveredAuthorMatchKeys = Array.from(new Set([
      ...cache.discoveredAuthorMatchKeys,
      ...(result.advancedSearch?.discoveredAuthorMatchKeys ?? []),
    ]));
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
      }),
    };
  };
  const seeds = remainingBatchSize
    ? selectAuthorCorrespondenceAdvancedSeeds(
      mergedResults,
      authorSourceKeys,
      processedMangaKeys,
      remainingBatchSize,
    )
    : [];

  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    const seed = seeds[seedIndex];
    const mangaResult = await runMangaCorrespondenceSearch(
      buildAuthorCorrespondenceAdvancedMangaInput(input, seed),
      signal,
      async (_partialResult, progress) => emitProgress(
        `Correspondances du manga ${seedIndex + 1}/${seeds.length} · ${progress.currentLabel ?? seed.result.title}`,
        seedIndex,
        seeds.length,
      ),
      undefined,
      executionContext,
    );
    const seedSourceKeys = new Set(seed.result.sources.map(buildMultiSearchSourceIdentityKey));
    const equivalentSources = mangaResult.matches
      .map((match) => match.source)
      .filter((source) => !seedSourceKeys.has(buildMultiSearchSourceIdentityKey(source)));
    const discovered = collectMangaCorrespondenceAuthors(mangaResult);
    discoveredNames.push(...discovered.names);
    discoveredReferenceSources.push(...discovered.referenceSources);
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
    await emitProgress(`Manga approfondi · ${seed.result.title}`, seedIndex + 1, seeds.length);
  }

  const currentMatchKeys = new Set(result.matches.map((match) => (
    buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl)
  )));
  const newReferenceSources = dedupeAuthorCorrespondenceReferenceSources(discoveredReferenceSources)
    .filter((source) => !currentMatchKeys.has(buildAuthorCorrespondenceMatchKey(
      source.scraperId,
      source.authorUrl,
    )));
  const searchedNameKeys = new Set(result.searchedNames.map((name) => name.toLocaleLowerCase()));
  const newNames = buildUniqueAuthorSearchNames(discoveredNames)
    .filter((name) => !searchedNameKeys.has(name.toLocaleLowerCase()));
  const incrementalNames = buildUniqueAuthorSearchNames([
    ...newNames,
    ...newReferenceSources.map((source) => source.name),
  ]);

  if (incrementalNames.length || newReferenceSources.length) {
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
          .filter((matchKey) => !currentMatchKeys.has(matchKey));
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
        await emitProgress(
          progress.currentLabel
            ? `Nouveaux auteurs · ${progress.currentLabel}`
            : "Recherche des nouvelles pages auteur",
          seeds.length,
          seeds.length,
        );
      },
      executionContext,
    );
    const mergedMatches = mergeMatches(result.matches, incrementalResult.matches);
    const newMatchKeys = mergedMatches
      .map((match) => buildAuthorCorrespondenceMatchKey(match.scraperId, match.authorUrl))
      .filter((matchKey) => !currentMatchKeys.has(matchKey));
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
    cache = await cacheController.publish((current) => ({
      ...current,
      discoveredAuthorMatchKeys: Array.from(new Set([
        ...current.discoveredAuthorMatchKeys,
        ...newMatchKeys,
      ])),
    }));
    result = {
      ...result,
      discoveries: buildInitialAuthorCorrespondenceDiscoveries({
        ...input,
        names: result.searchedNames,
        referenceSources: dedupeAuthorCorrespondenceReferenceSources([
          ...input.referenceSources,
          ...newReferenceSources,
        ]),
      }, result),
    };
    cache = await loadAuthorCorrespondenceSessionListings({
      jobId,
      input,
      result,
      cache,
      signal,
      executionContext,
      publishCache: cacheController.publish,
      onProgress: (label) => emitProgress(
        `Nouvelles pages auteur · ${label}`,
        seeds.length,
        seeds.length,
      ),
    });
  }
  result = updateAdvancedProgressResult(true, [], []);
  await emitProgress("Recherche auteur poussée terminée", seeds.length, seeds.length);
  return result;
};
