import { buildScraperFetchInit } from "./shared";

export const SCRAPER_DOCUMENT_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const MAX_SCRAPER_REDIRECTS = 8;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ScraperFetchInit = ReturnType<typeof buildScraperFetchInit>;
type ScraperCookieJar = Map<string, Map<string, string>>;

export type ScraperFetchResult = {
  response: Response;
  cookies: ScraperCookieJar;
};

const getSetCookieHeaders = (headers: Headers): string[] => {
  const headersWithCookieGetter = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithCookieGetter.getSetCookie === "function") {
    return headersWithCookieGetter.getSetCookie();
  }

  const header = headers.get("set-cookie");
  return header ? [header] : [];
};

const splitCombinedSetCookieHeader = (value: string): string[] => (
  value
    .split(/,(?=\s*[^;,=\s]+=[^;,\s]*)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const getCookieOrigin = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

const cloneCookieJar = (cookies: ScraperCookieJar): ScraperCookieJar => (
  new Map(Array.from(cookies.entries()).map(([origin, originCookies]) => [
    origin,
    new Map(originCookies),
  ]))
);

const getOriginCookies = (
  cookies: ScraperCookieJar,
  url: string,
): Map<string, string> | null => {
  const origin = getCookieOrigin(url);
  if (!origin) {
    return null;
  }

  let originCookies = cookies.get(origin);
  if (!originCookies) {
    originCookies = new Map();
    cookies.set(origin, originCookies);
  }

  return originCookies;
};

const storeResponseCookies = (cookies: ScraperCookieJar, headers: Headers, url: string): void => {
  const originCookies = getOriginCookies(cookies, url);
  if (!originCookies) {
    return;
  }

  getSetCookieHeaders(headers)
    .flatMap(splitCombinedSetCookieHeader)
    .forEach((setCookieHeader) => {
      const cookiePair = setCookieHeader.split(";")[0] ?? "";
      const separatorIndex = cookiePair.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }

      const name = cookiePair.slice(0, separatorIndex).trim();
      const value = cookiePair.slice(separatorIndex + 1).trim();
      if (!name) {
        return;
      }

      originCookies.set(name, value);
    });
};

const buildCookieHeader = (cookies: ScraperCookieJar, url: string): string => {
  const originCookies = cookies.get(getCookieOrigin(url));
  if (!originCookies) {
    return "";
  }

  return Array.from(originCookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
};

const getRedirectLocation = (response: Response, currentUrl: string): string | null => {
  if (!REDIRECT_STATUSES.has(response.status)) {
    return null;
  }

  const location = response.headers.get("location");
  if (!location) {
    return null;
  }

  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
};

const shouldRewriteRedirectToGet = (status: number, method: "GET" | "POST"): boolean => (
  status === 303 || ((status === 301 || status === 302) && method === "POST")
);

export const fetchWithRedirectCookies = async (
  initialUrl: string,
  initialFetchInit: ScraperFetchInit,
  signal: AbortSignal,
  initialCookies: ScraperCookieJar = new Map(),
): Promise<ScraperFetchResult> => {
  const cookies = cloneCookieJar(initialCookies);
  let currentUrl = initialUrl;
  let method = initialFetchInit.method;
  let body = initialFetchInit.body;
  let headers = { ...initialFetchInit.headers };

  for (let redirectCount = 0; redirectCount <= MAX_SCRAPER_REDIRECTS; redirectCount += 1) {
    const cookieHeader = buildCookieHeader(cookies, currentUrl);
    const requestHeaders = {
      ...headers,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
    const response = await fetch(currentUrl, {
      method,
      redirect: "manual",
      signal,
      headers: requestHeaders,
      body,
    });

    storeResponseCookies(cookies, response.headers, currentUrl);

    const nextUrl = getRedirectLocation(response, currentUrl);
    if (!nextUrl) {
      return {
        response,
        cookies,
      };
    }

    try {
      await response.body?.cancel();
    } catch {
      // no-op
    }

    currentUrl = nextUrl;
    if (shouldRewriteRedirectToGet(response.status, method)) {
      method = "GET";
      body = undefined;
      headers = { ...headers };
      delete headers["Content-Type"];
    }
  }

  throw new Error("Trop de redirections pendant le chargement de la page.");
};

const decodeHtmlAttribute = (value: string): string => (
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
);

const stripHtmlTags = (value: string): string => (
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
);

const isSameOriginUrl = (leftUrl: string, rightUrl: string): boolean => {
  try {
    return new URL(leftUrl).origin === new URL(rightUrl).origin;
  } catch {
    return false;
  }
};

export const findSameOriginContentWarningBypassUrl = (html: string, currentUrl: string): string | null => {
  if (!/Content Warning/i.test(html) || !/View Gallery/i.test(html)) {
    return null;
  }

  const linkPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const rawHref = decodeHtmlAttribute(match[2] ?? "");
    const linkText = stripHtmlTags(match[3] ?? "");
    if (!/\bView Gallery\b/i.test(linkText) || !/[?&]nw=session(?:[&#]|$)/i.test(rawHref)) {
      continue;
    }

    try {
      const targetUrl = new URL(rawHref, currentUrl).toString();
      return isSameOriginUrl(targetUrl, currentUrl) ? targetUrl : null;
    } catch {
      return null;
    }
  }

  return null;
};

export const isImageContentType = (contentType: string | undefined): boolean => (
  Boolean(contentType && contentType.toLowerCase().startsWith("image/"))
);
