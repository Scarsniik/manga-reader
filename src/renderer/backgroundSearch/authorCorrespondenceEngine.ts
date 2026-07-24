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
  buildSourceResults,
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
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import { getFuzzyTextMatchScore, normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import {
  getScraperFeature,
  isScraperFeatureConfigured,
  isScraperListingPaginationEndError,
} from "@/renderer/utils/scraperRuntime";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type Candidate = Omit<AuthorCorrespondenceMatch, "previewSources">;

const PREVIEW_RESULT_LIMIT = 6;

const uniqueText = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  return values.map((value) => value?.trim().replace(/\s+/g, " ") ?? "").filter((value) => {
    const key = normalizeFuzzyText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const selectScrapers = (input: AuthorCorrespondenceBackgroundInput): ScraperRecord[] => {
  const filter = splitIncludeFilterValues(input.scraperFilterValues);
  return input.scrapers.filter((scraper) => (
    !filter.excludedValues.includes(scraper.id)
    && (!filter.includedValues.length || filter.includedValues.includes(scraper.id))
  ));
};

const canUseAuthorModule = (scraper: ScraperRecord): boolean => {
  const feature = getScraperFeature(scraper, "author");
  if (!isScraperFeatureConfigured(feature)) return false;
  try {
    return Boolean(getAuthorConfig(scraper));
  } catch {
    return false;
  }
};

const buildAuthorSlug = (value: string, separator: "-" | "_" | ""): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, separator)
  .replace(new RegExp(`^${separator || "\\s"}+|${separator || "\\s"}+$`, "g"), "");

const buildAuthorSearchValues = (scraper: ScraperRecord, authorName: string): string[] => {
  const config = getAuthorConfig(scraper);
  const hyphenSlug = buildAuthorSlug(authorName, "-");
  const underscoreSlug = buildAuthorSlug(authorName, "_");
  const compactSlug = buildAuthorSlug(authorName, "");
  const testPrefix = config.testValue?.match(/^([\p{L}\p{N}_-]+):/u)?.[1];
  return uniqueText(testPrefix
    ? [`${testPrefix}:${underscoreSlug}`, `${testPrefix}:${hyphenSlug}`, authorName, underscoreSlug, hyphenSlug, compactSlug]
    : /\/artists?\//i.test(config.urlTemplate ?? "")
      ? [hyphenSlug, underscoreSlug, authorName, compactSlug]
      : [authorName, hyphenSlug, underscoreSlug, compactSlug]);
};

const findMatchedName = (candidateName: string, names: string[]): string | undefined => names.find((name) => {
  const candidate = normalizeFuzzyText(candidateName);
  const reference = normalizeFuzzyText(name);
  if (!candidate || !reference) return false;
  return candidate === reference || getFuzzyTextMatchScore(reference, candidateName) >= 450;
});

const normalizeAuthorTarget = (value: string): string => {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return normalizeFuzzyText(trimmed);
  }
};

const buildCandidateKey = (scraperId: string, authorUrl: string): string => (
  `${scraperId}::${normalizeAuthorTarget(authorUrl)}`
);

const addCandidate = (
  candidates: Map<string, Candidate>,
  candidate: Omit<Candidate, "key" | "discoveryMethods"> & { discoveryMethod: Candidate["discoveryMethods"][number] },
): void => {
  const directKey = buildCandidateKey(candidate.scraperId, candidate.authorUrl);
  const existing = candidates.get(directKey) ?? Array.from(candidates.values()).find((entry) => (
    entry.scraperId === candidate.scraperId
    && normalizeFuzzyText(entry.authorName) === normalizeFuzzyText(candidate.authorName)
  ));
  const key = existing?.key ?? directKey;
  const { discoveryMethod, ...candidateFields } = candidate;
  candidates.set(key, {
    ...existing,
    ...candidateFields,
    key,
    templateContext: candidate.templateContext ?? existing?.templateContext,
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
): Promise<AuthorCorrespondenceBackgroundResult> => {
  const scrapers = selectScrapers(input);
  if (!scrapers.length) throw new Error("Aucun scrapper compatible n'est sélectionné.");

  const names = uniqueText([input.referenceName, ...input.names]);
  if (!names.length) throw new Error("Aucun nom d'auteur exploitable n'est disponible.");

  const concurrency = Math.max(1, Math.floor(input.scrapingConcurrency));
  const pace = { ...getPaceConfig(input.paceMode), concurrency };
  const maxPages = input.maxPages === null ? 250 : Math.max(1, input.maxPages);
  const candidates = new Map<string, Candidate>();
  const matches = new Map<string, AuthorCorrespondenceMatch>();
  const resolvedTargetsByMatchKey = new Map<string, string>();
  let completedUnits = 0;
  const totalUnits = scrapers.length * names.length;

  const buildResult = (): AuthorCorrespondenceBackgroundResult => ({
    referenceName: input.referenceName,
    matches: Array.from(matches.values()).sort((left, right) => (
      left.authorName.localeCompare(right.authorName) || left.scraperName.localeCompare(right.scraperName)
    )),
    searchedNames: names,
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
    const normalizedResolvedTarget = normalizeAuthorTarget(resolvedTarget || candidate.authorUrl);
    const existing = Array.from(matches.values()).find((entry) => (
      entry.scraperId === candidate.scraperId
      && (
        resolvedTargetsByMatchKey.get(entry.key) === normalizedResolvedTarget
        || normalizeAuthorTarget(entry.authorUrl) === normalizedResolvedTarget
        || normalizeFuzzyText(entry.authorName) === normalizeFuzzyText(candidate.authorName)
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

  const loadSearchSources = async (scraper: ScraperRecord, name: string): Promise<MultiSearchSourceResult[]> => {
    if (!isSearchableScraper(scraper)) return [];
    const results: MultiSearchSourceResult[] = [];
    let nextPageUrl: string | undefined;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
      try {
        const page = await fetchSearchPageWithRetry(
          scraper,
          getSearchConfig(scraper),
          name,
          pageIndex,
          nextPageUrl,
          pace,
          { scrapeDetailsWithCards: input.scrapeDetailsWithCards },
        );
        results.push(...await enrichSourceResultsWithJapaneseRomanization(
          buildSourceResults(scraper, page, pageIndex, name),
        ));
        nextPageUrl = page.nextPageUrl;
        if (!resolveHasNextPage(getSearchConfig(scraper), page)) break;
      } catch (error) {
        if (!isScraperListingPaginationEndError(error) && results.length === 0) throw error;
        break;
      }
    }
    return results;
  };

  await emit();
  await runWithConcurrency(scrapers.flatMap((scraper) => names.map((name) => async () => {
    if (signal.aborted) throw new DOMException("Recherche annulée", "AbortError");
    try {
      const searchSources = await loadSearchSources(scraper, name);
      if (searchSources.length) {
        const extracted = await extractMultiSearchAuthors(searchSources, input.paceMode, undefined, { concurrency, signal });
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
      }

      if (canUseAuthorModule(scraper) && getAuthorConfig(scraper).urlStrategy === "template") {
        for (const authorValue of buildAuthorSearchValues(scraper, name)) {
          try {
            const page = await fetchAuthorPageWithRetry(
              scraper,
              getAuthorConfig(scraper),
              authorValue,
              0,
              undefined,
              pace,
              null,
              { scrapeDetailsWithCards: input.scrapeDetailsWithCards },
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
      completedUnits += 1;
      await emit(`${scraper.name} · ${name}`);
    }
  })), concurrency);

  await runWithConcurrency(Array.from(candidates.values()).map((candidate) => async () => {
    const scraper = scrapers.find((entry) => entry.id === candidate.scraperId);
    if (!scraper || !canUseAuthorModule(scraper)) return;
    try {
      const page = await fetchAuthorPageWithRetry(
        scraper,
        getAuthorConfig(scraper),
        candidate.authorUrl,
        0,
        undefined,
        pace,
        candidate.templateContext ?? null,
        { scrapeDetailsWithCards: input.scrapeDetailsWithCards },
      );
      const previewSources = await enrichSourceResultsWithJapaneseRomanization(
        buildSourceResults(scraper, page, 0, candidate.authorName).slice(0, PREVIEW_RESULT_LIMIT),
      );
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
