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
  const { looksLikeDirectUrlInput, pageIndex, searchResolvedTemplate, trimmedQuery } =
    buildScraperListingTemplateResolution(config, query, options);

  if (config.urlStrategy === "template") {
    if (!looksLikeDirectUrlInput || pageIndex > 0) {
      return resolveScraperUrl(baseUrl, searchResolvedTemplate);
    }
  }

  return resolveScraperUrl(baseUrl, trimmedQuery);
};

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
