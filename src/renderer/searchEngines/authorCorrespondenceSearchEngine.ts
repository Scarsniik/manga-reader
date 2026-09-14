import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchProgress,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import type {
  AuthorCorrespondenceBackgroundResult,
  AuthorCorrespondenceMatch,
  BackgroundSearchExecutionResult,
} from "@/renderer/backgroundSearch/types";
import { extractMultiSearchAuthors } from "@/renderer/components/MultiSearch/multiSearchAuthors";
import {
  fetchAuthorPageWithRetry,
  fetchSearchPageWithRetry,
  getAuthorConfig,
  getPaceConfig,
  getSearchConfig,
  resolveHasNextPage,
  runWithConcurrency,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { isSearchableScraper } from "@/renderer/components/MultiSearch/multiSearchUtils";
import { processScraperListingPage } from "@/renderer/components/MultiSearch/listingSourcePageProcessing";
import { getFuzzyTextMatchScore, normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import {
  buildAuthorModuleSearchValues,
  buildUniqueAuthorSearchNames,
} from "@/renderer/utils/authorSearchNames";
import {
  buildAuthorCorrespondenceMatchKey,
  normalizeAuthorCorrespondenceTarget,
} from "@/renderer/utils/authorCorrespondenceIdentity";
import {
  getScraperFeature,
  isScraperFeatureConfigured,
  isScraperListingPaginationEndError,
} from "@/renderer/utils/scraperRuntime";
import {
  getOrCreateSearchExecutionContext,
  type SearchExecutionContext,
} from "@/renderer/searchEngines/searchExecutionContext";
import { buildScraperListingPageRequestKey } from "@/renderer/utils/scraperLatestExecutionPlanning";
import { normalizeMangaCorrespondenceSafetySettings } from "@/shared/mangaCorrespondenceSafetySettings";
import type { ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime";
import {
  buildBackgroundListingPaginationUrlKey,
  isBackgroundListingRedirectedToVisitedPage,
} from "@/renderer/backgroundSearch/backgroundListingBlacklist";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import { isAuthorCorrespondenceNameSearchSourceVerified } from "@/renderer/searchEngines/authorCorrespondenceNameSearchSources";
import { getCachedScraperAuthors } from "@/renderer/utils/scraperAuthorListCache";

const formatProgressSubject = (value: string, maxLength = 80): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
};

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type Candidate = Omit<AuthorCorrespondenceMatch, "previewSources">;

const PREVIEW_RESULT_LIMIT = 6;

const selectScrapers = (input: AuthorCorrespondenceBackgroundInput): ScraperRecord[] => (
  input.scrapers
);

const canUseAuthorModule = (scraper: ScraperRecord): boolean => {
  const feature = getScraperFeature(scraper, "author");
  if (!isScraperFeatureConfigured(feature)) return false;
  try {
    return Boolean(getAuthorConfig(scraper));
  } catch {
    return false;
  }
};

const findMatchedName = (candidateName: string, names: string[]): string | undefined => names.find((name) => {
  const candidate = normalizeFuzzyText(candidateName);
  const reference = normalizeFuzzyText(name);
  if (!candidate || !reference) return false;
  return candidate === reference || getFuzzyTextMatchScore(reference, candidateName) >= 450;
});

const addCandidate = (
  candidates: Map<string, Candidate>,
  candidate: Omit<Candidate, "key" | "discoveryMethods"> & { discoveryMethod: Candidate["discoveryMethods"][number] },
): void => {
  const directKey = buildAuthorCorrespondenceMatchKey(candidate.scraperId, candidate.authorUrl);
  const existing = candidates.get(directKey);
  const key = existing?.key ?? directKey;
  const { discoveryMethod, ...candidateFields } = candidate;
  const preserveExistingReference = Boolean(
    existing?.discoveryMethods.includes("reference")
    && discoveryMethod !== "reference",
  );
  const mergedFields = preserveExistingReference
    ? { ...candidateFields, ...existing }
    : { ...existing, ...candidateFields };
  candidates.set(key, {
    ...mergedFields,
    key,
    templateContext: preserveExistingReference
      ? existing?.templateContext ?? candidate.templateContext
      : candidate.templateContext ?? existing?.templateContext,
    discoveryMethods: Array.from(new Set([
      ...(existing?.discoveryMethods ?? []),
      discoveryMethod,
    ])),
  });
};

export const runAuthorCorrespondenceSearch = async (
  input: AuthorCorrespondenceBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
  executionContextInput?: SearchExecutionContext,
  previousResult?: AuthorCorrespondenceBackgroundResult,
): Promise<AuthorCorrespondenceBackgroundResult> => {
  const scrapers = selectScrapers(input);
  if (!scrapers.length) throw new Error("Aucun scrapper compatible n'est sélectionné.");

  const names = buildUniqueAuthorSearchNames([input.referenceName, ...input.names]);
  if (!names.length) throw new Error("Aucun nom d'auteur exploitable n'est disponible.");

  const concurrency = Math.max(1, Math.floor(input.scrapingConcurrency));
  const pace = { ...getPaceConfig(input.paceMode), concurrency };
  const executionContext = getOrCreateSearchExecutionContext(executionContextInput, {
    kind: "authorCorrespondence",
  });
  const detailsCache = executionContext.detailsCache;
  const searchPagePrefetch = executionContext.getPagePrefetchCache<ScraperRuntimeSearchPageResult>(
    "author-correspondence-search",
  );
  const correspondenceSafety = normalizeMangaCorrespondenceSafetySettings(input.correspondenceSafety);
  const maxPages = input.maxPages === null
    ? (correspondenceSafety.enabled && correspondenceSafety.unboundedPageLimitEnabled
      ? correspondenceSafety.unboundedPageLimit
      : Number.MAX_SAFE_INTEGER)
    : Math.max(1, input.maxPages);
  const checkpointInput = {
    referenceName: input.referenceName,
    names: input.names,
    referenceSources: input.referenceSources,
    scraperFilterValues: input.scraperFilterValues,
    scrapers: input.scrapers.map((scraper) => ({ id: scraper.id, updatedAt: scraper.updatedAt })),
    maxPages: input.maxPages,
    authorPageCount: input.authorPageCount,
    paceMode: input.paceMode,
    scrapeDetailsWithCards: input.scrapeDetailsWithCards,
    correspondenceSafety,
    replayRevision: input.replay?.revision ?? 0,
  };
  const inputFingerprint = executionContext.checkpointAdapter.fingerprint(checkpointInput);
  const resumeCheckpoint = previousResult?.checkpoint?.version === 1
    && executionContext.checkpointAdapter.isCompatible(
      previousResult.checkpoint.inputFingerprint,
      checkpointInput,
    )
    ? previousResult.checkpoint
    : null;
  const candidates = new Map<string, Candidate>(
    (resumeCheckpoint?.candidates ?? []).map((candidate) => [candidate.key, candidate]),
  );
  const matches = new Map<string, AuthorCorrespondenceMatch>(
    (resumeCheckpoint ? previousResult?.matches ?? [] : []).map((match) => [match.key, match]),
  );
  const nameSearchSources = new Map<string, MultiSearchSourceResult>(
    (resumeCheckpoint ? previousResult?.nameSearchSources ?? [] : [])
      .filter(isAuthorCorrespondenceNameSearchSourceVerified)
      .map((source) => [buildMultiSearchSourceIdentityKey(source), source]),
  );
  const resolvedTargetsByMatchKey = new Map<string, string>();
  matches.forEach((match) => {
    resolvedTargetsByMatchKey.set(match.key, normalizeAuthorCorrespondenceTarget(match.authorUrl));
  });
  const completedUnitKeys = new Set(resumeCheckpoint?.completedUnitKeys ?? []);
  let completedUnits = completedUnitKeys.size;
  const totalUnits = scrapers.length * names.length;

  const buildResult = (): AuthorCorrespondenceBackgroundResult => ({
    referenceName: input.referenceName,
    matches: Array.from(matches.values()).sort((left, right) => (
      left.authorName.localeCompare(right.authorName) || left.scraperName.localeCompare(right.scraperName)
    )),
    searchedNames: names,
    nameSearchSources: Array.from(nameSearchSources.values()),
    rejectedAuthorCandidates: previousResult?.rejectedAuthorCandidates,
    discoveries: previousResult?.discoveries,
    checkpoint: {
      version: 1,
      inputFingerprint,
      completedUnitKeys: Array.from(completedUnitKeys),
      candidates: Array.from(candidates.values()),
    },
  });
  const emit = async (label?: string): Promise<void> => onSnapshot(buildResult(), {
    completedUnits,
    totalUnits,
    resultCount: matches.size,
    currentLabel: label,
  });
  const upsertMatch = (
    candidate: Candidate,
    previewSources: MultiSearchSourceResult[],
    resolvedTarget?: string,
  ): void => {
    const normalizedResolvedTarget = normalizeAuthorCorrespondenceTarget(resolvedTarget || candidate.authorUrl);
    const existing = Array.from(matches.values()).find((entry) => (
      entry.scraperId === candidate.scraperId
      && (
        resolvedTargetsByMatchKey.get(entry.key) === normalizedResolvedTarget
        || normalizeAuthorCorrespondenceTarget(entry.authorUrl) === normalizedResolvedTarget
      )
    ));
    const sourceKeys = new Set<string>();
    const mergedPreviews = [...(existing?.previewSources ?? []), ...previewSources].filter((source) => {
      const sourceKey = `${source.scraper.id}::${source.result.detailUrl?.trim() || normalizeFuzzyText(source.result.title)}`;
      if (sourceKeys.has(sourceKey)) return false;
      sourceKeys.add(sourceKey);
      return true;
    }).slice(0, PREVIEW_RESULT_LIMIT);
    const preferCandidateTarget = candidate.discoveryMethods.includes("reference")
      || !existing?.discoveryMethods.includes("reference");
    const merged: AuthorCorrespondenceMatch = {
      ...(existing ?? candidate),
      ...candidate,
      key: existing?.key ?? candidate.key,
      authorUrl: preferCandidateTarget ? candidate.authorUrl : existing?.authorUrl ?? candidate.authorUrl,
      templateContext: candidate.templateContext ?? existing?.templateContext,
      discoveryMethods: Array.from(new Set([
        ...(existing?.discoveryMethods ?? []),
        ...candidate.discoveryMethods,
      ])),
      previewSources: mergedPreviews,
    };
    matches.set(merged.key, merged);
    resolvedTargetsByMatchKey.set(merged.key, normalizedResolvedTarget);
  };

  input.referenceSources.forEach((source) => {
    const scraper = scrapers.find((entry) => entry.id === source.scraperId);
    if (!scraper || !source.authorUrl.trim()) return;
    addCandidate(candidates, {
      scraperId: scraper.id,
      scraperName: scraper.name,
      authorName: source.name || input.referenceName,
      authorUrl: source.authorUrl,
      templateContext: source.templateContext,
      matchedName: findMatchedName(source.name, names) ?? input.referenceName,
      discoveryMethod: "reference",
    });
  });

  await emit("Verification des listes d'auteurs enregistrees");
  await runWithConcurrency(scrapers.map((scraper) => async () => {
    const cachedAuthors = await getCachedScraperAuthors(scraper, names).catch(() => []);
    cachedAuthors.forEach((author) => {
      const matchedName = findMatchedName(author.name, names);
      if (!author.url || !matchedName) {
        return;
      }

      addCandidate(candidates, {
        scraperId: scraper.id,
        scraperName: scraper.name,
        authorName: author.name,
        authorUrl: author.url,
        matchedName,
        discoveryMethod: "authorList",
      });
    });
  }), concurrency);

  const loadSearchSources = async (
    scraper: ScraperRecord,
    name: string,
    discoverAuthorCandidates: boolean,
  ): Promise<MultiSearchSourceResult[]> => {
    if (!isSearchableScraper(scraper)) return [];
    const results: MultiSearchSourceResult[] = [];
    let shouldDiscoverAuthorCandidates = discoverAuthorCandidates;
    const prefetchSourceKey = `${scraper.id}:${normalizeFuzzyText(name)}`;
    const visitedPageUrlKeys = new Set<string>();
    let nextPageUrl: string | undefined;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
      try {
        await emit(
          `Recherche auteur · ${scraper.name} · page ${pageIndex + 1}/${maxPages} · « ${formatProgressSubject(name)} »`,
        );
        const loadPage = () => fetchSearchPageWithRetry(
          scraper, getSearchConfig(scraper), name, pageIndex, nextPageUrl, pace,
          {
            scrapeDetailsWithCards: input.scrapeDetailsWithCards,
            fetchDocument: executionContext.fetchDocument,
          },
        );
        const page = await searchPagePrefetch.load(
          prefetchSourceKey,
          buildScraperListingPageRequestKey(pageIndex, nextPageUrl),
          loadPage,
        );
        if (isBackgroundListingRedirectedToVisitedPage(
          page.requestedPageUrl,
          page.currentPageUrl,
          visitedPageUrlKeys,
        )) {
          searchPagePrefetch.clear(prefetchSourceKey);
          break;
        }
        visitedPageUrlKeys.add(buildBackgroundListingPaginationUrlKey(page.currentPageUrl));
        const { sources } = await processScraperListingPage({
          scraper,
          page,
          pageIndex,
          searchTerm: name,
          contextualAuthorNames: names,
        });
        results.push(...sources);
        sources.filter(isAuthorCorrespondenceNameSearchSourceVerified).forEach((source) => {
          nameSearchSources.set(buildMultiSearchSourceIdentityKey(source), source);
        });
        if (sources.length) {
          await emit(
            `Résultats par nom · ${scraper.name} · page ${pageIndex + 1}/${maxPages} · « ${formatProgressSubject(name)} »`,
          );
        }
        if (sources.length && shouldDiscoverAuthorCandidates) {
          const extracted = await extractMultiSearchAuthors(sources, input.paceMode, undefined, {
            concurrency,
            signal,
            detailsCache,
            fetchDocument: executionContext.fetchDocument,
          });
          extracted.authors.forEach((author) => {
            const matchedName = findMatchedName(author.name, names);
            if (!matchedName) return;
            addCandidate(candidates, {
              scraperId: author.scraperId,
              scraperName: author.scraperName,
              authorName: author.name,
              authorUrl: author.url,
              matchedName,
              discoveryMethod: "search",
            });
          });
          if (extracted.authors.some((author) => Boolean(findMatchedName(author.name, names)))) {
            shouldDiscoverAuthorCandidates = false;
          }
        }
        nextPageUrl = page.nextPageUrl;
        const pageHasNext = resolveHasNextPage(getSearchConfig(scraper), page);
        if (!pageHasNext) break;
        if (pageIndex + 1 < maxPages) {
          const followingPageIndex = pageIndex + 1;
          const followingPageUrl = page.nextPageUrl;
          searchPagePrefetch.preload(
            prefetchSourceKey,
            buildScraperListingPageRequestKey(followingPageIndex, followingPageUrl),
            () => fetchSearchPageWithRetry(
              scraper, getSearchConfig(scraper), name, followingPageIndex, followingPageUrl, pace,
              {
                scrapeDetailsWithCards: input.scrapeDetailsWithCards,
                fetchDocument: executionContext.fetchDocument,
              },
            ),
          );
        }
      } catch (error) {
        if (!isScraperListingPaginationEndError(error) && results.length === 0) throw error;
        break;
      }
    }
    return results;
  };

  await emit();
  await runWithConcurrency(scrapers.flatMap((scraper) => names.map((name) => async () => {
    const unitKey = `${scraper.id}:${normalizeFuzzyText(name)}`;
    if (completedUnitKeys.has(unitKey)) return;
    if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
    try {
      await emit(`Préparation · ${scraper.name} · « ${formatProgressSubject(name)} »`);
      const hasDirectCandidate = Array.from(candidates.values()).some((candidate) => (
        candidate.scraperId === scraper.id
        && (
          candidate.discoveryMethods.includes("reference")
          || candidate.discoveryMethods.includes("authorList")
        )
        && Boolean(findMatchedName(candidate.matchedName, [name]))
      ));
      await loadSearchSources(scraper, name, !hasDirectCandidate);

      const hasResolvedCandidate = Array.from(candidates.values()).some((candidate) => (
        candidate.scraperId === scraper.id && Boolean(findMatchedName(candidate.matchedName, [name]))
      ));
      if (!hasResolvedCandidate && canUseAuthorModule(scraper) && getAuthorConfig(scraper).urlStrategy === "template") {
        for (const authorValue of buildAuthorModuleSearchValues(getAuthorConfig(scraper), name)) {
          try {
            await emit(`Vérification page auteur · ${scraper.name} · « ${formatProgressSubject(name)} »`);
            const page = await fetchAuthorPageWithRetry(
              scraper,
              getAuthorConfig(scraper),
              authorValue,
              0,
              undefined,
              pace,
              null,
              {
                scrapeDetailsWithCards: input.scrapeDetailsWithCards,
                detailsCache,
                fetchDocument: executionContext.fetchDocument,
              },
            );
            if (!page.items.length) continue;
            addCandidate(candidates, {
              scraperId: scraper.id,
              scraperName: scraper.name,
              authorName: page.authorNames?.[0] || name,
              authorUrl: authorValue,
              matchedName: name,
              discoveryMethod: "authorModule",
            });
            break;
          } catch (error) {
            if (!isScraperListingPaginationEndError(error)) console.warn(`Author brute-force failed for ${scraper.name}`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`Author correspondence search failed for ${scraper.name}`, error);
    } finally {
      completedUnitKeys.add(unitKey);
      completedUnits += 1;
      await emit(`${scraper.name} · ${name}`);
    }
  })), concurrency);

  await runWithConcurrency(Array.from(candidates.values()).map((candidate) => async () => {
    const scraper = scrapers.find((entry) => entry.id === candidate.scraperId);
    if (!scraper || !canUseAuthorModule(scraper)) return;
    try {
      await emit(
        `Validation page auteur · ${scraper.name} · « ${formatProgressSubject(candidate.authorName)} »`,
      );
      const page = await fetchAuthorPageWithRetry(
        scraper,
        getAuthorConfig(scraper),
        candidate.authorUrl,
        0,
        undefined,
        pace,
        candidate.templateContext ?? null,
        {
          scrapeDetailsWithCards: input.scrapeDetailsWithCards,
          detailsCache,
          fetchDocument: executionContext.fetchDocument,
        },
      );
      const { sources } = await processScraperListingPage({
        scraper,
        page: { ...page, items: page.items.slice(0, PREVIEW_RESULT_LIMIT) },
        pageIndex: 0,
        searchTerm: candidate.authorName,
        contextualAuthorNames: [candidate.authorName, ...names],
      });
      const previewSources = sources;
      upsertMatch(candidate, previewSources, page.currentPageUrl);
      await emit(candidate.authorName);
    } catch (error) {
      console.warn(`Author preview failed for ${scraper.name}`, error);
      upsertMatch(candidate, []);
      await emit(candidate.authorName);
    }
  }), concurrency);

  return buildResult();
};
