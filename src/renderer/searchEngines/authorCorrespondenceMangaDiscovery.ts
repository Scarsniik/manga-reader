import type { AuthorCorrespondenceReferenceSource } from "@/shared/backgroundSearch";
import type { MangaCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { dedupeAuthorCorrespondenceReferenceSources } from "@/renderer/utils/authorCorrespondenceIdentity";
import { resolveCompatibleMangaAuthorName } from "@/renderer/utils/mangaMatching/titleProfiles";

const resolveDiscoveredAuthorName = (
  authorName: string,
  referenceNames: string[],
): string | undefined => (
  referenceNames.length
    ? resolveCompatibleMangaAuthorName(authorName, referenceNames)
    : authorName.trim() || undefined
);

export type RejectedMangaCorrespondenceAuthor = {
  name: string;
  scraperId: string;
  scraperName: string;
  sourceTitle?: string;
  authorUrl?: string;
  templateContext?: Record<string, string | undefined> | null;
};

export const collectMangaCorrespondenceAuthors = (
  result: MangaCorrespondenceBackgroundResult,
  options: { referenceNames?: string[] } = {},
): {
  names: string[];
  referenceSources: AuthorCorrespondenceReferenceSource[];
  rejectedAuthors: RejectedMangaCorrespondenceAuthor[];
} => {
  const referenceNames = buildUniqueAuthorSearchNames(options.referenceNames ?? []);
  const activeDiscoveries = (result.discoveries ?? []).filter((discovery) => (
    discovery.kind === "author" && discovery.status === "active"
  ));
  const findDiscoverySourceTitle = (scraperId: string, authorName: string): string | undefined => (
    result.matches.find((match) => (
      match.source.scraper.id === scraperId
      && match.authors.some((candidate) => (
        candidate.trim().toLocaleLowerCase() === authorName.trim().toLocaleLowerCase()
      ))
    ))?.source.result.title
  );
  const candidates: RejectedMangaCorrespondenceAuthor[] = [
    ...activeDiscoveries.map((discovery) => ({
      name: discovery.value,
      scraperId: discovery.scraperId,
      scraperName: discovery.scraperName,
      sourceTitle: findDiscoverySourceTitle(discovery.scraperId, discovery.value),
      authorUrl: discovery.authorPageUrl,
      templateContext: discovery.authorTemplateContext,
    })),
    ...result.matches.flatMap((match) => {
    const urls = (match.source.result.authorUrls?.length
      ? match.source.result.authorUrls
      : match.source.result.authorUrl
        ? [match.source.result.authorUrl]
        : [])
      .map((url) => url.trim())
      .filter(Boolean);
      return match.authors.map((name, index) => ({
        name,
        scraperId: match.source.scraper.id,
        scraperName: match.source.scraper.name,
        sourceTitle: match.source.result.title,
        authorUrl: urls[index]
          ?? (urls.length === 1 && match.authors.length === 1 ? urls[0] : undefined),
      }));
    }),
  ];
  const resolvedCandidates = candidates.map((candidate) => ({
    ...candidate,
    resolvedName: resolveDiscoveredAuthorName(candidate.name, referenceNames),
  }));
  const names = buildUniqueAuthorSearchNames(
    resolvedCandidates.map((candidate) => candidate.resolvedName),
  );
  const referenceSources = resolvedCandidates.flatMap((candidate) => (
    candidate.authorUrl && candidate.resolvedName
      ? [{
        scraperId: candidate.scraperId,
        authorUrl: candidate.authorUrl,
        name: candidate.resolvedName,
        templateContext: candidate.templateContext,
      }]
      : []
  ));
  const rejectedAuthors = Array.from(new Map(resolvedCandidates
    .filter((candidate) => !candidate.resolvedName && candidate.name.trim())
    .map((candidate) => [
      [candidate.scraperId, candidate.authorUrl ?? "", candidate.name.trim().toLocaleLowerCase()].join("::"),
      {
        name: candidate.name.trim(),
        scraperId: candidate.scraperId,
        scraperName: candidate.scraperName,
        sourceTitle: candidate.sourceTitle,
        authorUrl: candidate.authorUrl,
        templateContext: candidate.templateContext,
      },
    ])).values());
  return {
    names,
    referenceSources: dedupeAuthorCorrespondenceReferenceSources(referenceSources),
    rejectedAuthors,
  };
};
