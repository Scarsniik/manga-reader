import {
  buildScraperRegexFromInput,
  hasScraperFieldSelectorValue,
  normalizeScraperFieldSelector,
  type ScraperDetailsDerivedValueResult,
  type ScraperDetailsFeatureConfig,
  type ScraperFieldSelector,
} from "@/shared/scraper";
import { isDetailsFieldKey } from "@/renderer/utils/scraperRuntime/featureConfig";
import { DETAILS_FIELD_KEYS } from "@/renderer/utils/scraperRuntime/types";
import type {
  DetailsFieldKey,
  ScraperDocumentFetcher,
  ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime/types";
import { looksLikeScraperDirectUrlInput } from "@/renderer/utils/scraperRuntime/urlResolution";
import {
  extractFieldSelectorValuesFromRoot,
  extractLanguageCodesFromRoot,
  extractRegexValuesFromRoot,
  extractSelectorValues,
  extractUrlFieldSelectorValuesFromRoot,
  getImageSelectorCandidateUrls,
  parseSelectorExpression,
  resolveFirstAvailableImageUrl,
  toAbsoluteScraperUrl,
  uniqueValues,
} from "@/renderer/utils/scraperRuntime/selectorExtraction";

export type ScraperRuntimeDetailsRequestMeta = {
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  html?: string;
};

export type ScraperRuntimeDetailsFieldValues = Partial<Record<DetailsFieldKey, string[]>>;

export type ScraperRuntimeDetailsThumbnailsPageResult = {
  thumbnails: string[];
  nextPageUrl?: string;
};

export const extractScraperAuthorUrlsFromDocument = (
  doc: Document,
  selector: ScraperFieldSelector | undefined,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, "requestedUrl" | "finalUrl">,
): string[] => {
  if (!selector || !hasScraperFieldSelectorValue(selector)) {
    return [];
  }

  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  return uniqueValues(
    extractUrlFieldSelectorValuesFromRoot(doc, selector).map((value) => toAbsoluteScraperUrl(value, documentUrl)),
  );
};

const shouldResolveTagTargetAsUrl = (attribute: string | undefined, value: string): boolean => {
  const normalizedAttribute = String(attribute ?? "")
    .trim()
    .toLowerCase();

  return (
    normalizedAttribute === "href" ||
    normalizedAttribute === "src" ||
    normalizedAttribute === "action" ||
    looksLikeScraperDirectUrlInput(value)
  );
};

export const extractScraperTagUrlsFromDocument = (
  doc: Document,
  selector: ScraperFieldSelector | undefined,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, "requestedUrl" | "finalUrl">,
): string[] => {
  const normalizedSelector = normalizeScraperFieldSelector(selector);
  if (!normalizedSelector || !hasScraperFieldSelectorValue(normalizedSelector)) {
    return [];
  }

  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;

  if (normalizedSelector.kind === "regex") {
    return uniqueValues(
      extractRegexValuesFromRoot(doc, normalizedSelector.value).map((value) =>
        shouldResolveTagTargetAsUrl(undefined, value) ? toAbsoluteScraperUrl(value, documentUrl) : value,
      ),
    );
  }

  const { selector: cssSelector, attribute } = parseSelectorExpression(normalizedSelector.value);
  if (!cssSelector) {
    return [];
  }

  return uniqueValues(
    Array.from(doc.querySelectorAll(cssSelector))
      .map((element) => {
        const value = attribute
          ? element.getAttribute(attribute)?.trim() || ""
          : element.tagName === "A"
            ? element.getAttribute("href")?.trim() || ""
            : element.tagName === "IMG"
              ? element.getAttribute("src")?.trim() || ""
              : element.textContent?.trim() || "";

        if (!value) {
          return "";
        }

        const shouldResolveAsUrl = attribute
          ? shouldResolveTagTargetAsUrl(attribute, value)
          : element.tagName === "A" || element.tagName === "IMG" || shouldResolveTagTargetAsUrl(undefined, value);

        return shouldResolveAsUrl ? toAbsoluteScraperUrl(value, documentUrl) : value;
      })
      .filter(Boolean),
  );
};

export const extractScraperDetailsThumbnailsFromDocument = (
  doc: Document,
  config: Pick<
    ScraperDetailsFeatureConfig,
    "thumbnailsListSelector" | "thumbnailsSelector" | "thumbnailsNextPageSelector"
  >,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, "requestedUrl" | "finalUrl">,
): string[] => extractScraperDetailsThumbnailsPageFromDocument(doc, config, requestMeta).thumbnails;

export const extractScraperDetailsThumbnailsPageFromDocument = (
  doc: Document,
  config: Pick<
    ScraperDetailsFeatureConfig,
    "thumbnailsListSelector" | "thumbnailsSelector" | "thumbnailsNextPageSelector"
  >,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, "requestedUrl" | "finalUrl">,
): ScraperRuntimeDetailsThumbnailsPageResult => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const nextPageValue = config.thumbnailsNextPageSelector
    ? extractUrlFieldSelectorValuesFromRoot(doc, config.thumbnailsNextPageSelector)[0]
    : undefined;
  const nextPageUrl = nextPageValue ? toAbsoluteScraperUrl(nextPageValue, documentUrl) : undefined;

  if (!config.thumbnailsSelector || !hasScraperFieldSelectorValue(config.thumbnailsSelector)) {
    return {
      thumbnails: [],
      nextPageUrl,
    };
  }

  const thumbnailsSelector = config.thumbnailsSelector;
  const thumbnailRoots = config.thumbnailsListSelector
    ? Array.from(doc.querySelectorAll(config.thumbnailsListSelector))
    : [doc];

  return {
    thumbnails: thumbnailRoots.flatMap((root) =>
      extractFieldSelectorValuesFromRoot(root, thumbnailsSelector).map((value) =>
        toAbsoluteScraperUrl(value, documentUrl),
      ),
    ),
    nextPageUrl,
  };
};

