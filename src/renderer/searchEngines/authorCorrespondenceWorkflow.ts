import type {
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceReferenceSource,
  BackgroundSearchProgress,
  MangaCorrespondenceBackgroundInput,
} from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  BackgroundSearchExecutionResult,
  MangaCorrespondenceBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { dedupeAuthorCorrespondenceReferenceSources } from "@/renderer/utils/authorCorrespondenceIdentity";
import { runMangaCorrespondenceSearch } from "@/renderer/searchEngines/mangaCorrespondenceSearchEngine";
import { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
import type { SearchExecutionContext } from "@/renderer/searchEngines/searchExecutionContext";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

const collectMangaAuthors = (
  result: MangaCorrespondenceBackgroundResult,
): { names: string[]; referenceSources: AuthorCorrespondenceReferenceSource[] } => {
  const activeDiscoveries = (result.discoveries ?? []).filter((discovery) => (
    discovery.kind === "author" && discovery.status === "active"
  ));
  const names = buildUniqueAuthorSearchNames([
    ...activeDiscoveries.map((discovery) => discovery.value),
    ...result.matches.flatMap((match) => match.authors),
  ]);
  const discoverySources = activeDiscoveries.flatMap((discovery) => (
    discovery.authorPageUrl
      ? [{
        scraperId: discovery.scraperId,
        authorUrl: discovery.authorPageUrl,
        name: discovery.value,
        templateContext: discovery.authorTemplateContext,
      }]
      : []
  ));
  const matchSources = result.matches.flatMap((match) => {
    const urls = Array.from(new Set([
      match.source.result.authorUrl,
      ...(match.source.result.authorUrls ?? []),
    ].map((url) => url?.trim()).filter((url): url is string => Boolean(url))));
    return urls.map((authorUrl, index) => ({
      scraperId: match.source.scraper.id,
      authorUrl,
      name: match.authors[index] ?? match.authors[0] ?? names[0] ?? "",
    }));
  });
  return {
    names,
    referenceSources: dedupeAuthorCorrespondenceReferenceSources([...discoverySources, ...matchSources]),
  };
};

export const runAuthorCorrespondenceWorkflow = async (
  input: AuthorCorrespondenceBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
  executionContext: SearchExecutionContext,
  previousResult?: AuthorCorrespondenceBackgroundResult,
): Promise<AuthorCorrespondenceBackgroundResult> => {
  const enteredNames = buildUniqueAuthorSearchNames([input.referenceName, ...input.names]);
  if (enteredNames.length || !input.mangaSeed) {
    const preserveMangaDiscovery = (partialResult: AuthorCorrespondenceBackgroundResult) => (
      previousResult?.mangaDiscovery
        ? { ...partialResult, mangaDiscovery: previousResult.mangaDiscovery }
        : partialResult
    );
    const result = await runAuthorCorrespondenceSearch(
      input,
      signal,
      async (partialResult, progress) => onSnapshot(
        preserveMangaDiscovery(partialResult as AuthorCorrespondenceBackgroundResult),
        progress,
      ),
      executionContext,
      previousResult,
    );
    return preserveMangaDiscovery(result);
  }

  const referenceTitle = input.mangaSeed.reference.title;
  let resolvedNames = buildUniqueAuthorSearchNames(previousResult?.mangaDiscovery?.names ?? []);
  let resolvedSources = dedupeAuthorCorrespondenceReferenceSources([
    ...input.referenceSources,
    ...(previousResult?.mangaDiscovery?.referenceSources ?? []),
  ]);

  if (!resolvedNames.length) {
    const mangaInput: MangaCorrespondenceBackgroundInput = {
      reference: input.mangaSeed.reference,
      request: "sameManga",
      strategy: "titleFirst",
      scraperFilterValues: input.scraperFilterValues,
      scrapers: input.scrapers,
      maxPages: input.maxPages,
      paceMode: input.paceMode,
      scrapingConcurrency: input.scrapingConcurrency,
      scrapeDetailsWithCards: input.scrapeDetailsWithCards,
      enableRomajiPhoneticMerge: input.mangaSeed.enableRomajiPhoneticMerge,
      purpose: "authorDiscovery",
      safety: input.correspondenceSafety,
    };
    const mangaResult = await runMangaCorrespondenceSearch(
      mangaInput,
      signal,
      async (partialResult, progress) => onSnapshot({
        referenceName: referenceTitle,
        matches: [],
        searchedNames: [],
        mangaDiscovery: {
          referenceTitle,
          names: [],
          referenceSources: [],
          result: partialResult as MangaCorrespondenceBackgroundResult,
        },
      }, {
        ...progress,
        resultCount: 0,
        currentLabel: progress.currentLabel
          ? `Recherche du manga · ${progress.currentLabel}`
          : "Recherche du manga sur les autres sources",
      }),
      previousResult?.mangaDiscovery?.result,
      executionContext,
    );
    const discovered = collectMangaAuthors(mangaResult);
    resolvedNames = discovered.names;
    resolvedSources = dedupeAuthorCorrespondenceReferenceSources([
      ...resolvedSources,
      ...discovered.referenceSources,
    ]);
  }

  if (!resolvedNames.length) {
    throw new Error(`Aucun auteur exploitable n’a été trouvé pour « ${referenceTitle} » sur les sources correspondantes.`);
  }

  const mangaDiscovery = {
    referenceTitle,
    names: resolvedNames,
    referenceSources: resolvedSources,
  };
  const resolvedInput: AuthorCorrespondenceBackgroundInput = {
    ...input,
    referenceName: resolvedNames[0],
    names: resolvedNames,
    referenceSources: resolvedSources,
  };
  const result = await runAuthorCorrespondenceSearch(
    resolvedInput,
    signal,
    async (partialResult, progress) => onSnapshot({
      ...(partialResult as AuthorCorrespondenceBackgroundResult),
      mangaDiscovery,
    }, {
      ...progress,
      currentLabel: progress.currentLabel
        ? `Recherche auteur · ${progress.currentLabel}`
        : "Recherche des pages auteur",
    }),
    executionContext,
    previousResult,
  );
  return { ...result, mangaDiscovery };
};
