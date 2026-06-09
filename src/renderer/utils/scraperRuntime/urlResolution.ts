import {
  applyScraperSearchTemplate,
  buildScraperContextTemplateUrl,
  buildScraperSearchUrl,
  buildScraperTemplateUrl,
  resolveScraperUrl,
  type ScraperAuthorFeatureConfig,
  type ScraperDetailsFeatureConfig,
  type ScraperHomepageFeatureConfig,
  type ScraperRequestConfig,
  type ScraperSearchFeatureConfig,
  type ScraperTagFeatureConfig,
  type ScraperTagListFeatureConfig,
} from "@/shared/scraper";
import { normalizeRequestConfig } from "@/renderer/utils/scraperRuntime/featureConfig";
import type { ScraperTemplateContext } from "@/renderer/utils/scraperTemplateContext";

export const looksLikeScraperDirectUrlInput = (value: string): boolean =>
  /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ||
  value.startsWith("//") ||
  value.startsWith("/") ||
  value.startsWith("./") ||
  value.startsWith("../") ||
  value.startsWith("?") ||
  value.startsWith("#");

const SCRAPER_TEMPLATE_VALUE_SENTINEL = "__SCRAPER_TEMPLATE_VALUE__";
const SCRAPER_TEMPLATE_PAGE_SENTINEL = "__SCRAPER_TEMPLATE_PAGE__";
const SCRAPER_TEMPLATE_VALUE_TOKEN_PATTERN =
  /{{\s*(?:query|search|value|id|slug|plusQuery|rawQuery|rawSearch|rawValue|rawId|rawSlug)\s*}}/g;
const SCRAPER_TEMPLATE_PAGE_TOKEN_PATTERN = /{{\s*page(?:Index)?\d*\s*}}/g;
const SCRAPER_TEMPLATE_PAGE_TOKEN_DETECT_PATTERN = /{{\s*page(?:Index)?\d*\s*}}/;

const escapeScraperRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueScraperValues = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const removeScraperTemplatePageQueryParameters = (template: string): string => {
  const hashIndex = template.indexOf("#");
  const templateWithoutHash = hashIndex >= 0 ? template.slice(0, hashIndex) : template;
  const hash = hashIndex >= 0 ? template.slice(hashIndex) : "";
  const queryIndex = templateWithoutHash.indexOf("?");

  if (queryIndex < 0) {
    return template;
  }

  const prefix = templateWithoutHash.slice(0, queryIndex);
  const query = templateWithoutHash.slice(queryIndex + 1);
  const keptParameters = query
    .split("&")
    .filter((parameter) => !SCRAPER_TEMPLATE_PAGE_TOKEN_DETECT_PATTERN.test(parameter));

  return `${prefix}${keptParameters.length ? `?${keptParameters.join("&")}` : ""}${hash}`;
};