export const extractScraperDetailsFieldValues = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, "requestedUrl" | "finalUrl">,
): ScraperRuntimeDetailsFieldValues => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const fieldValuesByKey: ScraperRuntimeDetailsFieldValues = {};

  const selectorMap: Partial<Record<DetailsFieldKey, ScraperFieldSelector | undefined>> = {
    title: config.titleSelector,
    cover: config.coverSelector,
    description: config.descriptionSelector,
    authors: config.authorsSelector,
    tags: config.tagsSelector,
    status: config.statusSelector,
    pageCount: config.pageCountSelector,
  };

  DETAILS_FIELD_KEYS.forEach((fieldKey) => {
    const selector = selectorMap[fieldKey];
    if (!selector || !hasScraperFieldSelectorValue(selector)) {
      fieldValuesByKey[fieldKey] = [];
      return;
    }

    const values = extractSelectorValues(doc, selector);
    fieldValuesByKey[fieldKey] =
      fieldKey === "cover" ? getImageSelectorCandidateUrls(doc, selector, documentUrl) : values;
  });

  return fieldValuesByKey;
};

export const extractScraperDetailsDerivedValueResults = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: ScraperRuntimeDetailsRequestMeta,
  fieldValuesByKey: ScraperRuntimeDetailsFieldValues,
): ScraperDetailsDerivedValueResult[] =>
  config.derivedValues.map((derivedValue) => {
    const baseResult: ScraperDetailsDerivedValueResult = {
      key: derivedValue.key,
      sourceType: derivedValue.sourceType,
      sourceField: derivedValue.sourceField,
      selector: derivedValue.selector,
      pattern: derivedValue.pattern,
    };

    let sourceValues: string[] = [];

    if (derivedValue.sourceType === "requested_url") {
      sourceValues = requestMeta.requestedUrl ? [requestMeta.requestedUrl] : [];
    } else if (derivedValue.sourceType === "final_url") {
      sourceValues = requestMeta.finalUrl
        ? [requestMeta.finalUrl]
        : requestMeta.requestedUrl
          ? [requestMeta.requestedUrl]
          : [];
    } else if (derivedValue.sourceType === "field") {
      sourceValues = isDetailsFieldKey(derivedValue.sourceField)
        ? (fieldValuesByKey[derivedValue.sourceField] ?? [])
        : [];
    } else if (derivedValue.sourceType === "selector") {
      try {
        sourceValues = derivedValue.selector ? extractSelectorValues(doc, derivedValue.selector) : [];
      } catch {
        return {
          ...baseResult,
          issueCode: "invalid_selector",
        };
      }
    } else {
      sourceValues = requestMeta.html
        ? [requestMeta.html]
        : doc.documentElement?.outerHTML
          ? [doc.documentElement.outerHTML]
          : [];
    }

    if (sourceValues.length === 0) {
      return {
        ...baseResult,
        issueCode:
          derivedValue.sourceType === "requested_url" ||
          derivedValue.sourceType === "final_url" ||
          derivedValue.sourceType === "html"
            ? "missing_source"
            : "no_match",
      };
    }

    const sourceSample = derivedValue.sourceType === "html" ? "HTML brut de la page" : sourceValues[0];

    if (derivedValue.sourceType === "html" && !derivedValue.pattern) {
      return {
        ...baseResult,
        sourceSample,
        issueCode: "invalid_pattern",
      };
    }

    if (!derivedValue.pattern) {
      return {
        ...baseResult,
        sourceSample,
        value: sourceValues[0],
      };
    }

    try {
      const regex = buildScraperRegexFromInput(derivedValue.pattern);
      const match = regex.exec(sourceValues[0]);
      if (!match) {
        return {
          ...baseResult,
          sourceSample,
          issueCode: "no_match",
        };
      }

      return {
        ...baseResult,
        sourceSample,
        value: match[1] ?? match[0],
      };
    } catch {
      return {
        ...baseResult,
        sourceSample,
        issueCode: "invalid_pattern",
      };
    }
  });

