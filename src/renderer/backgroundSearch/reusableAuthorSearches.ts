import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchJob,
  MangaCorrespondenceBackgroundInput,
} from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  MangaCorrespondenceBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { normalizeAuthorCorrespondenceTarget } from "@/renderer/utils/authorCorrespondenceIdentity";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";

export type ReusableAuthorSearchCandidate = {
  job: ReusableAuthorSearchJob;
  matchedNames: string[];
  matchedAuthorUrls: string[];
  matchedByAuthorUrl: boolean;
  automaticallyCompatible: boolean;
  automaticImportBlocked: boolean;
  corpusScore: number;
};

export type ReusableAuthorSearchJob = BackgroundSearchJob<
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceBackgroundResult
> & { result: AuthorCorrespondenceBackgroundResult };

type ReusableMangaSearchJob = BackgroundSearchJob<
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceBackgroundResult
> & { result: MangaCorrespondenceBackgroundResult };

const normalizeAuthorNameKey = (value: string): string => normalizeFuzzyText(value);

const collectMangaAuthorNames = (
  input: MangaCorrespondenceBackgroundInput,
  result: MangaCorrespondenceBackgroundResult,
): string[] => buildUniqueAuthorSearchNames([
  ...input.reference.authors,
  ...(result.discoveries ?? [])
    .filter((discovery) => discovery.kind === "author" && discovery.status === "active")
    .map((discovery) => discovery.value),
  ...result.matches.flatMap((match) => match.authors),
]);

const collectMangaAuthorUrls = (
  input: MangaCorrespondenceBackgroundInput,
  result: MangaCorrespondenceBackgroundResult,
): string[] => Array.from(new Set([
  ...input.reference.authorUrls,
  ...(result.discoveries ?? [])
    .filter((discovery) => (
      discovery.kind === "author"
      && discovery.status === "active"
      && Boolean(discovery.authorPageUrl)
    ))
    .map((discovery) => discovery.authorPageUrl ?? ""),
  ...result.matches.flatMap((match) => (
    match.source.result.authorUrls?.length
      ? match.source.result.authorUrls
      : match.source.result.authorUrl
        ? [match.source.result.authorUrl]
        : []
  )),
].map(normalizeAuthorCorrespondenceTarget).filter(Boolean)));

export const collectAuthorSearchCorpusNames = (
  job: ReusableAuthorSearchJob,
): string[] => buildUniqueAuthorSearchNames([
  job.input.referenceName,
  ...job.input.names,
  ...job.result.searchedNames,
  ...job.result.matches.flatMap((match) => [match.authorName, match.matchedName]),
]);

const collectAuthorSearchCorpusUrls = (
  job: ReusableAuthorSearchJob,
): string[] => Array.from(new Set([
  ...job.input.referenceSources.map((source) => source.authorUrl),
  ...job.result.matches.map((match) => match.authorUrl),
].map(normalizeAuthorCorrespondenceTarget).filter(Boolean)));

const getCorpusScore = (
  job: ReusableAuthorSearchJob,
): number => {
  const advanced = job.result.advancedSearch;
  return (
    job.metadata.progress.resultCount * 100
    + (advanced?.discoveredAuthorPageCount ?? 0) * 20
    + (advanced?.processedMangaCount ?? 0) * 5
    + job.result.matches.length
  );
};

const isImportableAuthorJob = (
  job: BackgroundSearchJob,
): job is ReusableAuthorSearchJob => (
  job.metadata.kind === "authorCorrespondence"
  && (job.metadata.status === "completed" || job.metadata.status === "cancelled")
  && Boolean(job.result)
  && Boolean(job.input)
);

export const buildReusableAuthorSearchCandidates = (
  mangaJob: ReusableMangaSearchJob,
  jobs: BackgroundSearchJob[],
): ReusableAuthorSearchCandidate[] => {
  const mangaAuthorNames = collectMangaAuthorNames(mangaJob.input, mangaJob.result);
  const mangaNamesByKey = new Map(mangaAuthorNames.map((name) => [normalizeAuthorNameKey(name), name]));
  const mangaAuthorUrls = new Set(collectMangaAuthorUrls(mangaJob.input, mangaJob.result));

  return jobs
    .filter(isImportableAuthorJob)
    .map((job): ReusableAuthorSearchCandidate => {
      const corpusNames = collectAuthorSearchCorpusNames(job);
      const matchedNames = buildUniqueAuthorSearchNames(corpusNames.flatMap((name) => {
        const mangaName = mangaNamesByKey.get(normalizeAuthorNameKey(name));
        return mangaName ? [mangaName] : [];
      }));
      const matchedAuthorUrls = collectAuthorSearchCorpusUrls(job).filter((url) => mangaAuthorUrls.has(url));
      return {
        job,
        matchedNames,
        matchedAuthorUrls,
        matchedByAuthorUrl: matchedAuthorUrls.length > 0,
        automaticallyCompatible: matchedAuthorUrls.length > 0 || matchedNames.length > 0,
        automaticImportBlocked: job.result.advancedSearch?.automaticMangaReplayBlocked === true,
        corpusScore: getCorpusScore(job),
      };
    })
    .sort((left, right) => (
      Number(right.automaticallyCompatible) - Number(left.automaticallyCompatible)
      || Number(left.automaticImportBlocked) - Number(right.automaticImportBlocked)
      || Number(right.matchedByAuthorUrl) - Number(left.matchedByAuthorUrl)
      || right.corpusScore - left.corpusScore
      || right.job.metadata.updatedAt.localeCompare(left.job.metadata.updatedAt)
    ));
};

export const selectAutomaticReusableAuthorSearch = (
  mangaJob: ReusableMangaSearchJob,
  jobs: BackgroundSearchJob[],
): ReusableAuthorSearchCandidate | undefined => {
  const alreadyCoveredAuthorKeys = new Set((mangaJob.input.linkedAuthorImports ?? [])
    .flatMap((entry) => entry.names)
    .map(normalizeAuthorNameKey)
    .filter(Boolean));
  const importedAuthorJobIds = new Set((mangaJob.input.linkedAuthorImports ?? [])
    .map((entry) => entry.authorJobId));
  const alreadyCoveredAuthorUrls = new Set((mangaJob.input.linkedAuthorImports ?? [])
    .flatMap((entry) => entry.referenceSources)
    .map((source) => normalizeAuthorCorrespondenceTarget(source.authorUrl))
    .filter(Boolean));

  return buildReusableAuthorSearchCandidates(mangaJob, jobs).find((candidate) => (
    candidate.automaticallyCompatible
    && !candidate.automaticImportBlocked
    && !importedAuthorJobIds.has(candidate.job.metadata.id)
    && candidate.job.metadata.relation?.parentJobId !== mangaJob.metadata.id
    && (
      candidate.matchedAuthorUrls.some((url) => !alreadyCoveredAuthorUrls.has(url))
      || candidate.matchedNames.some((name) => !alreadyCoveredAuthorKeys.has(normalizeAuthorNameKey(name)))
    )
  ));
};
