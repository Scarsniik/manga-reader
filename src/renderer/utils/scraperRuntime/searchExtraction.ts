import type {
  ScraperAuthorFeatureConfig,
  ScraperCardListConfig,
  ScraperFieldSelector,
  ScraperSearchResultItem,
  ScraperTagFeatureConfig,
} from "@/shared/scraper";
import type { ScraperDocumentFetcher, ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime/types";
import {
  extractFieldSelectorValuesFromRoot,
  extractLanguageCodesFromRoot,
  extractTextFieldSelectorValuesFromRoot,
  extractUrlFieldSelectorValuesFromRoot,
  getImageSelectorCandidateUrls,
  resolveImageSelectorValueFromRoot,
  toAbsoluteScraperUrl,
  uniqueValues,
} from "@/renderer/utils/scraperRuntime/selectorExtraction";

const getListingPageNameSelector = (config: ScraperCardListConfig): ScraperFieldSelector | undefined =>
  "authorNameSelector" in config
    ? (config as ScraperAuthorFeatureConfig).authorNameSelector
    : "tagNameSelector" in config
      ? (config as ScraperTagFeatureConfig).tagNameSelector
      : undefined;

const uniqueSearchResults = (results: ScraperSearchResultItem[]): ScraperSearchResultItem[] => {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = `${result.detailUrl ?? ""}::${result.title}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

type SearchPageExtractionContext = {
  documentUrl: string;
  listingNames: string[];
  authorNames: string[];
  resultItems: Element[];
};

const buildSearchPageExtractionContext = (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): SearchPageExtractionContext => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const listingNameSelector = getListingPageNameSelector(config);
  const listingNames = listingNameSelector
    ? uniqueValues(extractFieldSelectorValuesFromRoot(doc, listingNameSelector))
    : [];
  const searchRoots = config.resultListSelector ? Array.from(doc.querySelectorAll(config.resultListSelector)) : [doc];

  return {
    documentUrl,
    listingNames,
    authorNames: "authorNameSelector" in config ? listingNames : [],
    resultItems: Array.from(
      new Set(searchRoots.flatMap((root) => Array.from(root.querySelectorAll(config.resultItemSelector)))),
    ),
  };
};

const buildSearchResultItem = (
  item: Element,
  config: ScraperCardListConfig,
  documentUrl: string,
  thumbnailUrl: string | undefined,
): ScraperSearchResultItem | null => {
  const title = extractFieldSelectorValuesFromRoot(item, config.titleSelector)[0];
  if (!title) {
    return null;
  }

  const detailUrlValue = config.detailUrlSelector
    ? extractUrlFieldSelectorValuesFromRoot(item, config.detailUrlSelector)[0]
    : undefined;
  const authorUrlValues = config.authorUrlSelector
    ? uniqueValues(extractUrlFieldSelectorValuesFromRoot(item, config.authorUrlSelector))
    : [];
  const authorNameValues = config.authorUrlSelector
    ? uniqueValues(extractTextFieldSelectorValuesFromRoot(item, config.authorUrlSelector))
    : [];
  const summaryValue = config.summarySelector
    ? extractFieldSelectorValuesFromRoot(item, config.summarySelector)[0]
    : undefined;
  const pageCountValue = config.pageCountSelector
    ? extractFieldSelectorValuesFromRoot(item, config.pageCountSelector)[0]
    : undefined;

  return {
    title,
    detailUrl: detailUrlValue ? toAbsoluteScraperUrl(detailUrlValue, documentUrl) : undefined,
    authorUrl: authorUrlValues[0] ? toAbsoluteScraperUrl(authorUrlValues[0], documentUrl) : undefined,
    authorUrls: authorUrlValues.length
      ? authorUrlValues.map((value) => toAbsoluteScraperUrl(value, documentUrl))
      : undefined,
    authorNames: authorNameValues.length ? authorNameValues : undefined,
    thumbnailUrl,
    summary: summaryValue,
    pageCount: pageCountValue,
    languageCodes: extractLanguageCodesFromRoot(item, config.languageDetection, title),
  };
};

const buildSearchPageResult = (
  doc: Document,
  config: ScraperCardListConfig,
  context: SearchPageExtractionContext,
  results: ScraperSearchResultItem[],
): ScraperRuntimeSearchPageResult => {
  const nextPageValue = config.nextPageSelector
    ? extractUrlFieldSelectorValuesFromRoot(doc, config.nextPageSelector)[0]
    : undefined;

  return {
    currentPageUrl: context.documentUrl,
    nextPageUrl: nextPageValue ? toAbsoluteScraperUrl(nextPageValue, context.documentUrl) : undefined,
    authorNames: context.authorNames.length ? context.authorNames : undefined,
    listingNames: context.listingNames.length ? context.listingNames : undefined,
    items: uniqueSearchResults(results),
  };
};

export const extractScraperSearchPageFromDocument = (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperRuntimeSearchPageResult => {
  const context = buildSearchPageExtractionContext(doc, config, requestMeta);
  const results = context.resultItems
    .map((item) =>
      buildSearchResultItem(
        item,
        config,
        context.documentUrl,
        config.thumbnailSelector
          ? getImageSelectorCandidateUrls(item, config.thumbnailSelector, context.documentUrl)[0]
          : undefined,
      ),
    )
    .filter((result): result is ScraperSearchResultItem => Boolean(result));

  return buildSearchPageResult(doc, config, context, results);
};

export const extractScraperSearchResultsFromDocument = (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperSearchResultItem[] => extractScraperSearchPageFromDocument(doc, config, requestMeta).items;

export const extractScraperSearchPageFromDocumentWithImageFallbacks = async (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
  fetchDocument: ScraperDocumentFetcher | undefined,
): Promise<ScraperRuntimeSearchPageResult> => {
  const context = buildSearchPageExtractionContext(doc, config, requestMeta);
  const extractedResults = await Promise.all(
    context.resultItems.map(async (item) =>
      buildSearchResultItem(
        item,
        config,
        context.documentUrl,
        await resolveImageSelectorValueFromRoot(item, config.thumbnailSelector, context.documentUrl, fetchDocument),
      ),
    ),
  );

  return buildSearchPageResult(
    doc,
    config,
    context,
    extractedResults.filter((result): result is ScraperSearchResultItem => Boolean(result)),
  );
};

export const extractScraperSearchResultsFromDocumentWithImageFallbacks = async (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
  fetchDocument: ScraperDocumentFetcher | undefined,
): Promise<ScraperSearchResultItem[]> =>
  extractScraperSearchPageFromDocumentWithImageFallbacks(doc, config, requestMeta, fetchDocument).then(
    (page) => page.items,
  );
