import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type { ScraperSearchResultItem } from "@/shared/scraper";
import type { MangaMergeOptions, MatchableManga } from "@/renderer/utils/mangaMatching/titleProfiles";
import type { ScraperTitleAnalysisConfigs } from "@/renderer/utils/scraperTitleAnalysisConfigs";
import { enrichMatchableMangasWithJapaneseRomanization } from "@/renderer/utils/mangaMatching/advancedRomanization";
import { extractTentativeAuthorNamesFromTitle } from "@/renderer/utils/mangaMatching/tentativeAuthors";
import {
  getPotentialSeriesReadingState,
  matchPotentialMangaCandidates,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchMatching";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialMangaMatchState,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import type { PotentialMangaMatchCandidateCollections } from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";

export type ScraperCardPotentialMatchInput = {
  key: string;
  scraperId: string;
  title: string;
  sourceUrl?: string | null;
  sourceIdentities?: Array<{
    scraperId: string;
    sourceUrl?: string | null;
  }>;
  authorNames?: string[];
  chapterLabel?: string | null;
};

export type ScraperCardPotentialMatchResult = Omit<ScraperPotentialMangaMatchState, "loading">;

type Options = {
  inputs: ScraperCardPotentialMatchInput[];
  candidates: PotentialMangaMatchCandidateCollections;
  mergeOptions: MangaMergeOptions;
  enabled?: boolean;
};

type State = {
  matchesByKey: Map<string, ScraperCardPotentialMatchResult>;
  loading: boolean;
  loadingKeys: ReadonlySet<string>;
};

const EMPTY_STATE: State = {
  matchesByKey: new Map(),
  loading: false,
  loadingKeys: new Set(),
};
const MATCHING_CHUNK_SIZE = 12;

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const getScraperCardPotentialMatchKey = (
  scraperId: string,
  sourceUrl: string | null | undefined,
  title: string,
): string => [
  scraperId.trim(),
  normalizeScraperViewHistorySourceUrl(sourceUrl),
  title.trim().toLowerCase(),
].join("::");

const getScraperCardSourceIdentities = (
  scraperId: string,
  result: ScraperSearchResultItem,
): ScraperCardPotentialMatchInput["sourceIdentities"] => {
  const seenSourceUrls = new Set<string>();

  return [result.detailUrl, result.detailsSourceUrl].reduce<NonNullable<
    ScraperCardPotentialMatchInput["sourceIdentities"]
  >>((identities, sourceUrl) => {
    const normalizedSourceUrl = normalizeScraperViewHistorySourceUrl(sourceUrl);
    if (!normalizedSourceUrl || seenSourceUrls.has(normalizedSourceUrl)) {
      return identities;
    }

    seenSourceUrls.add(normalizedSourceUrl);
    identities.push({
      scraperId,
      sourceUrl: normalizedSourceUrl,
    });
    return identities;
  }, []);
};

export const buildScraperCardPotentialMatchInput = (
  scraperId: string,
  result: ScraperSearchResultItem,
): ScraperCardPotentialMatchInput => ({
  key: getScraperCardPotentialMatchKey(scraperId, result.detailUrl, result.title),
  scraperId,
  title: result.detailsTitle || result.title,
  sourceUrl: result.detailsSourceUrl || result.detailUrl,
  sourceIdentities: getScraperCardSourceIdentities(scraperId, result),
  authorNames: result.authorNames,
});

export const getScraperCardPotentialMatchInputSignature = (
  input: ScraperCardPotentialMatchInput,
): string => JSON.stringify([
  input.scraperId.trim(),
  normalizeScraperViewHistorySourceUrl(input.sourceUrl),
  input.title.trim().replace(/\s+/g, " ").toLowerCase(),
  String(input.chapterLabel ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
  uniqueValues(input.authorNames ?? [])
    .map((authorName) => authorName.trim().replace(/\s+/g, " ").toLowerCase())
    .sort(),
  (input.sourceIdentities ?? [])
    .map((identity) => [
      identity.scraperId.trim(),
      normalizeScraperViewHistorySourceUrl(identity.sourceUrl),
    ].join("::"))
    .sort(),
]);

export const buildScraperPotentialMatchable = (
  input: ScraperCardPotentialMatchInput,
): MatchableManga | null => {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) {
    return null;
  }

  return {
    title,
    sourceUrl: normalizeScraperViewHistorySourceUrl(input.sourceUrl),
    authorNames: uniqueValues([
      ...extractTentativeAuthorNamesFromTitle(title),
      ...(input.authorNames ?? []),
    ]),
  };
};

const isCurrentSourceMatch = (
  match: ScraperPotentialMangaMatch,
  input: ScraperCardPotentialMatchInput,
): boolean => {
  const target = match.target;
  if (target.kind !== "scraperDetails") {
    return false;
  }

  const sourceIdentities = input.sourceIdentities?.length
    ? input.sourceIdentities
    : [{ scraperId: input.scraperId, sourceUrl: input.sourceUrl }];
  const matchSourceUrl = normalizeScraperViewHistorySourceUrl(target.sourceUrl);

  return sourceIdentities.some((identity) => {
    const sourceUrl = normalizeScraperViewHistorySourceUrl(identity.sourceUrl);
    return Boolean(
      sourceUrl
      && matchSourceUrl === sourceUrl
      && target.scraperId === identity.scraperId
    );
  });
};

export const matchScraperCardPotentialMatchInput = (
  input: ScraperCardPotentialMatchInput,
  current: MatchableManga,
  readingCandidates: ScraperPotentialMangaMatch[],
  bookmarkCandidates: ScraperPotentialMangaMatch[],
  readingListCandidates: ScraperPotentialMangaMatch[],
  mergeOptions: MangaMergeOptions,
  titleAnalysisConfigs: ScraperTitleAnalysisConfigs = new Map(),
): ScraperCardPotentialMatchResult => {
  const allReadingMatches = matchPotentialMangaCandidates(current, readingCandidates, mergeOptions);
  const seriesReadingState = getPotentialSeriesReadingState(
    {
      ...current,
      scraperId: input.scraperId,
      chapterLabel: input.chapterLabel,
    },
    readingCandidates,
    mergeOptions,
    titleAnalysisConfigs,
    allReadingMatches,
  );

  return {
    readingMatches: allReadingMatches
      .filter((match) => !isCurrentSourceMatch(match, input)),
    bookmarkMatches: matchPotentialMangaCandidates(current, bookmarkCandidates, mergeOptions)
      .filter((match) => !isCurrentSourceMatch(match, input)),
    readingListMatches: matchPotentialMangaCandidates(current, readingListCandidates, mergeOptions),
    ...seriesReadingState,
  };
};

const yieldToRenderer = (): Promise<void> => new Promise((resolve) => {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => resolve());
    return;
  }

  setTimeout(resolve, 0);
});

