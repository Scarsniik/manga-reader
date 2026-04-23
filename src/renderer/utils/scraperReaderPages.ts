import {
  buildScraperContextTemplateUrl,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from "@/shared/scraper";
import {
  buildScraperTemplateContextFromDetails,
  resolveScraperTemplateBaseUrl,
  type ScraperTemplateContext,
} from "@/renderer/utils/scraperTemplateContext";
import {
  usesScraperPagesChapters,
  usesScraperPagesSelectorSource,
  usesScraperPagesTemplateChapterContext,
} from "@/renderer/utils/scraperPages";
import {
  resolveScraperPageUrls,
  ScraperDocumentFetcher,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime";

type ResolveScraperReaderPageUrlsOptions = {
  chapter?: ScraperRuntimeChapterResult | null;
  knownTotalPages?: number | null;
  maxTemplatePages?: number;
};

const DEFAULT_MAX_TEMPLATE_PAGES = 2000;

const hasPagePlaceholder = (template: string | undefined): boolean => (
  typeof template === "string" && /{{\s*page(?:Index)?\d*\s*}}/.test(template)
);

const padPageNumber = (value: number, length: number): string => String(value).padStart(length, "0");

const buildTemplateContextForPage = (
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

const normalizePositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const parseReaderPageCount = (value: string | undefined): number | null => {
  const match = String(value ?? "").match(/\d+/);
  return match ? normalizePositiveInteger(match[0]) : null;
};

const isImageLikeContentType = (contentType: string | undefined): boolean => (
  typeof contentType === "string" && contentType.toLowerCase().startsWith("image/")
);

const canBuildSequentialTemplateReaderPages = (
  pagesConfig: ScraperPagesFeatureConfig,
): boolean => Boolean(
  !usesScraperPagesSelectorSource(pagesConfig)
  && !pagesConfig.pageImageSelector
  && pagesConfig.urlTemplate
  && hasPagePlaceholder(pagesConfig.urlTemplate)
);

const inferKnownTotalPages = (
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  chapter: ScraperRuntimeChapterResult | null,
  knownTotalPages: number | null,
): number | null => {
  const explicitPageCount = normalizePositiveInteger(knownTotalPages);
  if (explicitPageCount) {
    return explicitPageCount;
  }

  if (chapter || usesScraperPagesChapters(pagesConfig)) {
    return null;
  }

  const detailsPageCount = parseReaderPageCount(details.pageCount);
  if (detailsPageCount) {
    return detailsPageCount;
  }

  const thumbnailsCount = Array.isArray(details.thumbnails) ? details.thumbnails.length : 0;
  if (thumbnailsCount > 0 && !details.thumbnailsNextPageUrl) {
    return thumbnailsCount;
  }

  return null;
};

const createSequentialTemplateReaderPageUrlFactory = (
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  chapter: ScraperRuntimeChapterResult | null,
): ((pageNumber: number) => string) => {
  const detailsUrl = details.finalUrl || details.requestedUrl;
  const usesTemplateChapterContext = usesScraperPagesTemplateChapterContext(pagesConfig);
  const templateBaseUrl = resolveScraperTemplateBaseUrl(
    scraper.baseUrl,
    pagesConfig.templateBase,
    usesTemplateChapterContext && chapter?.url
      ? chapter.url
      : detailsUrl,
  );
  const templateContext = buildScraperTemplateContextFromDetails(details, chapter);

  return (pageNumber: number) => buildScraperContextTemplateUrl(
    scraper.baseUrl,
    pagesConfig.urlTemplate || "",
    buildTemplateContextForPage(templateContext, Math.max(0, pageNumber - 1)),
    {
      relativeToUrl: templateBaseUrl,
    },
  );
};

const buildSequentialTemplateReaderPageUrls = (
  buildPageUrl: (pageNumber: number) => string,
  totalPages: number,
): string[] => {
  const pageUrls: string[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pageUrls.push(buildPageUrl(pageNumber));
  }

  return Array.from(new Set(pageUrls));
};

const detectSequentialTemplateReaderPageCount = async (
  buildPageUrl: (pageNumber: number) => string,
  fetchDocument: ScraperDocumentFetcher,
  baseUrl: string,
  maxTemplatePages: number,
): Promise<number | null> => {
  const existenceCache = new Map<number, Promise<boolean>>();

  const pageExists = (pageNumber: number): Promise<boolean> => {
    const normalizedPageNumber = Math.max(1, Math.floor(pageNumber));
    const cached = existenceCache.get(normalizedPageNumber);
    if (cached) {
      return cached;
    }

    const request = fetchDocument({
      baseUrl,
      targetUrl: buildPageUrl(normalizedPageNumber),
    })
      .then((result) => Boolean(result.ok && isImageLikeContentType(result.contentType)))
      .catch(() => false);

    existenceCache.set(normalizedPageNumber, request);
    return request;
  };

  if (!(await pageExists(1))) {
    return null;
  }

  let low = 1;
  let high = 2;

  while (high <= maxTemplatePages && await pageExists(high)) {
    low = high;
    high *= 2;
  }

  const missingUpperBound = Math.min(high, maxTemplatePages + 1);

  while (low + 1 < missingUpperBound) {
    const mid = Math.floor((low + missingUpperBound) / 2);
    if (await pageExists(mid)) {
      low = mid;
      continue;
    }

    high = mid;
    break;
  }

  let left = low;
  let right = Math.min(high, maxTemplatePages + 1);

  while (left + 1 < right) {
    const mid = Math.floor((left + right) / 2);
    if (await pageExists(mid)) {
      left = mid;
    } else {
      right = mid;
    }
  }

  return left;
};

export async function resolveScraperReaderPageUrls(
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  fetchDocument: ScraperDocumentFetcher,
  options?: ResolveScraperReaderPageUrlsOptions,
): Promise<string[]> {
  const chapter = options?.chapter ?? null;
  const knownTotalPages = normalizePositiveInteger(options?.knownTotalPages);
  const maxTemplatePages = Math.max(
    1,
    normalizePositiveInteger(options?.maxTemplatePages)
      ?? knownTotalPages
      ?? DEFAULT_MAX_TEMPLATE_PAGES,
  );

  if (!canBuildSequentialTemplateReaderPages(pagesConfig)) {
    return resolveScraperPageUrls(scraper, details, pagesConfig, fetchDocument, {
      chapter,
      maxTemplatePages,
    });
  }

  const buildPageUrl = createSequentialTemplateReaderPageUrlFactory(
    scraper,
    details,
    pagesConfig,
    chapter,
  );
  const totalPages = inferKnownTotalPages(details, pagesConfig, chapter, knownTotalPages)
    ?? await detectSequentialTemplateReaderPageCount(
      buildPageUrl,
      fetchDocument,
      scraper.baseUrl,
      maxTemplatePages,
    );

  if (!totalPages) {
    return resolveScraperPageUrls(scraper, details, pagesConfig, fetchDocument, {
      chapter,
      maxTemplatePages,
    });
  }

  return buildSequentialTemplateReaderPageUrls(buildPageUrl, totalPages);
}
