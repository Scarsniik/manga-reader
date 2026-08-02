import type { MangaCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
  MangaCorrespondenceRejectedCandidate,
  MangaCorrespondenceRejectedDecision,
} from "@/renderer/backgroundSearch/types";

export type MangaCorrespondenceRejectedReviewUpdate = {
  candidateKeys: string[];
  decision: MangaCorrespondenceRejectedDecision;
  chapter?: string;
  useAsSearchSeed?: boolean;
};

export const updateMangaCorrespondenceRejectedReview = (
  result: MangaCorrespondenceBackgroundResult,
  update: MangaCorrespondenceRejectedReviewUpdate,
): MangaCorrespondenceBackgroundResult => {
  const targetKeys = new Set(update.candidateKeys);
  return {
    ...result,
    rejectedCandidates: (result.rejectedCandidates ?? []).map((candidate) => (
      targetKeys.has(candidate.key)
        ? {
          ...candidate,
          decision: update.decision,
          acceptedChapter: update.decision === "accepted"
            ? update.chapter?.trim() || undefined
            : undefined,
          useAsSearchSeed: update.decision === "accepted"
            ? update.useAsSearchSeed !== false
            : candidate.useAsSearchSeed,
        }
        : candidate
    )),
  };
};

const rejectedCandidateToMatch = (
  candidate: MangaCorrespondenceRejectedCandidate,
  fallbackTitle: string,
): MangaCorrespondenceMatch => ({
  key: candidate.key,
  source: candidate.source,
  analyzedTitle: candidate.analyzedTitle,
  alternativeTitles: candidate.alternativeTitles,
  authors: candidate.authors,
  chapter: candidate.acceptedChapter || candidate.suggestedChapter,
  matchedTerm: candidate.matchedTerm || fallbackTitle,
  discoveredByStepIds: candidate.discoveredByStepIds,
  acceptedManually: true,
});

export const getEffectiveMangaCorrespondenceMatches = (
  result: MangaCorrespondenceBackgroundResult | undefined,
  fallbackTitle: string,
): MangaCorrespondenceMatch[] => {
  if (!result) return [];
  const matches = new Map((result.matches ?? []).map((match) => [match.key, match]));
  (result.rejectedCandidates ?? [])
    .filter((candidate) => candidate.decision === "accepted")
    .forEach((candidate) => {
      if (!matches.has(candidate.key)) {
        matches.set(candidate.key, rejectedCandidateToMatch(candidate, fallbackTitle));
      }
    });
  return Array.from(matches.values());
};

export const countAcceptedMangaCorrespondenceRejections = (
  result: MangaCorrespondenceBackgroundResult | undefined,
): number => (
  (result?.rejectedCandidates ?? []).filter((candidate) => candidate.decision === "accepted").length
);

export const buildMangaCorrespondenceContinuationInput = (
  input: MangaCorrespondenceBackgroundInput,
  result: MangaCorrespondenceBackgroundResult,
): MangaCorrespondenceBackgroundInput => {
  const seedCandidateKeys = (result.rejectedCandidates ?? [])
    .filter((candidate) => (
      candidate.decision === "accepted"
      && candidate.useAsSearchSeed
      && candidate.searchSeedUsedInPass === undefined
    ))
    .map((candidate) => candidate.key);
  return {
    ...input,
    continuation: {
      passNumber: Math.max(2, Math.floor((result.passNumber ?? 1) + 1)),
      seedCandidateKeys,
    },
  };
};
