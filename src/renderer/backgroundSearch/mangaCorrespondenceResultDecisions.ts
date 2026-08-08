import type { MangaCorrespondenceResultDecision } from "@/shared/backgroundSearch";
import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
  MangaCorrespondenceRejectedCandidate,
} from "@/renderer/backgroundSearch/types";

type ResultCandidate = MangaCorrespondenceMatch | MangaCorrespondenceRejectedCandidate;

const toDecision = (
  candidate: ResultCandidate,
  origin: MangaCorrespondenceResultDecision["origin"],
  previous?: MangaCorrespondenceResultDecision,
): MangaCorrespondenceResultDecision => ({
  key: candidate.key,
  status: previous?.status ?? "active",
  title: candidate.source.result.title,
  analyzedTitle: candidate.analyzedTitle,
  alternativeTitles: [...candidate.alternativeTitles],
  authors: [...candidate.authors],
  scraperId: candidate.source.scraper.id,
  scraperName: candidate.source.scraper.name,
  sourceUrl: candidate.source.result.detailUrl,
  origin,
});

export const buildMangaCorrespondenceResultDecisions = (
  result: MangaCorrespondenceBackgroundResult | undefined,
): MangaCorrespondenceResultDecision[] => {
  if (!result) return [];
  const decisions = new Map((result.resultDecisions ?? []).map((decision) => [decision.key, decision]));
  (result.matches ?? []).forEach((match) => {
    decisions.set(match.key, toDecision(match, "match", decisions.get(match.key)));
  });
  (result.rejectedCandidates ?? []).forEach((candidate) => {
    if (decisions.get(candidate.key)?.origin === "match") return;
    decisions.set(candidate.key, toDecision(candidate, "potential", decisions.get(candidate.key)));
  });
  return Array.from(decisions.values()).sort((left, right) => (
    left.status.localeCompare(right.status)
    || left.scraperName.localeCompare(right.scraperName)
    || left.title.localeCompare(right.title)
  ));
};

export const updateMangaCorrespondenceResultStatuses = (
  result: MangaCorrespondenceBackgroundResult,
  updates: ReadonlyMap<string, MangaCorrespondenceResultDecision["status"]>,
): MangaCorrespondenceBackgroundResult => ({
  ...result,
  resultDecisions: buildMangaCorrespondenceResultDecisions(result).map((decision) => ({
    ...decision,
    status: updates.get(decision.key) ?? decision.status,
  })),
});

export const getInvalidatedMangaCorrespondenceResultKeys = (
  result: MangaCorrespondenceBackgroundResult | undefined,
): Set<string> => new Set(buildMangaCorrespondenceResultDecisions(result)
  .filter((decision) => decision.status === "invalidated")
  .map((decision) => decision.key));
