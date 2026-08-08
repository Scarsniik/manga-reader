import type { ScraperSearchResultItem } from "@/shared/scraper";

export type ScraperCardMetadataField =
  | "authors"
  | "authorUrls"
  | "languages"
  | "tags"
  | "cover"
  | "summary"
  | "pageCount"
  | "pagination";

export type ScraperCardMetadataRequirements = ReadonlySet<ScraperCardMetadataField>;

export const createScraperCardMetadataRequirements = (
  fields: readonly ScraperCardMetadataField[],
): ScraperCardMetadataRequirements => new Set(fields);

export const SCRAPER_METADATA_REQUIREMENTS_BY_PHASE = {
  authorDiscovery: createScraperCardMetadataRequirements(["authorUrls"]),
  correspondenceCandidate: createScraperCardMetadataRequirements(["authors", "authorUrls"]),
  languageFiltering: createScraperCardMetadataRequirements(["languages"]),
  tagFiltering: createScraperCardMetadataRequirements(["tags"]),
  displayedDetails: createScraperCardMetadataRequirements([
    "authors",
    "authorUrls",
    "languages",
    "tags",
    "summary",
    "pageCount",
  ]),
  coverDisplay: createScraperCardMetadataRequirements(["cover"]),
  pagination: createScraperCardMetadataRequirements(["pagination"]),
} as const;

const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const hasTextList = (value: unknown): boolean => Array.isArray(value) && value.some(hasText);

export const hasScraperCardMetadataField = (
  item: ScraperSearchResultItem,
  field: ScraperCardMetadataField,
): boolean => {
  if (item.detailsMetadataFetched === true) return true;
  switch (field) {
    case "authors":
      return hasTextList(item.authorNames);
    case "authorUrls":
      return hasText(item.authorUrl) || hasTextList(item.authorUrls);
    case "languages":
      return hasTextList(item.languageCodes);
    case "tags":
      return hasTextList(item.tags);
    case "cover":
      return hasText(item.thumbnailUrl) || hasTextList(item.thumbnailCandidates);
    case "summary":
      return hasText(item.summary);
    case "pageCount":
      return hasText(item.pageCount);
    case "pagination":
      return true;
    default:
      return false;
  }
};

export const getMissingScraperCardMetadataFields = (
  item: ScraperSearchResultItem,
  requirements: ScraperCardMetadataRequirements,
): ScraperCardMetadataField[] => Array.from(requirements).filter((field) => (
  !hasScraperCardMetadataField(item, field)
));

export const doesScraperCardNeedMetadata = (
  item: ScraperSearchResultItem,
  requirements: ScraperCardMetadataRequirements,
): boolean => getMissingScraperCardMetadataFields(item, requirements).length > 0;
