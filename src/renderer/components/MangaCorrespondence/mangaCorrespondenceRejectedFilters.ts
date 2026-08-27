import type { MangaCorrespondenceRejectedCandidate } from "@/renderer/backgroundSearch/types";
import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";

const REJECTION_REASON_LABELS: Record<MangaCorrespondenceRejectedCandidate["rejectionReason"], string> = {
  titleMismatch: "titre différent",
  authorMismatch: "auteur différent",
  chapterMismatch: "chapitre différent",
  derivative: "version dérivée contenu annexe",
  invalidatedResult: "résultat invalidé",
};

const DECISION_LABELS: Record<MangaCorrespondenceRejectedCandidate["decision"], string> = {
  pending: "à examiner en attente",
  accepted: "acceptée validée",
  dismissed: "écartée refusée",
};

const buildCandidateSearchText = (candidate: MangaCorrespondenceRejectedCandidate): string => (
  normalizeFuzzyText([
    candidate.source.result.title,
    candidate.analyzedTitle,
    ...candidate.alternativeTitles,
    ...candidate.authors,
    ...candidate.source.tentativeAuthorNames,
    candidate.source.scraper.name,
    candidate.source.scraper.id,
    ...candidate.source.contentTypes,
    ...candidate.source.sourceLanguageCodes,
    candidate.matchedTerm,
    candidate.suggestedChapter,
    candidate.acceptedChapter,
    candidate.score,
    ...candidate.scoreReasons,
    REJECTION_REASON_LABELS[candidate.rejectionReason],
    DECISION_LABELS[candidate.decision],
  ].filter((value) => value !== undefined).join(" "))
);

const parseRejectedFilterTerms = (value: string): string[][] => (
  parseMultiSearchTerms(value)
    .map((term) => normalizeFuzzyText(term).split(" ").filter(Boolean))
    .filter((tokens) => tokens.length > 0)
);

export const filterMangaCorrespondenceRejectedCandidatesByText = (
  candidates: MangaCorrespondenceRejectedCandidate[],
  value: string,
): MangaCorrespondenceRejectedCandidate[] => {
  const terms = parseRejectedFilterTerms(value);
  if (!terms.length) return candidates;

  return candidates.filter((candidate) => {
    const searchableText = buildCandidateSearchText(candidate);
    return terms.some((tokens) => tokens.every((token) => searchableText.includes(token)));
  });
};