const buildMatchesByKeyIncrementally = async (
  inputs: ScraperCardPotentialMatchInput[],
  currents: MatchableManga[],
  readingCandidates: ScraperPotentialMangaMatch[],
  bookmarkCandidates: ScraperPotentialMangaMatch[],
  readingListCandidates: ScraperPotentialMangaMatch[],
  mergeOptions: MangaMergeOptions,
  titleAnalysisConfigs: ScraperTitleAnalysisConfigs,
): Promise<Map<string, ScraperCardPotentialMatchResult>> => {
  const matchesByKey = new Map<string, ScraperCardPotentialMatchResult>();
  await yieldToRenderer();

  for (let index = 0; index < inputs.length; index += 1) {
    matchesByKey.set(inputs[index].key, matchScraperCardPotentialMatchInput(
      inputs[index],
      currents[index],
      readingCandidates,
      bookmarkCandidates,
      readingListCandidates,
      mergeOptions,
      titleAnalysisConfigs,
    ));

    if ((index + 1) % MATCHING_CHUNK_SIZE === 0) {
      await yieldToRenderer();
    }
  }

  return matchesByKey;
};

export const retainScraperCardPotentialMatches = (
  matchesByKey: Map<string, ScraperCardPotentialMatchResult>,
  inputs: ScraperCardPotentialMatchInput[],
): Map<string, ScraperCardPotentialMatchResult> => {
  const retainedMatches = new Map<string, ScraperCardPotentialMatchResult>();
  inputs.forEach((input) => {
    const current = matchesByKey.get(input.key);
    if (current) {
      retainedMatches.set(input.key, current);
    }
  });
  return retainedMatches;
};

