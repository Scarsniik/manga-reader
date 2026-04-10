import { type IpcMainInvokeEvent } from "electron";
import {
  normalizeScraperBaseUrl,
  resolveScraperUrl,
  type FetchScraperDocumentRequest,
  type FetchScraperDocumentResult,
  type ScraperAccessValidationRequest,
  type ScraperAccessValidationResult,
} from "../../scraper";
import {
  buildScraperFetchInit,
  DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS,
  sanitizeRequestConfig,
} from "./shared";

const buildContentTypeWarning = (
  kind: ScraperAccessValidationRequest["kind"],
  contentType: string | undefined,
): string | undefined => {
  if (!contentType) {
    return undefined;
  }

  const normalized = contentType.toLowerCase();

  if (kind === "site" && !normalized.includes("text/html")) {
    return "La source repond, mais le type de contenu ne ressemble pas a une page HTML.";
  }

  if (kind === "api" && !normalized.includes("json")) {
    return "La source repond, mais le type de contenu ne ressemble pas a une reponse JSON.";
  }

  return undefined;
};

export async function validateScraperAccess(
  _event: IpcMainInvokeEvent,
  request: ScraperAccessValidationRequest,
): Promise<ScraperAccessValidationResult> {
  const checkedAt = new Date().toISOString();

  let normalizedUrl = "";
  try {
    normalizedUrl = normalizeScraperBaseUrl(request.baseUrl);
  } catch (error) {
    return {
      ok: false,
      kind: request.kind,
      normalizedUrl: request.baseUrl.trim(),
      checkedAt,
      error: error instanceof Error ? error.message : "URL invalide.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Manga Helper Scraper Validation/1.0",
        Accept: request.kind === "api"
          ? "application/json, text/plain, */*"
          : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = response.headers.get("content-type") ?? undefined;
    const warning = buildContentTypeWarning(request.kind, contentType);

    try {
      await response.body?.cancel();
    } catch {
      // no-op: some response bodies cannot be cancelled once fully buffered
    }

    return {
      ok: response.ok,
      kind: request.kind,
      normalizedUrl,
      checkedAt,
      status: response.status,
      finalUrl: response.url || normalizedUrl,
      contentType,
      warning,
      error: response.ok ? undefined : `La source a repondu avec le code HTTP ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Echec de la requete.";
    return {
      ok: false,
      kind: request.kind,
      normalizedUrl,
      checkedAt,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchScraperDocument(
  _event: IpcMainInvokeEvent,
  request: FetchScraperDocumentRequest,
): Promise<FetchScraperDocumentResult> {
  const checkedAt = new Date().toISOString();
  const requestConfig = sanitizeRequestConfig(request.requestConfig);

  let requestedUrl = "";
  try {
    requestedUrl = resolveScraperUrl(request.baseUrl, request.targetUrl);
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl: request.targetUrl.trim(),
      error: error instanceof Error ? error.message : "URL invalide.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const fetchInit = buildScraperFetchInit(
      requestConfig,
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    );
    const response = await fetch(requestedUrl, {
      method: fetchInit.method,
      redirect: "follow",
      signal: controller.signal,
      headers: fetchInit.headers,
      body: fetchInit.body,
    });
    const contentType = response.headers.get("content-type") ?? undefined;
    let html: string | undefined;

    if (response.ok && contentType && contentType.toLowerCase().startsWith("image/")) {
      try {
        await response.body?.cancel();
      } catch {
        // no-op
      }
    } else {
      html = await response.text();
    }

    return {
      ok: response.ok,
      checkedAt,
      requestedUrl,
      finalUrl: response.url || requestedUrl,
      status: response.status,
      contentType,
      html: response.ok ? html : undefined,
      error: response.ok ? undefined : `La page a repondu avec le code HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl,
      error: error instanceof Error ? error.message : "Echec de la requete.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
