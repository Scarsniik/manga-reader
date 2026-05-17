import {
  buildScraperContextTemplateUrl,
  type ScraperAuthorFeatureConfig,
  type ScraperHomepageFeatureConfig,
  type ScraperPagesFeatureConfig,
  type ScraperSearchFeatureConfig,
  type ScraperTagFeatureConfig,
} from "@/shared/scraper";
import {
  buildScraperTemplateContextFromDetails,
  type ScraperTemplateContext,
} from "@/renderer/utils/scraperTemplateContext";
import { usesScraperPagesChapters } from "@/renderer/utils/scraperPages";
import type {
  ScraperDocumentFetcher,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime/types";
import { isImageLikeContentType, uniqueValues } from "@/renderer/utils/scraperRuntime/selectorExtraction";

const padPageNumber = (value: number, length: number): string => String(value).padStart(length, "0");

export const hasPagePlaceholder = (template: string | undefined): boolean =>
  typeof template === "string" && /{{\s*page(?:Index)?\d*\s*}}/.test(template);

export const hasSearchPagePlaceholder = (
  config: ScraperSearchFeatureConfig | ScraperHomepageFeatureConfig | null | undefined,
): boolean => hasPagePlaceholder(config?.urlTemplate);

export const hasAuthorPagePlaceholder = (config: ScraperAuthorFeatureConfig | null | undefined): boolean =>
  hasPagePlaceholder(config?.urlTemplate);

export const hasTagPagePlaceholder = (config: ScraperTagFeatureConfig | null | undefined): boolean =>
  hasPagePlaceholder(config?.urlTemplate);

const normalizePositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "").match(/\d+/)?.[0] ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

export const inferTemplateSelectorPageLimit = (
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  chapter: ScraperRuntimeChapterResult | null,
  maxTemplatePages: number,
): { isKnownTotal: boolean; pageLimit: number } => {
  if (!chapter && !usesScraperPagesChapters(pagesConfig)) {
    const detailsPageCount = normalizePositiveInteger(details.pageCount);
    if (detailsPageCount) {
      return {
        isKnownTotal: true,
        pageLimit: Math.min(detailsPageCount, maxTemplatePages),
      };
    }
  }

  return {
    isKnownTotal: false,
    pageLimit: maxTemplatePages,
  };
};

const buildSequentialImageUrl = (
  prefix: string,
  index: number,
  padLength: number,
  extension: string,
  suffix: string,
): string => `${prefix}${String(index).padStart(padLength, "0")}${extension}${suffix}`;

const parseSequentialImagePattern = (
  imageUrl: string,
): {
  prefix: string;
  startIndex: number;
  padLength: number;
  extension: string;
  suffix: string;
} | null => {
  const match = imageUrl.match(/^(.*\/)(\d+)(\.[^./?#]+)([?#].*)?$/);
  if (!match) {
    return null;
  }

  const startIndex = Number.parseInt(match[2], 10);
  if (!Number.isFinite(startIndex)) {
    return null;
  }

  return {
    prefix: match[1],
    startIndex,
    padLength: match[2].length,
    extension: match[3],
    suffix: match[4] || "",
  };
};

export const resolveSequentialPageUrlsFromCover = async (
  details: ScraperRuntimeDetailsResult,
  fetchDocument: ScraperDocumentFetcher,
  maxTemplatePages: number,
): Promise<string[] | null> => {
  const coverUrl = String(details.cover || "").trim();
  const imagePattern = parseSequentialImagePattern(coverUrl);
  if (!imagePattern) {
    return null;
  }

  const pageUrls: string[] = [];

  for (let pageOffset = 0; pageOffset < maxTemplatePages; pageOffset += 1) {
    const targetUrl = buildSequentialImageUrl(
      imagePattern.prefix,
      imagePattern.startIndex + pageOffset,
      imagePattern.padLength,
      imagePattern.extension,
      imagePattern.suffix,
    );
    const result = await fetchDocument({
      baseUrl: details.requestedUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      if (pageOffset === 0) {
        return null;
      }
      break;
    }

    pageUrls.push(result.finalUrl || result.requestedUrl);
  }

  return pageUrls.length ? uniqueValues(pageUrls) : null;
};

export const buildTemplateContextForPage = (
  context: ScraperTemplateContext,
  pageIndex: number,
): ScraperTemplateContext => ({
  ...context,
  page: String(pageIndex + 1),
  page2: padPageNumber(pageIndex + 1, 2),
  page3: padPageNumber(pageIndex + 1, 3),
  page4: padPageNumber(pageIndex + 1, 4),
  pageIndex: String(pageIndex),
  pageIndex2: padPageNumber(pageIndex, 2),
  pageIndex3: padPageNumber(pageIndex, 3),
  pageIndex4: padPageNumber(pageIndex, 4),
});
