import type { AuthorCorrespondenceReferenceSource } from "@/shared/backgroundSearch";
import type { MangaCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { dedupeAuthorCorrespondenceReferenceSources } from "@/renderer/utils/authorCorrespondenceIdentity";

export const collectMangaCorrespondenceAuthors = (
  result: MangaCorrespondenceBackgroundResult,
): { names: string[]; referenceSources: AuthorCorrespondenceReferenceSource[] } => {
  const activeDiscoveries = (result.discoveries ?? []).filter((discovery) => (
    discovery.kind === "author" && discovery.status === "active"
  ));
  const names = buildUniqueAuthorSearchNames([
    ...activeDiscoveries.map((discovery) => discovery.value),
    ...result.matches.flatMap((match) => match.authors),
  ]);
  const discoverySources = activeDiscoveries.flatMap((discovery) => (
    discovery.authorPageUrl
      ? [{
        scraperId: discovery.scraperId,
        authorUrl: discovery.authorPageUrl,
        name: discovery.value,
        templateContext: discovery.authorTemplateContext,
      }]
      : []
  ));
  const matchSources = result.matches.flatMap((match) => {
    const urls = Array.from(new Set([
      match.source.result.authorUrl,
      ...(match.source.result.authorUrls ?? []),
    ].map((url) => url?.trim()).filter((url): url is string => Boolean(url))));
    return urls.map((authorUrl, index) => ({
      scraperId: match.source.scraper.id,
      authorUrl,
      name: match.authors[index] ?? match.authors[0] ?? names[0] ?? "",
    }));
  });
  return {
    names,
    referenceSources: dedupeAuthorCorrespondenceReferenceSources([
      ...discoverySources,
      ...matchSources,
    ]),
  };
};
