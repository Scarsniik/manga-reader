import { type IpcMainInvokeEvent } from "electron";
import sharp from "sharp";
import {
  normalizeScraperBaseUrl,
  resolveScraperUrl,
  type FetchScraperDocumentRequest,
  type FetchScraperDocumentResult,
  type ScraperAccessValidationRequest,
  type ScraperAccessValidationResult,
} from "../../scraper";
import { APP_PRODUCT_NAME } from "../../appIdentity";
import {
  buildScraperFetchInit,
  DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS,
  sanitizeRequestConfig,
} from "./shared";
import {
  fetchWithRedirectCookies,
  findSameOriginContentWarningBypassUrl,
  isImageContentType,
  SCRAPER_DOCUMENT_ACCEPT,
} from "./documentFetch";
import { acquireScraperRequestSlot } from "./requestLimiter";

const MAX_VALIDATED_IMAGE_BYTES = 16 * 1024 * 1024;

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
        "User-Agent": `${APP_PRODUCT_NAME} Scraper Validation/1.0`,
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
  const releaseRequestSlot = await acquireScraperRequestSlot(request);
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const fetchInit = buildScraperFetchInit(
      requestConfig,
      SCRAPER_DOCUMENT_ACCEPT,
    );
    let fetchResult = await fetchWithRedirectCookies(requestedUrl, fetchInit, controller.signal);
    let response = fetchResult.response;
    let contentType = response.headers.get("content-type") ?? undefined;
    let html: string | undefined;

    if (response.ok && isImageContentType(contentType)) {
      if (request.validateImage) {
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_VALIDATED_IMAGE_BYTES) {
          return {
            ok: false,
            checkedAt,
            requestedUrl,
            finalUrl: response.url || requestedUrl,
            status: response.status,
            contentType,
            error: "L'image distante est trop volumineuse pour etre validee.",
          };
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        if (imageBuffer.length > MAX_VALIDATED_IMAGE_BYTES) {
          return {
            ok: false,
            checkedAt,
            requestedUrl,
            finalUrl: response.url || requestedUrl,
            status: response.status,
            contentType,
            error: "L'image distante est trop volumineuse pour etre validee.",
          };
        }

        try {
          await sharp(imageBuffer).metadata();
        } catch {
          return {
            ok: false,
            checkedAt,
            requestedUrl,
            finalUrl: response.url || requestedUrl,
            status: response.status,
            contentType,
            error: "L'image distante n'est pas exploitable.",
          };
        }
      } else {
        try {
          await response.body?.cancel();
        } catch {
          // no-op
        }
      }
    } else {
      html = await response.text();
    }

    if (response.ok && !request.validateImage && html) {
      const bypassUrl = findSameOriginContentWarningBypassUrl(html, response.url || requestedUrl);
      if (bypassUrl) {
        fetchResult = await fetchWithRedirectCookies(
          bypassUrl,
          buildScraperFetchInit(undefined, SCRAPER_DOCUMENT_ACCEPT),
          controller.signal,
          fetchResult.cookies,
        );
        response = fetchResult.response;
        contentType = response.headers.get("content-type") ?? undefined;

        if (response.ok && isImageContentType(contentType)) {
          try {
            await response.body?.cancel();
          } catch {
            // no-op
          }
          html = undefined;
        } else {
          html = await response.text();
        }
      }
    }

    if (
      response.ok
      && request.validateImage
      && !isImageContentType(contentType)
    ) {
      try {
        await response.body?.cancel();
      } catch {
        // no-op
      }

      return {
        ok: false,
        checkedAt,
        requestedUrl,
        finalUrl: response.url || requestedUrl,
        status: response.status,
        contentType,
        error: "La ressource distante ne repond pas comme une image.",
      };
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
    releaseRequestSlot();
  }
}