type PreparedInput = {
  input: ScraperCardPotentialMatchInput;
  current: MatchableManga;
  signature: string;
};

type MatchCacheEntry = {
  phase: "enriched" | "stale" | "standard";
  result: ScraperCardPotentialMatchResult;
  signature: string;
};

type MatchCacheRevision = {
  bookmarkCandidates: ScraperPotentialMangaMatch[];
  enableRomajiPhoneticMerge: boolean;
  entries: Map<string, MatchCacheEntry>;
  readingCandidates: ScraperPotentialMangaMatch[];
  readingListCandidates: ScraperPotentialMangaMatch[];
  titleAnalysisConfigs: ScraperTitleAnalysisConfigs;
};

type EnrichedCandidateCollections = {
  bookmarkCandidates: ScraperPotentialMangaMatch[];
  readingCandidates: ScraperPotentialMangaMatch[];
  readingListCandidates: ScraperPotentialMangaMatch[];
};

type EnrichedCandidateCache = {
  bookmarkCandidates: ScraperPotentialMangaMatch[];
  promise: Promise<EnrichedCandidateCollections>;
  readingCandidates: ScraperPotentialMangaMatch[];
  readingListCandidates: ScraperPotentialMangaMatch[];
};

const hasSameMatchCacheRevision = (
  revision: MatchCacheRevision | null,
  candidates: PotentialMangaMatchCandidateCollections,
  mergeOptions: MangaMergeOptions,
): revision is MatchCacheRevision => Boolean(
  revision
  && revision.bookmarkCandidates === candidates.bookmarkCandidates
  && revision.readingCandidates === candidates.readingCandidates
  && revision.readingListCandidates === candidates.readingListCandidates
  && revision.titleAnalysisConfigs === candidates.titleAnalysisConfigs
  && revision.enableRomajiPhoneticMerge === mergeOptions.enableRomajiPhoneticMerge
);

const buildMatchesFromCache = (
  preparedInputs: PreparedInput[],
  revision: MatchCacheRevision,
): Map<string, ScraperCardPotentialMatchResult> => {
  const matchesByKey = new Map<string, ScraperCardPotentialMatchResult>();
  preparedInputs.forEach(({ input, signature }) => {
    const cached = revision.entries.get(input.key);
    if (cached?.signature === signature) {
      matchesByKey.set(input.key, cached.result);
    }
  });
  return matchesByKey;
};

const carryForwardMatchCacheEntries = (
  previousRevision: MatchCacheRevision | null,
  preparedInputs: PreparedInput[],
): Map<string, MatchCacheEntry> => {
  const entries = new Map<string, MatchCacheEntry>();
  if (!previousRevision) {
    return entries;
  }

  // Keep stable badges visible while changed candidate collections are rechecked.
  preparedInputs.forEach(({ input, signature }) => {
    const previousEntry = previousRevision.entries.get(input.key);
    if (previousEntry?.signature === signature) {
      entries.set(input.key, {
        ...previousEntry,
        phase: "stale",
      });
    }
  });
  return entries;
};

const haveSameMatches = (
  left: Map<string, ScraperCardPotentialMatchResult>,
  right: Map<string, ScraperCardPotentialMatchResult>,
): boolean => (
  left.size === right.size
  && Array.from(left).every(([key, value]) => right.get(key) === value)
);

