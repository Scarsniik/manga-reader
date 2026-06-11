import {
  buildScraperContextTemplateUrl,
  hasScraperFieldSelectorValue,
  ScraperFieldSelector,
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
  usesScraperPagesLinkedPages,
  usesScraperPagesSelectorSource,
  usesScraperPagesTemplateChapterContext,
} from "@/renderer/utils/scraperPages";
import {
  extractSelectorValues,
  resolveScraperPageUrls,
  ScraperDocumentFetcher,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  toAbsoluteScraperUrl,
} from "@/renderer/utils/scraperRuntime";
import { buildRemoteReaderImageUrl } from "@/renderer/utils/remoteImages";

type ResolveScraperReaderPageUrlsOptions = {
  chapter?: ScraperRuntimeChapterResult | null;
  initialPage?: number | null;
  knownTotalPages?: number | null;
  maxTemplatePages?: number;
};

const DEFAULT_MAX_TEMPLATE_PAGES = 2000;
const LAZY_TEMPLATE_SELECTOR_PAGE_URL = "scraper-lazy-page://image";

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
  && !hasScraperFieldSelectorValue(pagesConfig.pageImageSelector)
  && pagesConfig.urlTemplate
  && hasPagePlaceholder(pagesConfig.urlTemplate)
);

const usesTemplateSelectorReaderPages = (
  pagesConfig: ScraperPagesFeatureConfig,
): boolean => Boolean(
  !usesScraperPagesSelectorSource(pagesConfig)
  && !(usesScraperPagesLinkedPages(pagesConfig) && hasScraperFieldSelectorValue(pagesConfig.pageLinkSelector))
  && hasScraperFieldSelectorValue(pagesConfig.pageImageSelector)
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

const inferDetailsConfiguredPageCount = (
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  chapter: ScraperRuntimeChapterResult | null,
): number | null => {
  if (chapter || usesScraperPagesChapters(pagesConfig)) {
    return null;
  }

  return parseReaderPageCount(details.pageCount);
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

const buildLazyTemplateSelectorReaderPageUrl = (
  pageUrl: string,
  baseUrl: string,
  pageImageSelector: ScraperFieldSelector,
): string => {
  const params = new URLSearchParams({
    baseUrl,
    pageUrl,
    selectorKind: pageImageSelector.kind,
    selectorValue: pageImageSelector.value,
  });

  return `${LAZY_TEMPLATE_SELECTOR_PAGE_URL}?${params.toString()}`;
};

const buildLazyTemplateSelectorReaderPageUrls = (
  buildPageUrl: (pageNumber: number) => string,
  baseUrl: string,
  pageImageSelector: ScraperFieldSelector,
  totalPages: number,
): string[] => {
  const pageUrls: string[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pageUrls.push(buildLazyTemplateSelectorReaderPageUrl(
      buildPageUrl(pageNumber),
      baseUrl,
      pageImageSelector,
    ));
  }

  return pageUrls;
};

const buildLazyLinkedReaderPageUrls = (
  pageUrls: string[],
  baseUrl: string,
  pageImageSelector: ScraperFieldSelector,
): string[] => pageUrls.map((pageUrl) => buildLazyTemplateSelectorReaderPageUrl(
  pageUrl,
  baseUrl,
  pageImageSelector,
));

const parseLazyTemplateSelectorReaderPageUrl = (
  source: string,
): {
  baseUrl: string;
  pageUrl: string;
  pageImageSelector: ScraperFieldSelector;
} | null => {
  if (!source.startsWith(LAZY_TEMPLATE_SELECTOR_PAGE_URL)) {
    return null;
  }

  try {
    const parsed = new URL(source);
    const baseUrl = parsed.searchParams.get("baseUrl")?.trim() ?? "";
    const pageUrl = parsed.searchParams.get("pageUrl")?.trim() ?? "";
    const selectorKind = parsed.searchParams.get("selectorKind") === "regex" ? "regex" : "css";
    const selectorValue = parsed.searchParams.get("selectorValue")?.trim() ?? "";

    if (!baseUrl || !pageUrl || !selectorValue) {
      return null;
    }

    return {
      baseUrl,
      pageUrl,
      pageImageSelector: {
        kind: selectorKind,
        value: selectorValue,
      },
    };
  } catch {
    return null;
  }
};

export const isLazyScraperReaderPageUrl = (source: string | null | undefined): boolean => (
  typeof source === "string" && source.startsWith(LAZY_TEMPLATE_SELECTOR_PAGE_URL)
);

const buildReaderImageUrl = (pageUrl: string, refererUrl: string): string =>
  buildRemoteReaderImageUrl(pageUrl, refererUrl) ?? pageUrl;

const buildReaderImageUrls = (pageUrls: string[], refererUrl: string): string[] =>
  pageUrls.map((pageUrl) => (
    isLazyScraperReaderPageUrl(pageUrl)
      ? pageUrl
      : buildReaderImageUrl(pageUrl, refererUrl)
  ));

const resolveTemplateSelectorReaderPageImageUrl = async (
  fetchDocument: ScraperDocumentFetcher,
  baseUrl: string,
  pageUrl: string,
  pageImageSelector: ScraperFieldSelector,
): Promise<string | null> => {
  const result = await fetchDocument({
    baseUrl,
    targetUrl: pageUrl,
  });

  if (!result.ok || !result.html) {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(result.html, "text/html");
  const documentUrl = result.finalUrl || result.requestedUrl;
  return extractSelectorValues(doc, pageImageSelector)
    .map((value) => toAbsoluteScraperUrl(value, documentUrl))
    .filter(Boolean)[0] ?? null;
};

const extractUniqueLinkedReaderPageUrls = (
  doc: Document,
  pageLinkSelector: ScraperFieldSelector,
  documentUrl: string,
): string[] => {
  const seen = new Set<string>();

  return extractSelectorValues(doc, pageLinkSelector)
    .map((value) => toAbsoluteScraperUrl(value, documentUrl))
    .filter((pageUrl) => {
      if (!pageUrl || seen.has(pageUrl)) {
        return false;
      }

      seen.add(pageUrl);
      return true;
    });
};

const resolveLinkedReaderPageUrlsFromSource = async (
  fetchDocument: ScraperDocumentFetcher,
  baseUrl: string,
  sourceUrl: string,
  pageLinkSelector: ScraperFieldSelector,
): Promise<string[]> => {
  const result = await fetchDocument({
    baseUrl,
    targetUrl: sourceUrl,
  });

  if (!result.ok || !result.html) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(result.html, "text/html");
  const documentUrl = result.finalUrl || result.requestedUrl;

  return extractUniqueLinkedReaderPageUrls(doc, pageLinkSelector, documentUrl);
};

export const resolveLazyScraperReaderPageUrl = async (
  source: string,
  fetchDocument: ScraperDocumentFetcher,
): Promise<string | null> => {
  const lazyPage = parseLazyTemplateSelectorReaderPageUrl(source);
  if (!lazyPage) {
    return null;
  }

  const resolvedImageUrl = await resolveTemplateSelectorReaderPageImageUrl(
    fetchDocument,
    lazyPage.baseUrl,
    lazyPage.pageUrl,
    lazyPage.pageImageSelector,
  );

  return resolvedImageUrl ? buildReaderImageUrl(resolvedImageUrl, lazyPage.pageUrl) : null;
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

const detectTemplateSelectorReaderPageCount = async (
  buildPageUrl: (pageNumber: number) => string,
  fetchDocument: ScraperDocumentFetcher,
  baseUrl: string,
  pageImageSelector: ScraperFieldSelector,
  maxTemplatePages: number,
): Promise<number | null> => {
  const existenceCache = new Map<number, Promise<boolean>>();

  const pageExists = (pageNumber: number): Promise<boolean> => {
    const normalizedPageNumber = Math.max(1, Math.floor(pageNumber));
    const cached = existenceCache.get(normalizedPageNumber);
    if (cached) {
      return cached;
    }

    const request = resolveTemplateSelectorReaderPageImageUrl(
      fetchDocument,
      baseUrl,
      buildPageUrl(normalizedPageNumber),
      pageImageSelector,
    )
      .then(Boolean)
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
  const configuredMaxTemplatePages = normalizePositiveInteger(options?.maxTemplatePages);
  const shouldIgnoreKnownTotalAsLimit = usesTemplateSelectorReaderPages(pagesConfig);
  const maxTemplatePages = Math.max(
    1,
    configuredMaxTemplatePages
      ?? (shouldIgnoreKnownTotalAsLimit ? null : knownTotalPages)
      ?? DEFAULT_MAX_TEMPLATE_PAGES,
  );
  const readerImageRefererUrl = chapter?.url || details.finalUrl || details.requestedUrl;

  if (
    usesScraperPagesLinkedPages(pagesConfig)
    && usesScraperPagesSelectorSource(pagesConfig)
    && pagesConfig.pageLinkSelector
    && hasScraperFieldSelectorValue(pagesConfig.pageLinkSelector)
    && pagesConfig.pageImageSelector
    && hasScraperFieldSelectorValue(pagesConfig.pageImageSelector)
  ) {
    if (usesScraperPagesChapters(pagesConfig) && !chapter?.url) {
      throw new Error("Choisis d'abord un chapitre pour recuperer les pages.");
    }

    const sourceUrl = pagesConfig.urlStrategy === "chapter_page"
      ? chapter?.url || ""
      : details.finalUrl || details.requestedUrl;
    const linkedPageUrls = await resolveLinkedReaderPageUrlsFromSource(
      fetchDocument,
      scraper.baseUrl,
      sourceUrl,
      pagesConfig.pageLinkSelector,
    );

    if (!linkedPageUrls.length) {
      const fallbackPageUrls = await resolveScraperPageUrls(scraper, details, pagesConfig, fetchDocument, {
        chapter,
        maxTemplatePages,
      });
      return buildReaderImageUrls(fallbackPageUrls, readerImageRefererUrl);
    }

    const totalPages = linkedPageUrls.length;
    const initialPage = Math.max(
      1,
      Math.min(totalPages, normalizePositiveInteger(options?.initialPage) ?? 1),
    );
    const pageUrls = buildLazyLinkedReaderPageUrls(
      linkedPageUrls,
      scraper.baseUrl,
      pagesConfig.pageImageSelector,
    );
    const initialPageUrl = await resolveTemplateSelectorReaderPageImageUrl(
      fetchDocument,
      scraper.baseUrl,
      linkedPageUrls[initialPage - 1],
      pagesConfig.pageImageSelector,
    );

    if (!initialPageUrl) {
      throw new Error("La page demandee n'a pas pu etre resolue.");
    }

    pageUrls[initialPage - 1] = buildReaderImageUrl(initialPageUrl, linkedPageUrls[initialPage - 1]);
    return pageUrls;
  }

  if (usesTemplateSelectorReaderPages(pagesConfig) && pagesConfig.pageImageSelector) {
    const buildPageUrl = createSequentialTemplateReaderPageUrlFactory(
      scraper,
      details,
      pagesConfig,
      chapter,
    );
    const detailsTotalPages = inferDetailsConfiguredPageCount(details, pagesConfig, chapter);
    const totalPages = detailsTotalPages
      ?? (knownTotalPages && knownTotalPages > 1 ? knownTotalPages : null)
      ?? await detectTemplateSelectorReaderPageCount(
        buildPageUrl,
        fetchDocument,
        scraper.baseUrl,
        pagesConfig.pageImageSelector,
        maxTemplatePages,
      );

    if (!totalPages) {
      const fallbackPageUrls = await resolveScraperPageUrls(scraper, details, pagesConfig, fetchDocument, {
        chapter,
        maxTemplatePages,
      });
      return buildReaderImageUrls(fallbackPageUrls, readerImageRefererUrl);
    }

    const pageUrls = buildLazyTemplateSelectorReaderPageUrls(
      buildPageUrl,
      scraper.baseUrl,
      pagesConfig.pageImageSelector,
      totalPages,
    );
    const initialPage = Math.max(
      1,
      Math.min(totalPages, normalizePositiveInteger(options?.initialPage) ?? 1),
    );
    const initialPageUrl = await resolveTemplateSelectorReaderPageImageUrl(
      fetchDocument,
      scraper.baseUrl,
      buildPageUrl(initialPage),
      pagesConfig.pageImageSelector,
    );

    if (!initialPageUrl) {
      throw new Error("La page demandee n'a pas pu etre resolue.");
    }

    pageUrls[initialPage - 1] = buildReaderImageUrl(initialPageUrl, buildPageUrl(initialPage));
    return pageUrls;
  }

  if (!canBuildSequentialTemplateReaderPages(pagesConfig)) {
    const pageUrls = await resolveScraperPageUrls(scraper, details, pagesConfig, fetchDocument, {
      chapter,
      maxTemplatePages,
    });
    return buildReaderImageUrls(pageUrls, readerImageRefererUrl);
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
    const fallbackPageUrls = await resolveScraperPageUrls(scraper, details, pagesConfig, fetchDocument, {
      chapter,
      maxTemplatePages,
    });
    return buildReaderImageUrls(fallbackPageUrls, readerImageRefererUrl);
  }

  return buildReaderImageUrls(buildSequentialTemplateReaderPageUrls(buildPageUrl, totalPages), readerImageRefererUrl);
}
