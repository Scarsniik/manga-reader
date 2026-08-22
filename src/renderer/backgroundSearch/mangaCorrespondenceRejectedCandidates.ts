import { normalizeCorrespondenceTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
import type { MangaCorrespondenceRejectionReason } from "@/renderer/backgroundSearch/types";

export type MangaCorrespondenceRejectedCandidateScoreInput = {
  titleFields: string[];
  candidateAuthors: string[];
  knownTitles: string[];
  knownAuthors: string[];
  rejectionReason: MangaCorrespondenceRejectionReason;
  matchedTerm?: string;
};

export type MangaCorrespondenceRejectedCandidateScore = {
  score: number;
  reasons: string[];
  bestKnownTitle?: string;
};

type TitleSimilarity = {
  candidateTokens: string[];
  knownTokens: string[];
  commonTokenCount: number;
  orderedTokenCount: number;
  score: number;
};

const tokenizeTitle = (value: string): string[] => {
  const normalized = normalizeCorrespondenceTitle(value);
  if (!normalized) return [];
  const words = normalized.split(" ").filter(Boolean);
  if (words.length > 1) return words;
  return Array.from(normalized);
};

const countOrderedTokens = (left: string[], right: string[]): number => {
  if (!left.length || !right.length) return 0;
  const previous = new Array<number>(right.length + 1).fill(0);
  left.forEach((leftToken) => {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const above = previous[index];
      previous[index] = leftToken === right[index - 1]
        ? diagonal + 1
        : Math.max(previous[index], previous[index - 1]);
      diagonal = above;
    }
  });
  return previous[right.length];
};

const getTitleSimilarity = (candidateTitle: string, knownTitle: string): TitleSimilarity => {
  const candidateTokens = tokenizeTitle(candidateTitle);
  const knownTokens = tokenizeTitle(knownTitle);
  const candidateCounts = new Map<string, number>();
  candidateTokens.forEach((token) => candidateCounts.set(token, (candidateCounts.get(token) ?? 0) + 1));
  let commonTokenCount = 0;
  knownTokens.forEach((token) => {
    const remaining = candidateCounts.get(token) ?? 0;
    if (!remaining) return;
    commonTokenCount += 1;
    candidateCounts.set(token, remaining - 1);
  });
  const orderedTokenCount = countOrderedTokens(knownTokens, candidateTokens);
  const knownCoverage = knownTokens.length ? commonTokenCount / knownTokens.length : 0;
  const candidateCoverage = candidateTokens.length ? commonTokenCount / candidateTokens.length : 0;
  const orderedCoverage = knownTokens.length ? orderedTokenCount / knownTokens.length : 0;
  const sameOpening = knownTokens.length >= 2
    && candidateTokens.length >= 2
    && knownTokens[0] === candidateTokens[0]
    && knownTokens[1] === candidateTokens[1];
  const score = Math.round(
    knownCoverage * 55
    + candidateCoverage * 15
    + orderedCoverage * 20
    + (sameOpening ? 5 : 0),
  );
  return {
    candidateTokens,
    knownTokens,
    commonTokenCount,
    orderedTokenCount,
    score,
  };
};

const authorsOverlap = (candidateAuthors: string[], knownAuthors: string[]): boolean => {
  const knownKeys = new Set(knownAuthors.map(normalizeCorrespondenceTitle).filter(Boolean));
  return candidateAuthors.some((author) => knownKeys.has(normalizeCorrespondenceTitle(author)));
};

export const scoreMangaCorrespondenceRejectedCandidate = ({
  titleFields,
  candidateAuthors,
  knownTitles,
  knownAuthors,
  rejectionReason,
  matchedTerm,
}: MangaCorrespondenceRejectedCandidateScoreInput): MangaCorrespondenceRejectedCandidateScore => {
  let best: { title: string; similarity: TitleSimilarity } | undefined;
  titleFields.forEach((candidateTitle) => {
    knownTitles.forEach((knownTitle) => {
      const similarity = getTitleSimilarity(candidateTitle, knownTitle);
      if (!best || similarity.score > best.similarity.score) {
        best = { title: knownTitle, similarity };
      }
    });
  });
  const similarity: TitleSimilarity = best?.similarity ?? {
    candidateTokens: [],
    knownTokens: [],
    commonTokenCount: 0,
    orderedTokenCount: 0,
    score: 0,
  };
  const authorMatch = authorsOverlap(candidateAuthors, knownAuthors);
  let score = matchedTerm ? Math.max(88, similarity.score) : similarity.score;
  if (authorMatch) score += 15;
  if (rejectionReason === "chapterMismatch") score = Math.max(score, 82);
  if (rejectionReason === "derivative") score -= 30;
  score = Math.max(0, Math.min(99, Math.round(score)));

  const reasons: string[] = [];
  if (similarity.knownTokens.length && similarity.commonTokenCount) {
    reasons.push(
      `${similarity.commonTokenCount}/${similarity.knownTokens.length} éléments du titre de référence retrouvés`,
    );
  }
  if (
    similarity.knownTokens.length
    && similarity.orderedTokenCount / similarity.knownTokens.length >= 0.6
  ) {
    reasons.push("Éléments communs conservés dans le même ordre");
  }
  if (authorMatch) reasons.push("Auteur identique");
  if (rejectionReason === "authorMismatch") {
    reasons.push("Auteur explicite trop éloigné de la référence");
  }
  if (
    !matchedTerm
    && similarity.knownTokens.length
    && similarity.commonTokenCount / similarity.knownTokens.length >= 0.6
  ) {
    reasons.push("Segment différent, traduit ou ajouté dans le titre");
  }
  if (rejectionReason === "chapterMismatch") {
    reasons.push("Chapitre différent de celui demandé");
  } else if (rejectionReason === "derivative") {
    reasons.push("Version dérivée ou contenu annexe détecté");
  } else if (!reasons.length) {
    reasons.push("Titre trop éloigné des références connues");
  }

  return {
    score,
    reasons,
    bestKnownTitle: best?.title,
  };
};

export const getMangaCorrespondenceScoreBand = (
  score: number,
): "likely" | "possible" | "distant" => {
  if (score >= 75) return "likely";
  if (score >= 50) return "possible";
  return "distant";
};

export const shouldFetchMangaCorrespondenceCandidateDetails = (
  input: MangaCorrespondenceRejectedCandidateScoreInput,
): boolean => (
  Boolean(input.matchedTerm)
  || getMangaCorrespondenceScoreBand(
    scoreMangaCorrespondenceRejectedCandidate(input).score,
  ) !== "distant"
);
