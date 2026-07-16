import type { FetchScraperDocumentResult } from "@/shared/scraper";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";

const FAVICON_STORAGE_PREFIX = "scraper-favicon:";
const FAVICON_SELECTORS = [
  'link[rel~="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
  'link[rel="apple-touch-icon-precomposed"]',
];

const normalizeHttpUrl = (value: string, baseUrl?: string): string | null => {
  try {
    const parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const buildStorageKey = (scraperId: string, baseUrl: string): string => {
  const origin = normalizeHttpUrl(baseUrl);
  return `${FAVICON_STORAGE_PREFIX}${scraperId}:${origin ?? baseUrl}`;
};

const getStoredFaviconUrl = (scraperId: string, baseUrl: string): string | null => {
  try {
    return normalizeHttpUrl(window.localStorage.getItem(buildStorageKey(scraperId, baseUrl)) || "");
  } catch {
    return null;
  }
};

export const rememberScraperFaviconUrl = (
  scraperId: string,
  baseUrl: string,
  faviconUrl: string,
): void => {
  try {
    window.localStorage.setItem(buildStorageKey(scraperId, baseUrl), faviconUrl);
  } catch {
    // Local storage can be unavailable in restricted renderer contexts.
  }
};

export const getInitialScraperFaviconUrls = (scraperId: string, baseUrl: string): string[] => {
  const storedUrl = getStoredFaviconUrl(scraperId, baseUrl);
  const defaultUrl = normalizeHttpUrl("/favicon.ico", baseUrl);
  return Array.from(new Set([storedUrl, defaultUrl].filter((url): url is string => Boolean(url))));
};

export const buildScraperFaviconImageUrl = (faviconUrl: string, baseUrl: string): string => (
  buildRemoteThumbnailUrl(faviconUrl, baseUrl) ?? faviconUrl
);

const getFallbackFaviconUrls = (baseUrl: string): string[] => {
  const normalizedBaseUrl = normalizeHttpUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return [];
  }

  const hostname = new URL(normalizedBaseUrl).hostname;
  return [
    normalizeHttpUrl("/favicon.png", normalizedBaseUrl),
    normalizeHttpUrl("/apple-touch-icon.png", normalizedBaseUrl),
    normalizeHttpUrl("/apple-touch-icon-precomposed.png", normalizedBaseUrl),
    normalizeHttpUrl(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`),
  ].filter((url): url is string => Boolean(url));
};

export const discoverScraperFaviconUrls = async (
  scraperId: string,
  baseUrl: string,
): Promise<string[]> => {
  const fallbackUrls = getFallbackFaviconUrls(baseUrl);
  const fetchDocument = window.api?.fetchScraperDocument;
  if (typeof fetchDocument !== "function") {
    return fallbackUrls;
  }

  try {
    const result = await fetchDocument({
      scraperId,
      baseUrl,
      targetUrl: baseUrl,
    }) as FetchScraperDocumentResult;
    if (!result.ok || !result.html) {
      return fallbackUrls;
    }

    const document = new DOMParser().parseFromString(result.html, "text/html");
    const documentUrl = result.finalUrl || baseUrl;
    const discoveredUrls = FAVICON_SELECTORS.flatMap((selector) => (
      Array.from(document.querySelectorAll<HTMLLinkElement>(selector))
        .map((link) => normalizeHttpUrl(link.getAttribute("href") || "", documentUrl))
        .filter((url): url is string => Boolean(url))
    ));

    return Array.from(new Set([...discoveredUrls, ...getFallbackFaviconUrls(documentUrl)]));
  } catch {
    return fallbackUrls;
  }
};
