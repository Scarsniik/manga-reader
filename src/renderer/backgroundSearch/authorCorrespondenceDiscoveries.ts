import type {
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceReferenceSource,
} from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  MangaCorrespondenceDiscovery,
} from "@/renderer/backgroundSearch/types";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import { dedupeAuthorCorrespondenceReferenceSources } from "@/renderer/utils/authorCorrespondenceIdentity";
import {
  buildMangaCorrespondenceDiscoveryKey,
  normalizeMangaCorrespondenceDiscoveryValue,
} from "@/renderer/backgroundSearch/mangaCorrespondenceDiscoveries";

const GLOBAL_SCRAPER_ID = "all-scrapers";
const GLOBAL_SCRAPER_NAME = "Toutes les sources";

const createAuthorDiscovery = (options: {
  value: string;
  scraperId?: string;
  scraperName?: string;
  origin: MangaCorrespondenceDiscovery["origin"];
  authorPageUrl?: string;
  authorTemplateContext?: Record<string, string | undefined>;
}): MangaCorrespondenceDiscovery | null => {
  const value = options.value.trim().replace(/\s+/g, " ");
  if (!value) return null;
  const scraperId = options.scraperId ?? GLOBAL_SCRAPER_ID;
  return {
    key: buildMangaCorrespondenceDiscoveryKey("author", scraperId, value),
    kind: "author",
    value,
    normalizedValue: normalizeMangaCorrespondenceDiscoveryValue(value),
    scraperId,
    scraperName: options.scraperName ?? GLOBAL_SCRAPER_NAME,
    origin: options.origin,
    ...(options.authorPageUrl ? {
      sourceUrl: options.authorPageUrl,
      authorPageUrl: options.authorPageUrl,
    } : {}),
    ...(options.authorTemplateContext ? {
      authorTemplateContext: options.authorTemplateContext,
    } : {}),
    parentStepIds: [],
    evidenceCount: 1,
    status: "active",
    propagationConfidence: options.origin === "manual" ? "manual" : "reference",
    foundAt: new Date().toISOString(),
  };
};

const addDiscovery = (
  discoveries: Map<string, MangaCorrespondenceDiscovery>,
  discovery: MangaCorrespondenceDiscovery | null,
): void => {
  if (!discovery) return;
  const existing = discoveries.get(discovery.key);
  discoveries.set(discovery.key, existing ? {
    ...discovery,
    ...existing,
    evidenceCount: Math.max(existing.evidenceCount, discovery.evidenceCount),
    authorPageUrl: existing.authorPageUrl ?? discovery.authorPageUrl,
    sourceUrl: existing.sourceUrl ?? discovery.sourceUrl,
    authorTemplateContext: existing.authorTemplateContext ?? discovery.authorTemplateContext,
  } : discovery);
};

export const buildInitialAuthorCorrespondenceDiscoveries = (
  input: AuthorCorrespondenceBackgroundInput,
  result?: AuthorCorrespondenceBackgroundResult,
): MangaCorrespondenceDiscovery[] => {
  const discoveries = new Map<string, MangaCorrespondenceDiscovery>(
    (result?.discoveries ?? []).map((discovery) => [discovery.key, discovery]),
  );
  buildUniqueAuthorSearchNames([
    input.referenceName,
    ...input.names,
    ...(result?.searchedNames ?? []),
    ...(result?.mangaDiscovery?.names ?? []),
  ]).forEach((value) => addDiscovery(discoveries, createAuthorDiscovery({
    value,
    origin: "reference",
  })));

  const referenceSources = dedupeAuthorCorrespondenceReferenceSources([
    ...input.referenceSources,
    ...(result?.mangaDiscovery?.referenceSources ?? []),
  ]);
  referenceSources.forEach((source) => {
    const scraperName = input.scrapers.find((scraper) => scraper.id === source.scraperId)?.name
      ?? source.scraperId;
    addDiscovery(discoveries, createAuthorDiscovery({
      value: source.name || input.referenceName,
      scraperId: source.scraperId,
      scraperName,
      origin: "reference",
      authorPageUrl: source.authorUrl,
      authorTemplateContext: source.templateContext ?? undefined,
    }));
  });

  result?.matches.forEach((match) => addDiscovery(discoveries, createAuthorDiscovery({
    value: match.authorName,
    scraperId: match.scraperId,
    scraperName: match.scraperName,
    origin: "authorPage",
    authorPageUrl: match.authorUrl,
    authorTemplateContext: match.templateContext ?? undefined,
  })));

  return Array.from(discoveries.values());
};

export const buildAuthorCorrespondenceReplayInput = (
  input: AuthorCorrespondenceBackgroundInput,
  discoveries: MangaCorrespondenceDiscovery[],
): AuthorCorrespondenceBackgroundInput => {
  const activeDiscoveries = discoveries.filter((discovery) => (
    discovery.kind === "author" && discovery.status === "active"
  ));
  const names = buildUniqueAuthorSearchNames(activeDiscoveries.map((discovery) => discovery.value));
  const referenceSources: AuthorCorrespondenceReferenceSource[] = activeDiscoveries.flatMap((discovery) => (
    discovery.authorPageUrl && discovery.scraperId !== GLOBAL_SCRAPER_ID
      ? [{
        scraperId: discovery.scraperId,
        authorUrl: discovery.authorPageUrl,
        name: discovery.value,
        ...(discovery.authorTemplateContext ? {
          templateContext: discovery.authorTemplateContext,
        } : {}),
      }]
      : []
  ));
  return {
    ...input,
    referenceName: names[0] ?? "",
    names,
    referenceSources: dedupeAuthorCorrespondenceReferenceSources(referenceSources),
    replay: {
      revision: Math.max(1, Math.floor((input.replay?.revision ?? 0) + 1)),
    },
  };
};
