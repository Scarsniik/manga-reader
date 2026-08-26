import type { AuthorCorrespondenceRejectedAuthorCandidate } from "@/renderer/backgroundSearch/types";
import type { AuthorCorrespondenceSessionCacheSnapshot } from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import {
  getScraperAuthorFeatureConfig,
  getScraperFeature,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import type {
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceReferenceSource,
} from "@/shared/backgroundSearch";

export type AuthorCorrespondenceRejectedOpenTarget = AuthorCorrespondenceReferenceSource & {
  scraperName: string;
};

export type AuthorCorrespondenceRejectedMangaTarget = {
  scraperId: string;
  scraperName: string;
  sourceUrl: string;
  title: string;
};

const findOpenableMangaSource = (
  sources: Array<MultiSearchSourceResult | undefined>,
): MultiSearchSourceResult | undefined => sources.find((source) => (
  source?.canOpenDetails && Boolean(source.result.detailUrl?.trim())
));

export const buildAuthorCorrespondenceRejectedOpenTargets = (options: {
  candidate: AuthorCorrespondenceRejectedAuthorCandidate;
  input: AuthorCorrespondenceBackgroundInput;
}): AuthorCorrespondenceRejectedOpenTarget[] => {
  const filter = splitIncludeFilterValues(options.input.scraperFilterValues);
  const enabledScrapers = options.input.scrapers.filter((scraper) => !(
      filter.excludedValues.includes(scraper.id)
      || (filter.includedValues.length && !filter.includedValues.includes(scraper.id))
  ));
  const enabledScrapersById = new Map(enabledScrapers.map((scraper) => [scraper.id, scraper]));
  return options.candidate.referenceSources.flatMap((source) => {
    const scraper = enabledScrapersById.get(source.scraperId);
    if (!scraper) return [];

    const feature = getScraperFeature(scraper, "author");
    const config = getScraperAuthorFeatureConfig(feature);
    if (!isScraperFeatureConfigured(feature) || !config) return [];

    return [{ ...source, scraperName: scraper.name }];
  });
};

export const buildAuthorCorrespondenceRejectedMangaTargets = (options: {
  candidate: AuthorCorrespondenceRejectedAuthorCandidate;
  cache: AuthorCorrespondenceSessionCacheSnapshot;
}): AuthorCorrespondenceRejectedMangaTarget[] => {
  const sourcesByKey = new Map<string, MultiSearchSourceResult>();
  options.cache.runs.flatMap((run) => run.results).forEach((source) => {
    sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
  });
  options.cache.mangaEnrichments.flatMap((enrichment) => enrichment.sources).forEach((source) => {
    sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
  });
  const enrichmentsBySeedKey = new Map(options.cache.mangaEnrichments.map((enrichment) => (
    [enrichment.seedKey, enrichment] as const
  )));
  const targetsBySourceKey = new Map<string, AuthorCorrespondenceRejectedMangaTarget>();

  options.candidate.evidenceMangaKeys.forEach((evidenceKey) => {
    const enrichment = enrichmentsBySeedKey.get(evidenceKey);
    const evidenceSources = [
      sourcesByKey.get(evidenceKey),
      ...(enrichment?.anchorSourceKeys.map((sourceKey) => sourcesByKey.get(sourceKey)) ?? []),
      ...(enrichment?.sources ?? []),
    ];
    const candidateScraperIds = new Set(options.candidate.scraperIds);
    const source = findOpenableMangaSource(evidenceSources.filter((candidate) => (
      candidate && candidateScraperIds.has(candidate.scraper.id)
    ))) ?? findOpenableMangaSource(evidenceSources);
    const sourceUrl = source?.result.detailUrl?.trim();
    if (!source || !sourceUrl) return;

    const sourceKey = buildMultiSearchSourceIdentityKey(source);
    if (targetsBySourceKey.has(sourceKey)) return;
    targetsBySourceKey.set(sourceKey, {
      scraperId: source.scraper.id,
      scraperName: source.scraper.name,
      sourceUrl,
      title: source.result.title.trim() || options.candidate.name,
    });
  });

  return Array.from(targetsBySourceKey.values());
};