const haveSameKeys = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => (
  left.size === right.size
  && Array.from(left).every((key) => right.has(key))
);

const updateStateIfChanged = (
  setState: Dispatch<SetStateAction<State>>,
  nextState: State,
): void => {
  setState((current) => (
    current.loading === nextState.loading
    && haveSameMatches(current.matchesByKey, nextState.matchesByKey)
    && haveSameKeys(current.loadingKeys, nextState.loadingKeys)
      ? current
      : nextState
  ));
};

const getEnrichedCandidateCollections = (
  cacheRef: MutableRefObject<EnrichedCandidateCache | null>,
  candidates: PotentialMangaMatchCandidateCollections,
): Promise<EnrichedCandidateCollections> => {
  const cached = cacheRef.current;
  if (
    cached
    && cached.bookmarkCandidates === candidates.bookmarkCandidates
    && cached.readingCandidates === candidates.readingCandidates
    && cached.readingListCandidates === candidates.readingListCandidates
  ) {
    return cached.promise;
  }

  const readingCount = candidates.readingCandidates.length;
  const bookmarkCount = candidates.bookmarkCandidates.length;
  const promise = enrichMatchableMangasWithJapaneseRomanization([
    ...candidates.readingCandidates,
    ...candidates.bookmarkCandidates,
    ...candidates.readingListCandidates,
  ]).then((enriched) => ({
    readingCandidates: enriched.slice(0, readingCount) as ScraperPotentialMangaMatch[],
    bookmarkCandidates: enriched.slice(
      readingCount,
      readingCount + bookmarkCount,
    ) as ScraperPotentialMangaMatch[],
    readingListCandidates: enriched.slice(
      readingCount + bookmarkCount,
    ) as ScraperPotentialMangaMatch[],
  }));

  cacheRef.current = {
    bookmarkCandidates: candidates.bookmarkCandidates,
    promise,
    readingCandidates: candidates.readingCandidates,
    readingListCandidates: candidates.readingListCandidates,
  };
  return promise;
};