const removeScraperTemplatePagePathSegments = (template: string): string => (
  template
    .replace(/\/(?:page|p)\/{{\s*page(?:Index)?\d*\s*}}(?=\/|[?#]|$)/g, "")
    .replace(/\/{{\s*page(?:Index)?\d*\s*}}(?=\/|[?#]|$)/g, "")
    .replace(/([^:])\/{2,}/g, "$1/")
);

const buildScraperTemplateExtractionVariants = (template: string): string[] => {
  const trimmedTemplate = template.trim();

  if (!trimmedTemplate) {
    return [];
  }

  const withoutPageQueryParameters = removeScraperTemplatePageQueryParameters(trimmedTemplate);
  const withoutPagePathSegments = removeScraperTemplatePagePathSegments(trimmedTemplate);
  const withoutPagePathSegmentsAndQueryParameters = removeScraperTemplatePageQueryParameters(
    withoutPagePathSegments,
  );

  return uniqueScraperValues([
    trimmedTemplate,
    withoutPageQueryParameters,
    withoutPagePathSegments,
    withoutPagePathSegmentsAndQueryParameters,
  ]);
};

const buildScraperDirectUrlExtractionVariants = (baseUrl: string, input: string): string[] => {
  const resolvedUrl = resolveScraperUrl(baseUrl, input);
  const variants = new Set([resolvedUrl]);

  try {
    const parsedUrl = new URL(resolvedUrl);

    if (parsedUrl.pathname !== "/") {
      parsedUrl.pathname = parsedUrl.pathname.endsWith("/")
        ? parsedUrl.pathname.replace(/\/+$/, "")
        : `${parsedUrl.pathname}/`;
      variants.add(parsedUrl.toString());
    }
  } catch {
    // The resolved URL is already usable; trailing slash variants are only a convenience.
  }

  return Array.from(variants);
};

const buildScraperTemplateExtractionRegex = (baseUrl: string, template: string): RegExp | null => {
  const templateWithSentinels = template
    .replace(SCRAPER_TEMPLATE_VALUE_TOKEN_PATTERN, SCRAPER_TEMPLATE_VALUE_SENTINEL)
    .replace(SCRAPER_TEMPLATE_PAGE_TOKEN_PATTERN, SCRAPER_TEMPLATE_PAGE_SENTINEL);

  if (!templateWithSentinels.includes(SCRAPER_TEMPLATE_VALUE_SENTINEL)) {
    return null;
  }

  const resolvedTemplate = resolveScraperUrl(baseUrl, templateWithSentinels);
  const valueSentinelPattern = escapeScraperRegex(SCRAPER_TEMPLATE_VALUE_SENTINEL);
  const pageSentinelPattern = escapeScraperRegex(SCRAPER_TEMPLATE_PAGE_SENTINEL);
  const regexSource = escapeScraperRegex(resolvedTemplate)
    .split(valueSentinelPattern).join("([^/?#&]+)")
    .split(pageSentinelPattern).join("\\d+");

  return new RegExp(`^${regexSource}$`);
};

const decodeScraperTemplateExtractedValue = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractScraperTemplateValueFromUrl = (
  baseUrl: string,
  template: string | undefined,
  input: string,
): string | null => {
  const templateVariants = buildScraperTemplateExtractionVariants(template || "");

  if (!templateVariants.length) {
    return null;
  }

  let directUrlVariants: string[];

  try {
    directUrlVariants = buildScraperDirectUrlExtractionVariants(baseUrl, input);
  } catch {
    return null;
  }

  const extractionRegexes = templateVariants
    .map((templateVariant) => {
      try {
        return buildScraperTemplateExtractionRegex(baseUrl, templateVariant);
      } catch {
        return null;
      }
    })
    .filter((regex): regex is RegExp => Boolean(regex));

  for (const directUrlVariant of directUrlVariants) {
    for (const extractionRegex of extractionRegexes) {
      const match = directUrlVariant.match(extractionRegex);
      const extractedValue = match?.slice(1).find((value) => value.length > 0);

      if (extractedValue) {
        return decodeScraperTemplateExtractedValue(extractedValue);
      }
    }
  }

  return null;
};

const buildScraperListingTemplateResolution = (
  config: { urlTemplate?: string },
  query: string,
  options?: {
    pageIndex?: number;
  },
): {
  looksLikeDirectUrlInput: boolean;
  pageIndex: number;
  searchResolvedTemplate: string;
  trimmedQuery: string;
} => {
  const trimmedQuery = query.trim();

  return {
    looksLikeDirectUrlInput: looksLikeScraperDirectUrlInput(trimmedQuery),
    pageIndex: Math.max(0, options?.pageIndex ?? 0),
    searchResolvedTemplate: applyScraperSearchTemplate(config.urlTemplate || "", trimmedQuery, options),
    trimmedQuery,
  };
};

export const resolveScraperDetailsTargetUrl = (
  baseUrl: string,
  config: ScraperDetailsFeatureConfig,
  query: string,
): string => {
  const trimmedQuery = query.trim();
  const looksLikeDirectUrlInput = looksLikeScraperDirectUrlInput(trimmedQuery);

  if (config.urlStrategy === "template" && !looksLikeDirectUrlInput) {
    return buildScraperTemplateUrl(baseUrl, config.urlTemplate || "", trimmedQuery);
  }

  return resolveScraperUrl(baseUrl, trimmedQuery);
};

export const resolveScraperSearchTargetUrl = (
  baseUrl: string,
  config: ScraperSearchFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string => buildScraperSearchUrl(baseUrl, config.urlTemplate || "", query, options);

export const resolveScraperHomepageTargetUrl = (
  baseUrl: string,
  config: ScraperHomepageFeatureConfig,
  options?: {
    pageIndex?: number;
  },
): string => buildScraperSearchUrl(baseUrl, config.urlTemplate || "", "", options);

export const resolveScraperAuthorTargetUrl = (
  baseUrl: string,
  config: ScraperAuthorFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
    templateContext?: ScraperTemplateContext;
  },
): string => {
  const { looksLikeDirectUrlInput, pageIndex, searchResolvedTemplate, trimmedQuery } =
    buildScraperListingTemplateResolution(config, query, options);

  if (config.urlStrategy === "template") {
    const hasContextPlaceholders = /{{\s*(?:raw:)?[^}]+\s*}}/.test(searchResolvedTemplate);
    const hasTemplateContext = Object.values(options?.templateContext ?? {}).some(
      (value) => typeof value === "string" && value.length > 0,
    );
    const shouldUseTemplate =
      !looksLikeDirectUrlInput || (pageIndex > 0 && hasContextPlaceholders && hasTemplateContext);

    if (shouldUseTemplate) {
      try {
        return buildScraperContextTemplateUrl(baseUrl, searchResolvedTemplate, options?.templateContext ?? {});
      } catch (error) {
        if (!looksLikeDirectUrlInput) {
          throw error;
        }
      }
    }
  }

  return resolveScraperUrl(baseUrl, trimmedQuery);
};

export const resolveScraperTagTargetUrl = (
  baseUrl: string,
  config: ScraperTagFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string => {
  const { looksLikeDirectUrlInput, pageIndex, trimmedQuery } =
    buildScraperListingTemplateResolution(config, query, options);

  if (config.urlStrategy === "template") {
    if (!looksLikeDirectUrlInput || pageIndex > 0) {
      const templateQuery = looksLikeDirectUrlInput
        ? extractScraperTemplateValueFromUrl(baseUrl, config.urlTemplate, trimmedQuery) ?? trimmedQuery
        : trimmedQuery;
      const searchResolvedTemplate = applyScraperSearchTemplate(config.urlTemplate || "", templateQuery, options);

      return resolveScraperUrl(baseUrl, searchResolvedTemplate);
    }
  }

  return resolveScraperUrl(baseUrl, trimmedQuery);
};

export const resolveScraperTagListTargetUrl = (
  baseUrl: string,
  config: ScraperTagListFeatureConfig,
  options?: {
    pageIndex?: number;
  },
): string => buildScraperSearchUrl(baseUrl, config.urlTemplate || "", "", options);

export const resolveScraperSearchRequestConfig = (
  config: ScraperSearchFeatureConfig | ScraperHomepageFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
  },
): ScraperRequestConfig | undefined => {
  const request = normalizeRequestConfig(config.request);
  if (!request || request.method !== "POST") {
    return undefined;
  }

  if (request.bodyMode === "raw") {
    return {
      method: "POST",
      bodyMode: "raw",
      body: typeof request.body === "string" ? applyScraperSearchTemplate(request.body, query, options) : "",
      contentType: request.contentType,
    };
  }

  return {
    method: "POST",
    bodyMode: "form",
    bodyFields: (request.bodyFields ?? [])
      .filter((field) => field.key.trim().length > 0)
      .map((field) => ({
        key: applyScraperSearchTemplate(field.key, query, options),
        value: applyScraperSearchTemplate(field.value, query, options),
      })),
    contentType: request.contentType,
  };
};

export const resolveScraperHomepageRequestConfig = (
  config: ScraperHomepageFeatureConfig,
  options?: {
    pageIndex?: number;
  },
): ScraperRequestConfig | undefined => resolveScraperSearchRequestConfig(config, "", options);
