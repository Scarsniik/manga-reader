import type { AuthorCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  BackgroundListingRun,
} from "@/renderer/backgroundSearch/types";
import type { AuthorCorrespondenceSessionCacheSnapshot } from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
} from "@/shared/scraper";
import { buildAuthorListingSearchInput } from "@/renderer/searchEngines/authorListingSearchInput";
import { runAuthorFavoriteRefreshSearchEngine } from "@/renderer/searchEngines/listingSearchEngine";
import type { SearchExecutionContext } from "@/renderer/searchEngines/searchExecutionContext";

type PublishCache = (
  updater: (
    current: AuthorCorrespondenceSessionCacheSnapshot,
  ) => AuthorCorrespondenceSessionCacheSnapshot,
  ) => Promise<AuthorCorrespondenceSessionCacheSnapshot>;

type ProgressCallback = (label: string) => Promise<void>;

const buildSourceKey = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

const mergeRuns = (
  currentRuns: BackgroundListingRun[],
  incomingRuns: BackgroundListingRun[],
): BackgroundListingRun[] => {
  const incomingByKey = new Map(incomingRuns.map((run) => [run.key, run]));
  const currentKeys = new Set(currentRuns.map((run) => run.key));
  return [
    ...currentRuns.map((run) => incomingByKey.get(run.key) ?? run),
    ...incomingRuns.filter((run) => !currentKeys.has(run.key)),
  ];
};

const buildSessionFavorite = (
  jobId: string,
  input: AuthorCorrespondenceBackgroundInput,
  result: AuthorCorrespondenceBackgroundResult,
): ScraperAuthorFavoriteRecord | null => {
  const invalidatedMatchKeys = new Set(input.advancedSearch?.invalidatedAuthorMatchKeys ?? []);
  const timestamp = new Date().toISOString();
  const sources = result.matches
    .filter((match) => !invalidatedMatchKeys.has(match.key))
    .map<ScraperAuthorFavoriteSource>((match) => ({
      scraperId: match.scraperId,
      authorUrl: match.authorUrl,
      name: match.authorName,
      cover: match.previewSources.find((source) => source.result.thumbnailUrl)?.result.thumbnailUrl,
      templateContext: match.templateContext ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  const sourcesByKey = new Map(sources.map((source) => [buildSourceKey(source), source]));
  if (!sourcesByKey.size) return null;
  return {
    id: `author-correspondence-session:${jobId}`,
    name: result.referenceName || input.referenceName,
    cover: Array.from(sourcesByKey.values()).find((source) => source.cover)?.cover,
    sources: Array.from(sourcesByKey.values()),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const loadAuthorCorrespondenceSessionListings = async (options: {
  jobId: string;
  input: AuthorCorrespondenceBackgroundInput;
  result: AuthorCorrespondenceBackgroundResult;
  cache: AuthorCorrespondenceSessionCacheSnapshot;
  signal: AbortSignal;
  executionContext: SearchExecutionContext;
  publishCache: PublishCache;
  onProgress: ProgressCallback;
}): Promise<AuthorCorrespondenceSessionCacheSnapshot> => {
  const favorite = buildSessionFavorite(options.jobId, options.input, options.result);
  if (!favorite) return options.cache;
  const scrapersById = new Map(options.input.scrapers.map((scraper) => [scraper.id, scraper]));
  const desiredPageCount = Math.max(1, Math.floor(options.input.authorPageCount ?? 1));
  const fullInput = buildAuthorListingSearchInput(
    [favorite],
    scrapersById,
    "authorFavoriteRefresh",
    {
      maxPages: desiredPageCount,
      concurrency: options.input.scrapingConcurrency,
      includedLanguageCodes: [],
      scrapeDetailsWithCards: options.input.scrapeDetailsWithCards,
    },
  );
  fullInput.paceMode = options.input.paceMode;
  const cachedRunsByKey = new Map(options.cache.runs.map((run) => [run.key, run]));
  const plansByPageCount = new Map<number, typeof fullInput.sources>();

  fullInput.sources.forEach((source) => {
    const cachedRun = cachedRunsByKey.get(source.id);
    const missingPageCount = cachedRun
      ? Math.max(0, desiredPageCount - cachedRun.loadedPages)
      : desiredPageCount;
    if (!missingPageCount || cachedRun?.hasNextPage === false) return;
    const sources = plansByPageCount.get(missingPageCount) ?? [];
    sources.push(source);
    plansByPageCount.set(missingPageCount, sources);
  });

  let cache = options.cache;
  for (const [pageCount, sources] of plansByPageCount) {
    const sourceKeys = new Set(sources.map((source) => source.id));
    const initialRuns = cache.runs.filter((run) => sourceKeys.has(run.key));
    const listingInput = {
      ...fullInput,
      sources,
      maxPages: pageCount,
    };
    const result = await runAuthorFavoriteRefreshSearchEngine(
      listingInput,
      options.signal,
      async (partialResult) => {
        cache = await options.publishCache((current) => ({
          ...current,
          runs: mergeRuns(current.runs, partialResult.runs),
        }));
        await options.onProgress("Mise en cache des mangas des pages auteur");
      },
      {
        initialRuns,
        executionContext: options.executionContext,
      },
    );
    cache = await options.publishCache((current) => ({
      ...current,
      runs: mergeRuns(current.runs, result.runs),
    }));
  }

  return cache;
};
