import {
  normalizeScraperFieldSelector,
  type ScraperEntityListFeatureConfig,
  type ScraperEntityListItem,
  type ScraperFieldSelector,
} from "@/shared/scraper";
import type { ScraperRuntimeEntityListPageResult } from "@/renderer/utils/scraperRuntime/types";
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
    normalizedAttribute === "src"
    || normalizedAttribute === "action"
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

const uniqueEntityListItems = (items: ScraperEntityListItem[]): ScraperEntityListItem[] => {
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

const getEntityListItems = (
  doc: Document,
  config: ScraperEntityListFeatureConfig,
): Element[] => {
  const roots = config.listSelector
    ? Array.from(doc.querySelectorAll(config.listSelector))
    : [doc];

  return Array.from(
    new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(config.itemSelector)))),
  );
};

const buildEntityListItem = (
  item: Element,
  config: ScraperEntityListFeatureConfig,
  documentUrl: string,
): ScraperEntityListItem | null => {
  const name = extractFieldValuesIncludingSelf(item, config.nameSelector, "text")[0];
  if (!name) {
    return null;
  }

  const rawUrl = config.urlSelector
    ? extractTagTargetValuesIncludingSelf(item, config.urlSelector, documentUrl)[0]
    : "";
  const count = config.countSelector
    ? extractFieldValuesIncludingSelf(item, config.countSelector, "text")[0]
    : "";

  return {
    name,
    url: rawUrl || undefined,
    count: count || undefined,
  };
};

export const extractScraperEntityListPageFromDocument = (
  doc: Document,
  config: ScraperEntityListFeatureConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperRuntimeEntityListPageResult => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const nextPageValue = config.nextPageSelector
    ? extractUrlFieldSelectorValuesFromRoot(doc, config.nextPageSelector)[0]
    : undefined;
  const paginationValues = config.paginationLinkSelector
    ? extractUrlFieldSelectorValuesFromRoot(doc, config.paginationLinkSelector)
    : [];
  const items = getEntityListItems(doc, config)
    .map((item) => buildEntityListItem(item, config, documentUrl))
    .filter((item): item is ScraperEntityListItem => Boolean(item));

  return {
    currentPageUrl: documentUrl,
    nextPageUrl: nextPageValue ? toAbsoluteScraperUrl(nextPageValue, documentUrl) : undefined,
    paginationUrls: uniqueValues(paginationValues.map((value) => toAbsoluteScraperUrl(value, documentUrl))),
    items: uniqueEntityListItems(items),
  };
};

export const extractScraperTagListPageFromDocument = extractScraperEntityListPageFromDocument;
