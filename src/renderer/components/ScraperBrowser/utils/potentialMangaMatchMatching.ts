import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import {
  getMangaMergeMatchKind,
  getMangaTitleMergeMatchKind,
  type MatchableManga,
  type MangaMergeOptions,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import type { ScraperTitleAnalysisConfigs } from "@/renderer/utils/scraperTitleAnalysisConfigs";
import {
  analyzeScraperSeriesSequence,
  compareScraperSeriesSequenceProgress,
  formatScraperSeriesSequence,
  isScraperSeriesSequenceAfterFirst,
  isScraperSeriesSequenceEarlier,
  type ScraperSeriesSequence,
  type ScraperSeriesSequenceInput,
} from "@/renderer/utils/scraperSeriesSequence";
import {
  collectIndexedMangaMatchCandidates,
  createMangaMatchCandidateIndex,
  type MangaMatchCandidateIndex,
} from "@/renderer/utils/mangaMatching/matchCandidateIndex";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialReadingStatus,
  ScraperPotentialSeriesProgress,
  ScraperPotentialSeriesReadingWarning,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

const potentialMatchCandidateIndexCache = new WeakMap<
  ScraperPotentialMangaMatch[],
  Map<string, MangaMatchCandidateIndex<ScraperPotentialMangaMatch>>
>();
const potentialSeriesSequenceCache = new WeakMap<
  ScraperPotentialMangaMatch,
  WeakMap<object, ScraperSeriesSequence | null>
>();

const getCandidateIndex = (
  candidates: ScraperPotentialMangaMatch[],
  options: MangaMergeOptions,
): MangaMatchCandidateIndex<ScraperPotentialMangaMatch> => {
  const cacheKey = [
    options.enableRomajiPhoneticMerge ? "phonetic" : "standard",
    options.assumeSameAuthor ? "same-author" : "check-author",
  ].join(":");
  const cachedIndexes = potentialMatchCandidateIndexCache.get(candidates);
  const cachedIndex = cachedIndexes?.get(cacheKey);
  if (cachedIndex) {
    return cachedIndex;
  }

  const index = createMangaMatchCandidateIndex(candidates, options);
  if (cachedIndexes) {
    cachedIndexes.set(cacheKey, index);
  } else {
    potentialMatchCandidateIndexCache.set(candidates, new Map([[cacheKey, index]]));
  }
  return index;
};

const compareDatesDescending = (
  left: string | undefined,
  right: string | undefined,
): number => (
  Date.parse(right || "") - Date.parse(left || "")
);

const getReadingStatusRank = (status: ScraperPotentialReadingStatus | undefined): number => {
  if (status === "read") {
    return 2;
  }

  if (status === "inProgress") {
    return 1;
  }

  return 0;
};

const getTargetKey = (match: ScraperPotentialMangaMatch): string => {
  if (match.target.kind === "library") {
    return `library:${match.target.title.toLowerCase()}`;
  }

  return `scraper:${match.target.scraperId}:${normalizeScraperViewHistorySourceUrl(match.target.sourceUrl)}`;
};

const dedupeMatches = (
  matches: ScraperPotentialMangaMatch[],
): ScraperPotentialMangaMatch[] => {
  const matchesByKey = new Map<string, ScraperPotentialMangaMatch>();

  matches.forEach((match) => {
    const key = `${match.category}:${getTargetKey(match)}`;
    const current = matchesByKey.get(key);
    if (!current) {
      matchesByKey.set(key, match);
      return;
    }

    const statusCompare = getReadingStatusRank(match.readingStatus) - getReadingStatusRank(current.readingStatus);
    if (statusCompare > 0 || (statusCompare === 0 && compareDatesDescending(match.updatedAt, current.updatedAt) < 0)) {
      matchesByKey.set(key, match);
    }
  });

  return Array.from(matchesByKey.values());
};

const sortMatches = (matches: ScraperPotentialMangaMatch[]): ScraperPotentialMangaMatch[] => (
  [...matches].sort((left, right) => {
    const statusCompare = getReadingStatusRank(right.readingStatus) - getReadingStatusRank(left.readingStatus);
    if (statusCompare !== 0) {
      return statusCompare;
    }

    const dateCompare = compareDatesDescending(left.updatedAt, right.updatedAt);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

export const matchPotentialMangaCandidates = (
  current: MatchableManga,
  candidates: ScraperPotentialMangaMatch[],
  options: MangaMergeOptions,
): ScraperPotentialMangaMatch[] => (
  sortMatches(dedupeMatches(
    collectIndexedMangaMatchCandidates(
      getCandidateIndex(candidates, options),
      current,
    )
      .map((candidate) => ({
        ...candidate,
        matchKind: getMangaMergeMatchKind(current, candidate, options) ?? undefined,
      }))
      .filter((candidate) => Boolean(candidate.matchKind)),
  ))
);

const buildSeriesMatchable = (
  input: ScraperSeriesSequenceInput,
  sequence: ScraperSeriesSequence,
): MatchableManga => ({
  title: sequence.matchTitle,
  authorNames: sequence.authorNames,
  advancedRomanizedAuthorNameVariants: input.advancedRomanizedAuthorNameVariants,
  advancedRomanizedContextualAuthorNameVariants: input.advancedRomanizedContextualAuthorNameVariants,
});

const getCandidateSeriesSequence = (
  candidate: ScraperPotentialMangaMatch,
  configsByScraperId: ScraperTitleAnalysisConfigs,
): ScraperSeriesSequence | null => {
  const configKey = configsByScraperId as object;
  const cachedByConfig = potentialSeriesSequenceCache.get(candidate);
  if (cachedByConfig?.has(configKey)) {
    return cachedByConfig.get(configKey) ?? null;
  }

  const sequence = analyzeScraperSeriesSequence(candidate, configsByScraperId);
  if (cachedByConfig) {
    cachedByConfig.set(configKey, sequence);
  } else {
    potentialSeriesSequenceCache.set(candidate, new WeakMap([[configKey, sequence]]));
  }
  return sequence;
};

export type PotentialSeriesReadingState = {
  seriesProgress: ScraperPotentialSeriesProgress | null;
  seriesReadingWarning: ScraperPotentialSeriesReadingWarning | null;
};

export const getPotentialSeriesReadingState = (
  current: ScraperSeriesSequenceInput,
  readingCandidates: ScraperPotentialMangaMatch[],
  options: MangaMergeOptions,
  configsByScraperId: ScraperTitleAnalysisConfigs = new Map(),
  currentReadingMatches: ScraperPotentialMangaMatch[] = [],
): PotentialSeriesReadingState => {
  const currentSequence = analyzeScraperSeriesSequence(current, configsByScraperId);
  if (!currentSequence || !isScraperSeriesSequenceAfterFirst(currentSequence)) {
    return {
      seriesProgress: null,
      seriesReadingWarning: null,
    };
  }

  const currentSeriesMatchable = buildSeriesMatchable(current, currentSequence);
  const earlierReadings = readingCandidates.flatMap((candidate) => {
    if (!candidate.readingStatus) {
      return [];
    }
    const candidateSequence = getCandidateSeriesSequence(candidate, configsByScraperId);
    if (
      !candidateSequence
      || candidateSequence.family !== currentSequence.family
      || !isScraperSeriesSequenceEarlier(candidateSequence, currentSequence)
      || !getMangaTitleMergeMatchKind(
        currentSeriesMatchable,
        buildSeriesMatchable(candidate, candidateSequence),
        options,
      )
    ) {
      return [];
    }

    return [{ candidate, sequence: candidateSequence }];
  });
  const latestEarlierReading = [...earlierReadings].sort((left, right) => (
    compareScraperSeriesSequenceProgress(right.sequence, left.sequence)
    || getReadingStatusRank(right.candidate.readingStatus)
      - getReadingStatusRank(left.candidate.readingStatus)
    || compareDatesDescending(left.candidate.updatedAt, right.candidate.updatedAt)
  ))[0] ?? null;
  const hasCurrentCompletedReading = currentReadingMatches.some((candidate) => (
    candidate.readingStatus === "read"
  ));
  const hasCompletedPreviousReading = earlierReadings.some(({ candidate }) => (
    candidate.readingStatus === "read"
  ));
  const seriesProgress = latestEarlierReading
    ? {
      currentSequenceLabel: formatScraperSeriesSequence(currentSequence),
      previousSequenceLabel: formatScraperSeriesSequence(latestEarlierReading.sequence, "end"),
      readingStatus: latestEarlierReading.candidate.readingStatus as ScraperPotentialReadingStatus,
      seriesTitle: currentSequence.seriesTitle,
    }
    : null;

  return {
    seriesProgress,
    seriesReadingWarning: hasCurrentCompletedReading || hasCompletedPreviousReading
      ? null
      : {
        sequenceLabel: formatScraperSeriesSequence(currentSequence),
        seriesTitle: currentSequence.seriesTitle,
      },
  };
};
