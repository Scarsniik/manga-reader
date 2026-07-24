import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchProgress,
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceTraceStep,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import {
  buildSourceResults,
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
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import { getMangaTitleMergeMatchKind } from "@/renderer/utils/mangaMatching/titleProfiles";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import { inferMangaCorrespondenceFirstChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import { isScraperListingPaginationEndError } from "@/renderer/utils/scraperRuntime";
import type {
  BackgroundSearchExecutionResult,
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
} from "@/renderer/backgroundSearch/types";
import {
  doesCorrespondenceTitleContainKnownTitle,
} from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
import { isBackgroundListingPaginationStalled } from "@/renderer/backgroundSearch/backgroundListingBlacklist";
import { runAuthorCorrespondenceSearch } from "@/renderer/backgroundSearch/authorCorrespondenceEngine";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type DiscoveryTask = {
  kind: "title" | "author";
  term: string;
  parentId?: string;
  directTargets?: Array<{
    scraper: ScraperRecord;
    url: string;
    templateContext?: Record<string, string | undefined> | null;
  }>;
};

const MAX_DISCOVERY_TASKS = 80;
const MAX_DISCOVERED_TITLES = 18;
const MAX_DISCOVERED_AUTHORS = 18;

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
  trace: MangaCorrespondenceTraceStep[],
  searchedTitles: string[],
  searchedAuthors: string[],
): MangaCorrespondenceBackgroundResult => ({
  request: input.request,
  matches: Array.from(matches.values()),
  trace: [...trace],
  searchedTitles: [...searchedTitles],
  searchedAuthors: [...searchedAuthors],
});

const sourceMatchesReference = (
  input: MangaCorrespondenceBackgroundInput,
  source: MultiSearchSourceResult,
  knownTitles: string[],
): { analyzedTitle: string; alternativeTitles: string[]; authors: string[]; chapter?: string; matchedTerm?: string } => {
  const config = getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis"));
  const analysis = analyzeMangaCorrespondenceTitle(source.result.title, config);
  const parsedAuthorKeys = analysis.authors.map(normalizeKey);
  const supplementalAuthors = [...(source.result.authorNames ?? []), ...source.tentativeAuthorNames]
    .filter((author) => !parsedAuthorKeys.some((parsedAuthor) => normalizeKey(author).includes(parsedAuthor)));
  const authors = uniqueText([...analysis.authors, ...supplementalAuthors]);
  const candidate = {
    title: [analysis.title, ...analysis.alternativeTitles].join(", "),
    sourceUrl: source.result.detailUrl,
    authorNames: authors,
    advancedRomanizedTitleVariants: source.advancedRomanizedTitleVariants,
    advancedRomanizedAuthorNameVariants: source.advancedRomanizedTentativeAuthorNameVariants,
  };
  const matchedTerm = knownTitles.find((title) => (
    doesCorrespondenceTitleContainKnownTitle(source.result.title, title)
    || getMangaTitleMergeMatchKind(
      { title, authorNames: input.reference.authors },
      candidate,
      { enableRomajiPhoneticMerge: input.enableRomajiPhoneticMerge },
    ) !== null
  ));
  const chapter = analysis.chapter
    ?? inferMangaCorrespondenceFirstChapter(analysis, knownTitles);
  return {
    analyzedTitle: analysis.title,
    alternativeTitles: analysis.alternativeTitles,
    authors,
    chapter,
    matchedTerm,
  };
};

export const runMangaCorrespondenceSearch = async (
  input: MangaCorrespondenceBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
): Promise<MangaCorrespondenceBackgroundResult> => {
  const scrapers = selectScrapers(input);
  if (!scrapers.length) throw new Error("Aucun scrapper compatible n'est sélectionné.");

  const concurrency = Math.max(1, Math.floor(input.scrapingConcurrency));
  const pace = { ...getPaceConfig(input.paceMode), concurrency };
  const maxPages = input.maxPages === null ? 250 : Math.max(1, input.maxPages);
  const referenceScraper = scrapers.find((scraper) => scraper.id === input.reference.scraperId) ?? scrapers[0];
  const referenceAnalysis = analyzeMangaCorrespondenceTitle(
    input.reference.rawTitle,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(referenceScraper, "titleAnalysis")),
  );
  const knownTitles = uniqueText([input.reference.title, ...input.reference.alternativeTitles]);
  const referenceChapter = input.reference.chapter
    || referenceAnalysis.chapter
    || inferMangaCorrespondenceFirstChapter(referenceAnalysis, knownTitles);
  const trace: MangaCorrespondenceTraceStep[] = [];
  const matches = new Map<string, MangaCorrespondenceMatch>();
  const knownAuthors = uniqueText(input.reference.authors);
  const searchedTitles: string[] = [];
  const searchedAuthors: string[] = [];
  const queuedKeys = new Set<string>();
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
  knownTitles.forEach((term) => addTask({ kind: "title", term }));
  knownAuthors.forEach((term) => addTask({ kind: "author", term }));
  input.reference.authorUrls.forEach((url) => {
    const scraper = scrapers.find((entry) => entry.id === input.reference.scraperId);
    if (scraper) addTask({ kind: "author", term: knownAuthors[0] || url, directTargets: [{ scraper, url }] });
  });

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
  const emit = async (label?: string): Promise<void> => onSnapshot(
    buildResult(input, matches, trace, searchedTitles, searchedAuthors),
    {
      completedUnits: processedTasks,
      totalUnits: processedTasks + queue.length,
      resultCount: matches.size,
      currentLabel: label,
    },
  );
  const discoverFromSources = async (
    sources: MultiSearchSourceResult[],
    step: MangaCorrespondenceTraceStep,
  ): Promise<void> => {
    let accepted = 0;
    const acceptedSources: MultiSearchSourceResult[] = [];
    sources.forEach((source) => {
      const analyzed = sourceMatchesReference(input, source, knownTitles);
      if (!analyzed.matchedTerm) return;
      if (input.request === "sameManga" && referenceChapter && analyzed.chapter && referenceChapter !== analyzed.chapter) return;
      const key = buildMultiSearchSourceIdentityKey(source);
      const existing = matches.get(key);
      matches.set(key, {
        key,
        source,
        analyzedTitle: analyzed.analyzedTitle,
        alternativeTitles: analyzed.alternativeTitles,
        authors: analyzed.authors,
        chapter: analyzed.chapter,
        matchedTerm: analyzed.matchedTerm,
        discoveredByStepIds: uniqueText([...(existing?.discoveredByStepIds ?? []), step.id]),
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
      uniqueText([analyzed.analyzedTitle, ...analyzed.alternativeTitles]).forEach((title) => {
        if (knownTitles.length >= MAX_DISCOVERED_TITLES || knownTitles.some((value) => normalizeKey(value) === normalizeKey(title))) return;
        knownTitles.push(title);
        const titleStep = addTrace("titleDiscovered", "Titre correspondant trouvé", title, step.id);
        addTask({ kind: "title", term: title, parentId: titleStep.id });
      });
    });
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
        });
        const pageSources = await enrichSourceResultsWithJapaneseRomanization(
          buildSourceResults(scraper, page, pageIndex, term),
        );
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
          { scrapeDetailsWithCards: input.scrapeDetailsWithCards },
        );
        const pageSources = await enrichSourceResultsWithJapaneseRomanization(
          buildSourceResults(scraper, page, pageIndex, term),
        );
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
      const discoveredTitle = queue.findIndex((task) => task.kind === "title" && Boolean(task.parentId));
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

  return buildResult(input, matches, trace, searchedTitles, searchedAuthors);
};
