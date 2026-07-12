import {
  normalizeScraperFieldSelector,
  type ScraperFieldSelector,
  type ScraperTagListFeatureConfig,
  type ScraperTagListItem,
} from "@/shared/scraper";
import type { ScraperRuntimeTagListPageResult } from "@/renderer/utils/scraperRuntime/types";
import {
  extractFieldSelectorValuesFromRoot,
  extractRegexValuesFromRoot,
  extractUrlFieldSelectorValuesFromRoot,
  parseSelectorExpression,
  toAbsoluteScraperUrl,
  uniqueValues,
} from "@/renderer/utils/scraperRuntime/selectorExtraction";
import { looksLikeScraperDirectUrlInput } from "@/renderer/utils/scraperRuntime/urlResolution";

type SelectorValueMode = "text" | "url";

const getSelfSelectorValue = (
  element: Element,
  selector: string,
  attribute: string | undefined,
  mode: SelectorValueMode,
): string => {
  if (!selector || !element.matches(selector)) {
    return "";
  }

  if (attribute) {
    return element.getAttribute(attribute)?.trim() || "";
  }

  if (mode === "url" && element.tagName === "A") {
    return element.getAttribute("href")?.trim() || "";
  }

  if (element.tagName === "IMG") {
    return element.getAttribute("src")?.trim() || "";
  }

  return element.textContent?.trim() || "";
};

const extractSelfValues = (
  root: ParentNode,
  input: ScraperFieldSelector | string,
  mode: SelectorValueMode,
): string[] => {
  if (!(root instanceof Element)) {
    return [];
  }

  const selector = normalizeScraperFieldSelector(input);
  if (!selector) {
    return [];
  }

  if (selector.kind === "regex") {
    return extractRegexValuesFromRoot(root, selector.value);
  }

  const parsedSelector = parseSelectorExpression(selector.value);
  const selfValue = getSelfSelectorValue(root, parsedSelector.selector, parsedSelector.attribute, mode);
  return selfValue ? [selfValue] : [];
};

const extractFieldValuesIncludingSelf = (
  root: ParentNode,
  input: ScraperFieldSelector | string,
  mode: SelectorValueMode,
): string[] => {
  const values = mode === "url"
    ? extractUrlFieldSelectorValuesFromRoot(root, input)
    : extractFieldSelectorValuesFromRoot(root, input);

  return uniqueValues([
    ...values,
    ...extractSelfValues(root, input, mode),
  ]);
};

const shouldResolveTagTargetAsUrl = (
  element: Element | undefined,
  attribute: string | undefined,
  value: string,
): boolean => {
  const normalizedAttribute = String(attribute ?? "")
    .trim()
    .toLowerCase();

  return (
    normalizedAttribute === "href"
    || normalizedAttribute === "src"
    || normalizedAttribute === "action"
    || (!attribute && (element?.tagName === "A" || element?.tagName === "IMG"))
    || looksLikeScraperDirectUrlInput(value)
  );
};

const normalizeTagTargetValue = (
  value: string,
  documentUrl: string,
  element?: Element,
  attribute?: string,
): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  return shouldResolveTagTargetAsUrl(element, attribute, trimmedValue)
    ? toAbsoluteScraperUrl(trimmedValue, documentUrl)
    : trimmedValue;
};

const extractTagTargetValuesIncludingSelf = (
  root: ParentNode,
  input: ScraperFieldSelector | string,
  documentUrl: string,
): string[] => {
  const selector = normalizeScraperFieldSelector(input);
  if (!selector) {
    return [];
  }

  if (selector.kind === "regex") {
    return uniqueValues(
      extractRegexValuesFromRoot(root, selector.value)
        .map((value) => normalizeTagTargetValue(value, documentUrl))
        .filter(Boolean),
    );
  }

  if (!(root instanceof Element)) {
    return [];
  }

  const parsedSelector = parseSelectorExpression(selector.value);
  if (!parsedSelector.selector) {
    return [];
  }

  const matchedElements = [
    ...Array.from(root.querySelectorAll(parsedSelector.selector)),
    ...(root.matches(parsedSelector.selector) ? [root] : []),
  ];

  return uniqueValues(
    matchedElements
      .map((element) => (
        normalizeTagTargetValue(
          getSelfSelectorValue(element, parsedSelector.selector, parsedSelector.attribute, "url"),
          documentUrl,
          element,
          parsedSelector.attribute,
        )
      ))
      .filter(Boolean),
  );
};

const uniqueTagListItems = (items: ScraperTagListItem[]): ScraperTagListItem[] => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = (item.url || item.name).trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getTagListItems = (
  doc: Document,
  config: ScraperTagListFeatureConfig,
): Element[] => {
  const roots = config.tagListSelector
    ? Array.from(doc.querySelectorAll(config.tagListSelector))
    : [doc];

  return Array.from(
    new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(config.tagItemSelector)))),
  );
};

const buildTagListItem = (
  item: Element,
  config: ScraperTagListFeatureConfig,
  documentUrl: string,
): ScraperTagListItem | null => {
  const name = extractFieldValuesIncludingSelf(item, config.tagNameSelector, "text")[0];
  if (!name) {
    return null;
  }

  const rawUrl = config.tagUrlSelector
    ? extractTagTargetValuesIncludingSelf(item, config.tagUrlSelector, documentUrl)[0]
    : "";
  const count = config.tagCountSelector
    ? extractFieldValuesIncludingSelf(item, config.tagCountSelector, "text")[0]
    : "";

  return {
    name,
    url: rawUrl ? toAbsoluteScraperUrl(rawUrl, documentUrl) : undefined,
    count: count || undefined,
  };
};

export const extractScraperTagListPageFromDocument = (
  doc: Document,
  config: ScraperTagListFeatureConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperRuntimeTagListPageResult => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const nextPageValue = config.nextPageSelector
    ? extractUrlFieldSelectorValuesFromRoot(doc, config.nextPageSelector)[0]
    : undefined;
  const paginationValues = config.paginationLinkSelector
    ? extractUrlFieldSelectorValuesFromRoot(doc, config.paginationLinkSelector)
    : [];
  const items = getTagListItems(doc, config)
    .map((item) => buildTagListItem(item, config, documentUrl))
    .filter((item): item is ScraperTagListItem => Boolean(item));

  return {
    currentPageUrl: documentUrl,
    nextPageUrl: nextPageValue ? toAbsoluteScraperUrl(nextPageValue, documentUrl) : undefined,
    paginationUrls: uniqueValues(paginationValues.map((value) => toAbsoluteScraperUrl(value, documentUrl))),
    items: uniqueTagListItems(items),
  };
};