export default function useScraperCardPotentialMatches({
  inputs,
  candidates,
  mergeOptions,
  enabled = true,
}: Options): State {
  const [state, setState] = useState<State>(EMPTY_STATE);
  const matchCacheRef = useRef<MatchCacheRevision | null>(null);
  const enrichedCandidateCacheRef = useRef<EnrichedCandidateCache | null>(null);
  const validInputs = useMemo(() => inputs.filter((input) => Boolean(input.title.trim())), [inputs]);
  const preparedInputs = useMemo(() => validInputs.reduce<PreparedInput[]>((prepared, input) => {
    const current = buildScraperPotentialMatchable(input);
    if (current) {
      prepared.push({
        input,
        current,
        signature: getScraperCardPotentialMatchInputSignature(input),
      });
    }
    return prepared;
  }, []), [validInputs]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !preparedInputs.length || preparedInputs.length !== validInputs.length) {
      updateStateIfChanged(setState, EMPTY_STATE);
      return () => {
        cancelled = true;
      };
    }

    if (!hasSameMatchCacheRevision(matchCacheRef.current, candidates, mergeOptions)) {
      const previousRevision = matchCacheRef.current;
      matchCacheRef.current = {
        bookmarkCandidates: candidates.bookmarkCandidates,
        enableRomajiPhoneticMerge: mergeOptions.enableRomajiPhoneticMerge,
        entries: carryForwardMatchCacheEntries(previousRevision, preparedInputs),
        readingCandidates: candidates.readingCandidates,
        readingListCandidates: candidates.readingListCandidates,
        titleAnalysisConfigs: candidates.titleAnalysisConfigs,
      };
    }
    const revision = matchCacheRef.current;
    if (candidates.loading) {
      updateStateIfChanged(setState, {
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: true,
        loadingKeys: new Set(preparedInputs.map(({ input }) => input.key)),
      });
      return () => {
        cancelled = true;
      };
    }

    const inputsNeedingStandardPass = preparedInputs.filter(({ input, signature }) => {
      const cached = revision.entries.get(input.key);
      return !cached || cached.signature !== signature || cached.phase === "stale";
    });
    const inputsNeedingEnrichedPass = preparedInputs.filter(({ input, signature }) => {
      const cached = revision.entries.get(input.key);
      return !cached || cached.signature !== signature || cached.phase !== "enriched";
    });
    const loadingKeys = new Set([
      ...inputsNeedingStandardPass,
      ...inputsNeedingEnrichedPass,
    ].map(({ input }) => input.key));

    if (!loadingKeys.size) {
      updateStateIfChanged(setState, {
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: false,
        loadingKeys,
      });
      return () => {
        cancelled = true;
      };
    }

    updateStateIfChanged(setState, {
      matchesByKey: buildMatchesFromCache(preparedInputs, revision),
      loading: true,
      loadingKeys,
    });

    const runMatching = async () => {
      if (inputsNeedingStandardPass.length) {
        const standardMatches = await buildMatchesByKeyIncrementally(
          inputsNeedingStandardPass.map(({ input }) => input),
          inputsNeedingStandardPass.map(({ current }) => current),
          candidates.readingCandidates,
          candidates.bookmarkCandidates,
          candidates.readingListCandidates,
          mergeOptions,
          candidates.titleAnalysisConfigs,
        );
        if (cancelled || matchCacheRef.current !== revision) {
          return;
        }
        inputsNeedingStandardPass.forEach(({ input, signature }) => {
          const result = standardMatches.get(input.key);
          if (result) {
            revision.entries.set(input.key, {
              phase: "standard",
              result,
              signature,
            });
          }
        });
        updateStateIfChanged(setState, {
          matchesByKey: buildMatchesFromCache(preparedInputs, revision),
          loading: true,
          loadingKeys,
        });
      }

      if (cancelled) {
        return;
      }

      const enrichedPassInputs = preparedInputs.filter(({ input, signature }) => {
        const cached = revision.entries.get(input.key);
        return !cached || cached.signature !== signature || cached.phase !== "enriched";
      });
      if (!enrichedPassInputs.length) {
        return;
      }

      const [enrichedCurrents, enrichedCandidates] = await Promise.all([
        enrichMatchableMangasWithJapaneseRomanization(
          enrichedPassInputs.map(({ current }) => current),
        ),
        getEnrichedCandidateCollections(enrichedCandidateCacheRef, candidates),
      ]);
      if (cancelled || matchCacheRef.current !== revision) {
        return;
      }

      const enrichedMatches = await buildMatchesByKeyIncrementally(
        enrichedPassInputs.map(({ input }) => input),
        enrichedCurrents,
        enrichedCandidates.readingCandidates,
        enrichedCandidates.bookmarkCandidates,
        enrichedCandidates.readingListCandidates,
        mergeOptions,
        candidates.titleAnalysisConfigs,
      );
      if (cancelled || matchCacheRef.current !== revision) {
        return;
      }
      enrichedPassInputs.forEach(({ input, signature }) => {
        const result = enrichedMatches.get(input.key);
        if (result) {
          revision.entries.set(input.key, {
            phase: "enriched",
            result,
            signature,
          });
        }
      });
      updateStateIfChanged(setState, {
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: false,
        loadingKeys: new Set(),
      });
    };

    void runMatching()
      .catch(() => {
        // The synchronous pass already produced usable matches.
      })
      .finally(() => {
        if (!cancelled && matchCacheRef.current === revision) {
          updateStateIfChanged(setState, {
            matchesByKey: buildMatchesFromCache(preparedInputs, revision),
            loading: false,
            loadingKeys: new Set(),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    candidates.bookmarkCandidates,
    candidates.loading,
    candidates.readingCandidates,
    candidates.readingListCandidates,
    candidates.titleAnalysisConfigs,
    enabled,
    mergeOptions.enableRomajiPhoneticMerge,
    preparedInputs,
    validInputs,
  ]);

  return state;
}