const collectScraperDerivedValues = (derivedValueResults: ScraperDetailsDerivedValueResult[]): Record<string, string> =>
  derivedValueResults.reduce<Record<string, string>>((accumulator, derivedValue) => {
    if (derivedValue.value) {
      accumulator[derivedValue.key] = derivedValue.value;
    }

    return accumulator;
  }, {});

const buildScraperDetailsResult = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: ScraperRuntimeDetailsRequestMeta,
  fieldValuesByKey: ScraperRuntimeDetailsFieldValues,
): ScraperRuntimeDetailsResult => {
  const derivedValueResults = extractScraperDetailsDerivedValueResults(doc, config, requestMeta, fieldValuesByKey);
  const title = fieldValuesByKey.title?.[0];
  const thumbnailsPage = extractScraperDetailsThumbnailsPageFromDocument(doc, config, requestMeta);

  return {
    requestedUrl: requestMeta.requestedUrl,
    finalUrl: requestMeta.finalUrl,
    status: requestMeta.status,
    contentType: requestMeta.contentType,
    title,
    cover: fieldValuesByKey.cover?.[0],
    description: fieldValuesByKey.description?.[0],
    authors: uniqueValues(fieldValuesByKey.authors ?? []),
    authorUrls: extractScraperAuthorUrlsFromDocument(doc, config.authorUrlSelector, requestMeta),
    tags: uniqueValues(fieldValuesByKey.tags ?? []),
    tagUrls: extractScraperTagUrlsFromDocument(doc, config.tagUrlSelector, requestMeta),
    thumbnails:
      config.thumbnailsSelector && hasScraperFieldSelectorValue(config.thumbnailsSelector)
        ? thumbnailsPage.thumbnails
        : undefined,
    thumbnailsNextPageUrl: thumbnailsPage.nextPageUrl,
    mangaStatus: fieldValuesByKey.status?.[0],
    pageCount: fieldValuesByKey.pageCount?.[0],
    languageCodes: extractLanguageCodesFromRoot(doc, config.languageDetection, title),
    derivedValues: collectScraperDerivedValues(derivedValueResults),
  };
};

export const extractScraperDetailsFromDocument = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: ScraperRuntimeDetailsRequestMeta,
): ScraperRuntimeDetailsResult => {
  const fieldValuesByKey = extractScraperDetailsFieldValues(doc, config, requestMeta);
  return buildScraperDetailsResult(doc, config, requestMeta, fieldValuesByKey);
};

export const extractScraperDetailsFromDocumentWithImageFallbacks = async (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: ScraperRuntimeDetailsRequestMeta,
  fetchDocument: ScraperDocumentFetcher | undefined,
): Promise<ScraperRuntimeDetailsResult> => {
  const fieldValuesByKey = extractScraperDetailsFieldValues(doc, config, requestMeta);
  const resolvedCover = await resolveFirstAvailableImageUrl(uniqueValues(fieldValuesByKey.cover ?? []), fetchDocument);
  fieldValuesByKey.cover = resolvedCover ? [resolvedCover] : [];

  return buildScraperDetailsResult(doc, config, requestMeta, fieldValuesByKey);
};
