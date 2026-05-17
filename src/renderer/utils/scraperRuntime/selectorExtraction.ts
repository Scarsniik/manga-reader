import {
  buildScraperRegexFromInput,
  hasScraperFieldSelectorValue,
  normalizeScraperFieldSelector,
  type ScraperAuthorFeatureConfig,
  type ScraperCardListConfig,
  type ScraperFieldSelector,
  type ScraperLanguageDetectionConfig,
  type ScraperTagFeatureConfig,
} from "@/shared/scraper";
import { normalizeSelectorInput } from "@/renderer/utils/scraperRuntime/display";
import type { ScraperDocumentFetcher } from "@/renderer/utils/scraperRuntime/types";
import {
  detectLanguageCodesFromMappedValues,
  detectLanguageCodesFromProcessedValues,
  detectLanguageCodesFromTextValues,
  detectLanguageCodesFromTitle,
  uniqueLanguageCodes,
} from "@/renderer/utils/languageDetection";

export const isImageLikeContentType = (contentType: string | undefined): boolean =>
  typeof contentType === "string" && contentType.toLowerCase().startsWith("image/");

export const parseSelectorExpression = (input: string): { selector: string; attribute?: string } => {
  const trimmed = normalizeSelectorInput(input);
  const atIndex = trimmed.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { selector: trimmed };
  }

  return {
    selector: trimmed.slice(0, atIndex).trim(),
    attribute: trimmed.slice(atIndex + 1).trim(),
  };
};

type SelectorValueMode = "text" | "url";

