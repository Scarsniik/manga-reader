import type { AuthorCorrespondenceRejectedAuthorCandidate } from "@/renderer/backgroundSearch/types";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import { buildAuthorModuleSearchValues } from "@/renderer/utils/authorSearchNames";
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

const STANDARD_AUTHOR_TEMPLATE_KEYS = new Set([
  "page",
  "pageindex",
  "pagenumber",
  "query",
  "rawquery",
  "rawvalue",
  "search",
  "value",
]);

const buildNameOnlyTemplateContext = (
  urlTemplate: string | undefined,
  authorQuery: string,
): Record<string, string> | undefined => {
  const entries = Array.from(urlTemplate?.matchAll(/{{\s*(?:raw:)?([^}]+?)\s*}}/g) ?? [])
    .map((match) => match[1].trim())
    .filter((key) => !STANDARD_AUTHOR_TEMPLATE_KEYS.has(key.toLocaleLowerCase()))
    .map((key) => [key, authorQuery] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

export const buildAuthorCorrespondenceRejectedOpenTargets = (options: {
  candidate: AuthorCorrespondenceRejectedAuthorCandidate;
  input: AuthorCorrespondenceBackgroundInput;
}): AuthorCorrespondenceRejectedOpenTarget[] => {
  const filter = splitIncludeFilterValues(options.input.scraperFilterValues);
  const directSourcesByScraper = new Map(options.candidate.referenceSources.map((source) => (
    [source.scraperId, source] as const
  )));
  const enabledScrapers = options.input.scrapers.filter((scraper) => !(
      filter.excludedValues.includes(scraper.id)
      || (filter.includedValues.length && !filter.includedValues.includes(scraper.id))
  ));
  const enabledScrapersById = new Map(enabledScrapers.map((scraper) => [scraper.id, scraper]));
  const evidenceScrapers = options.candidate.scraperIds.flatMap((scraperId) => {
    const scraper = enabledScrapersById.get(scraperId);
    return scraper ? [scraper] : [];
  });
  const buildTargets = (scrapers: typeof enabledScrapers) => scrapers.flatMap((scraper) => {
    const feature = getScraperFeature(scraper, "author");
    const config = getScraperAuthorFeatureConfig(feature);
    if (!isScraperFeatureConfigured(feature) || !config) return [];

    const directSource = directSourcesByScraper.get(scraper.id);
    if (directSource) {
      return [{ ...directSource, scraperName: scraper.name }];
    }
    if (config.urlStrategy !== "template") return [];

    const authorQuery = buildAuthorModuleSearchValues(config, options.candidate.name)[0];
    if (!authorQuery) return [];
    return [{
      scraperId: scraper.id,
      scraperName: scraper.name,
      authorUrl: authorQuery,
      name: options.candidate.name,
      templateContext: buildNameOnlyTemplateContext(config.urlTemplate, authorQuery),
    }];
  });

  const evidenceTargets = buildTargets(evidenceScrapers);
  return evidenceTargets.length ? evidenceTargets : buildTargets(enabledScrapers);
};
