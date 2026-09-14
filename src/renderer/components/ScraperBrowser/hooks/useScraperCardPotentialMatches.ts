import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type { ScraperSearchResultItem } from "@/shared/scraper";
import type { MangaMergeOptions, MatchableManga } from "@/renderer/utils/mangaMatching/titleProfiles";
import type { ScraperTitleAnalysisConfigs } from "@/renderer/utils/scraperTitleAnalysisConfigs";
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
import type {
  BackendPotentialMatchResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";

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

type MatchCacheEntry = {
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
  revision: number;
};

const hasSameMatchCacheRevision = (
  revision: MatchCacheRevision,
  candidates: PotentialMangaMatchCandidateCollections,
  mergeOptions: MangaMergeOptions,
): boolean => (
  revision.bookmarkCandidates === candidates.bookmarkCandidates
  && revision.readingCandidates === candidates.readingCandidates
  && revision.readingListCandidates === candidates.readingListCandidates
  && revision.titleAnalysisConfigs === candidates.titleAnalysisConfigs
  && revision.enableRomajiPhoneticMerge === mergeOptions.enableRomajiPhoneticMerge
);

const buildMatchesFromCache = (
  preparedInputs: Array<{ input: ScraperCardPotentialMatchInput; signature: string }>,
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

let nextPotentialMatchSessionId = 0;

export default function useScraperCardPotentialMatches({
  inputs,
  candidates,
  mergeOptions,
  enabled = true,
}: Options): State {
  const [state, setState] = useState<State>(EMPTY_STATE);
  const sessionIdRef = useRef("");
  if (!sessionIdRef.current) {
    nextPotentialMatchSessionId += 1;
    sessionIdRef.current = `potential-match-${Date.now()}-${nextPotentialMatchSessionId}`;
  }
  const requestIdRef = useRef(0);
  const sentRevisionRef = useRef(-1);
  const matchCacheRef = useRef<MatchCacheRevision>({
    bookmarkCandidates: candidates.bookmarkCandidates,
    enableRomajiPhoneticMerge: mergeOptions.enableRomajiPhoneticMerge,
    entries: new Map(),
    readingCandidates: candidates.readingCandidates,
    readingListCandidates: candidates.readingListCandidates,
    titleAnalysisConfigs: candidates.titleAnalysisConfigs,
    revision: 0,
  });
  if (!hasSameMatchCacheRevision(matchCacheRef.current, candidates, mergeOptions)) {
    matchCacheRef.current = {
      bookmarkCandidates: candidates.bookmarkCandidates,
      enableRomajiPhoneticMerge: mergeOptions.enableRomajiPhoneticMerge,
      entries: new Map(),
      readingCandidates: candidates.readingCandidates,
      readingListCandidates: candidates.readingListCandidates,
      titleAnalysisConfigs: candidates.titleAnalysisConfigs,
      revision: matchCacheRef.current.revision + 1,
    };
    sentRevisionRef.current = -1;
  }
  const validInputs = useMemo(() => inputs.filter((input) => Boolean(input.title.trim())), [inputs]);
  const preparedInputs = useMemo(() => validInputs.map((input) => ({
    input,
    signature: getScraperCardPotentialMatchInputSignature(input),
  })), [validInputs]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    void window.api?.disposeMultiSearchMergeWorker?.(sessionIdRef.current);
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!enabled || !preparedInputs.length) {
      setState(EMPTY_STATE);
      return;
    }
    const revision = matchCacheRef.current;
    if (candidates.loading) {
      setState({
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: true,
        loadingKeys: new Set(preparedInputs.map(({ input }) => input.key)),
      });
      return;
    }
    const missingInputs = preparedInputs.filter(({ input, signature }) => {
      const cached = revision.entries.get(input.key);
      return !cached || cached.signature !== signature;
    });
    const loadingKeys = new Set(missingInputs.map(({ input }) => input.key));

    if (!loadingKeys.size) {
      setState({
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: false,
        loadingKeys,
      });
      return;
    }
    if (typeof window.api?.runPotentialMatchWorker !== "function") {
      setState({
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: false,
        loadingKeys: new Set(),
      });
      return;
    }

    const sendsCandidates = sentRevisionRef.current !== revision.revision;
    if (sendsCandidates) sentRevisionRef.current = revision.revision;
    setState({
      matchesByKey: buildMatchesFromCache(preparedInputs, revision),
      loading: true,
      loadingKeys,
    });
    void window.api.runPotentialMatchWorker(sessionIdRef.current, {
      type: "potentialMatches",
      requestId,
      dataRevision: revision.revision,
      inputs: missingInputs.map(({ input }) => input),
      ...(sendsCandidates ? {
        candidates: {
          readingCandidates: candidates.readingCandidates,
          bookmarkCandidates: candidates.bookmarkCandidates,
          readingListCandidates: candidates.readingListCandidates,
          titleAnalysisConfigs: Array.from(candidates.titleAnalysisConfigs),
          mergeOptions,
        },
      } : {}),
    }).then((response: BackendPotentialMatchResponse) => {
      if (
        requestId !== requestIdRef.current
        || response.dataRevision !== matchCacheRef.current.revision
      ) return;
      if (response.error) throw new Error(response.error);
      const signaturesByKey = new Map(missingInputs.map(({ input, signature }) => [
        input.key,
        signature,
      ]));
      response.matches.forEach(([key, result]) => {
        const signature = signaturesByKey.get(key);
        if (signature) revision.entries.set(key, { result, signature });
      });
      setState({
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: false,
        loadingKeys: new Set(),
      });
    }).catch((error: unknown) => {
      if (requestId !== requestIdRef.current) return;
      // Retry with a fresh candidate snapshot even when this request reused a
      // candidate initialization started by an earlier request.
      sentRevisionRef.current = -1;
      console.warn("Failed to match scraper cards in the backend worker", error);
      setState({
        matchesByKey: buildMatchesFromCache(preparedInputs, revision),
        loading: false,
        loadingKeys: new Set(),
      });
    });
  }, [
    candidates.bookmarkCandidates,
    candidates.loading,
    candidates.readingCandidates,
    candidates.readingListCandidates,
    candidates.titleAnalysisConfigs,
    enabled,
    preparedInputs,
  ]);

  return state;
}