const getElementSelectorValue = (element: Element, attribute: string | undefined, mode: SelectorValueMode): string => {
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

const extractSelectorValuesByModeFromRoot = (root: ParentNode, input: string, mode: SelectorValueMode): string[] => {
  const { selector, attribute } = parseSelectorExpression(input);
  if (!selector) {
    return [];
  }

  return Array.from(root.querySelectorAll(selector))
    .map((element) => getElementSelectorValue(element, attribute, mode))
    .filter(Boolean);
};

export const extractSelectorValuesFromRoot = (root: ParentNode, input: string): string[] =>
  extractSelectorValuesByModeFromRoot(root, input, "text");

export const extractUrlSelectorValuesFromRoot = (root: ParentNode, input: string): string[] =>
  extractSelectorValuesByModeFromRoot(root, input, "url");

const getRootHtml = (root: ParentNode): string => {
  if (root instanceof Document) {
    return root.documentElement?.outerHTML ?? "";
  }

  if (root instanceof Element) {
    return root.outerHTML;
  }

  return root.textContent ?? "";
};

export const extractRegexValuesFromRoot = (root: ParentNode, pattern: string): string[] => {
  if (!pattern.trim()) {
    return [];
  }

  const regex = buildScraperRegexFromInput(pattern, "g");
  const html = getRootHtml(root);
  const values: string[] = [];
  let match: RegExpExecArray | null;

  do {
    match = regex.exec(html);
    if (!match) {
      break;
    }

    const value = String(match[1] ?? match[0] ?? "").trim();
    if (value) {
      values.push(value);
    }

    if (match[0] === "") {
      regex.lastIndex += 1;
    }
  } while (regex.lastIndex <= html.length);

  return values;
};

const extractFieldSelectorValuesByModeFromRoot = (
  root: ParentNode,
  input: ScraperFieldSelector | string,
  mode: SelectorValueMode,
): string[] => {
  const selector = normalizeScraperFieldSelector(input);
  if (!selector) {
    return [];
  }

  return selector.kind === "regex"
    ? extractRegexValuesFromRoot(root, selector.value)
    : extractSelectorValuesByModeFromRoot(root, selector.value, mode);
};

export const extractFieldSelectorValuesFromRoot = (root: ParentNode, input: ScraperFieldSelector | string): string[] =>
  extractFieldSelectorValuesByModeFromRoot(root, input, "text");

export const extractUrlFieldSelectorValuesFromRoot = (
  root: ParentNode,
  input: ScraperFieldSelector | string,
): string[] => extractFieldSelectorValuesByModeFromRoot(root, input, "url");

export const extractTextFieldSelectorValuesFromRoot = (
  root: ParentNode,
  input: ScraperFieldSelector | string,
): string[] => {
  const selector = normalizeScraperFieldSelector(input);
  if (!selector || selector.kind === "regex") {
    return [];
  }

  const { selector: cssSelector } = parseSelectorExpression(selector.value);
  if (!cssSelector) {
    return [];
  }

  return Array.from(root.querySelectorAll(cssSelector))
    .map((element) => element.textContent?.trim() || "")
    .filter(Boolean);
};

const hasLanguageDetectionConfig = (
  config: ScraperLanguageDetectionConfig | undefined,
): config is ScraperLanguageDetectionConfig =>
  Boolean(
    config?.detectFromTitle ||
    hasScraperFieldSelectorValue(config?.languageSelector) ||
    hasScraperFieldSelectorValue(config?.processedLanguageSelector),
  );

export const extractLanguageCodesFromRoot = (
  root: ParentNode,
  config: ScraperLanguageDetectionConfig | undefined,
  title: string | undefined,
): string[] => {
  if (!hasLanguageDetectionConfig(config)) {
    return [];
  }

  const titleLanguageCodes = config.detectFromTitle && title ? detectLanguageCodesFromTitle(title) : [];
  const selectorLanguageCodes = config.languageSelector
    ? detectLanguageCodesFromTextValues(extractFieldSelectorValuesFromRoot(root, config.languageSelector))
    : [];
  const processedSelectorValues = config.processedLanguageSelector
    ? extractFieldSelectorValuesFromRoot(root, config.processedLanguageSelector)
    : [];
  const processedSelectorLanguageCodes = config.valueMappings?.length
    ? detectLanguageCodesFromMappedValues(processedSelectorValues, config.valueMappings)
    : detectLanguageCodesFromProcessedValues(processedSelectorValues);

  return uniqueLanguageCodes([...titleLanguageCodes, ...selectorLanguageCodes, ...processedSelectorLanguageCodes]);
};

export const extractScraperLanguageCodesFromRoot = (
  root: ParentNode,
  config: ScraperLanguageDetectionConfig | undefined,
  title: string | undefined,
): string[] => extractLanguageCodesFromRoot(root, config, title);

export const extractSelectorValues = (doc: Document, input: ScraperFieldSelector | string): string[] =>
  extractFieldSelectorValuesFromRoot(doc, input);

export const toAbsoluteScraperUrl = (value: string, baseUrl: string): string => {
  const normalizedValue = value.trim().replace(/\\\//g, "/").replace(/&amp;/g, "&");

  try {
    return new URL(normalizedValue, baseUrl).toString();
  } catch {
    return normalizedValue;
  }
};

export const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
};

const normalizeExtractedScraperUrlValue = (value: string): string =>
  value
    .trim()
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

const extractImageCandidateValues = (value: string): string[] => {
  const normalizedValue = normalizeExtractedScraperUrlValue(value);
  if (!normalizedValue) {
    return [];
  }

  if (normalizedValue.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalizedValue) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((candidate) => String(candidate ?? "").trim()).filter(Boolean);
      }
    } catch {
      // Fall through to URL extraction.
    }
  }

  const absoluteUrls = normalizedValue.match(/https?:\/\/[^\s"'<>]+/g);
  if (absoluteUrls?.length) {
    return absoluteUrls;
  }

  return [normalizedValue];
};

export const getImageSelectorCandidateUrls = (
  root: ParentNode,
  selector: ScraperFieldSelector | undefined,
  documentUrl: string,
): string[] => {
  if (!selector || !hasScraperFieldSelectorValue(selector)) {
    return [];
  }

  return uniqueValues(
    extractFieldSelectorValuesFromRoot(root, selector)
      .flatMap((value) => extractImageCandidateValues(value))
      .map((value) => toAbsoluteScraperUrl(value, documentUrl))
      .filter(Boolean),
  );
};

export const resolveFirstAvailableImageUrl = async (
  candidates: string[],
  fetchDocument: ScraperDocumentFetcher | undefined,
): Promise<string | undefined> => {
  if (candidates.length <= 1 || !fetchDocument) {
    return candidates[0];
  }

  for (const candidate of candidates) {
    const result = await fetchDocument({
      baseUrl: candidate,
      targetUrl: candidate,
      validateImage: true,
    });

    if (result.ok && isImageLikeContentType(result.contentType)) {
      return result.finalUrl || result.requestedUrl || candidate;
    }
  }

  return undefined;
};

export const resolveImageSelectorValueFromRoot = async (
  root: ParentNode,
  selector: ScraperFieldSelector | undefined,
  documentUrl: string,
  fetchDocument: ScraperDocumentFetcher | undefined,
): Promise<string | undefined> =>
  resolveFirstAvailableImageUrl(getImageSelectorCandidateUrls(root, selector, documentUrl), fetchDocument);
