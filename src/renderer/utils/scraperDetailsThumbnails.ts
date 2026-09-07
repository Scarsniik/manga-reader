import {
  hasScraperFieldSelectorValue,
  type ScraperDetailsFeatureConfig,
  type ScraperPagesFeatureConfig,
  type ScraperRecord,
} from "@/shared/scraper";
import { usesScraperPagesChapters } from "@/renderer/utils/scraperPages";
import {
  createScraperRuntimeImageThumbnail,
  extractScraperDetailsThumbnailsPageFromDocument,
  getScraperRuntimeThumbnailKey,
  resolveScraperPageUrls,
  type ScraperDocumentFetcher,
  type ScraperRuntimeDetailsResult,
  type ScraperRuntimeThumbnail,
} from "@/renderer/utils/scraperRuntime";

type Options = {
  scraper: ScraperRecord;
  details: ScraperRuntimeDetailsResult;
  detailsConfig: ScraperDetailsFeatureConfig | null;
  pagesConfig: ScraperPagesFeatureConfig | null;
  fetchDocument: ScraperDocumentFetcher;
};

export const shouldAutoLoadScraperDetailsThumbnails = (
  details: ScraperRuntimeDetailsResult | null | undefined,
): boolean => Boolean(
  details
  && (details.thumbnails?.length ?? 0) === 0
  && details.thumbnailsNextPageUrl,
);

const mergeUniqueThumbnails = (
  values: ScraperRuntimeThumbnail[],
): ScraperRuntimeThumbnail[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getScraperRuntimeThumbnailKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getTotalPageCount = (details: ScraperRuntimeDetailsResult): number => (
  Number.parseInt(String(details.pageCount ?? "").match(/\d+/)?.[0] ?? "", 10)
);

export const canLoadMoreScraperDetailsThumbnails = (
  details: ScraperRuntimeDetailsResult | null,
  pagesConfig: ScraperPagesFeatureConfig | null,
): boolean => {
  if (!details) return false;
  if (details.thumbnailsNextPageUrl) return true;

  const totalPageCount = getTotalPageCount(details);
  return Boolean(
    pagesConfig
    && !usesScraperPagesChapters(pagesConfig)
    && Number.isFinite(totalPageCount)
    && totalPageCount > (details.thumbnails?.length ?? 0),
  );
};

export const getLoadMoreScraperDetailsThumbnailsLabel = (
  details: ScraperRuntimeDetailsResult | null,
): string => details?.thumbnailsNextPageUrl ? "Voir plus" : "Afficher toutes les pages";

export const loadMoreScraperDetailsThumbnails = async ({
  scraper,
  details,
  detailsConfig,
  pagesConfig,
  fetchDocument,
}: Options): Promise<ScraperRuntimeDetailsResult> => {
  if (!details.thumbnailsNextPageUrl) {
    if (!pagesConfig || usesScraperPagesChapters(pagesConfig)) return details;

    const pageUrls = await resolveScraperPageUrls(
      scraper,
      details,
      pagesConfig,
      fetchDocument,
      { thumbnailsNextPageSelector: detailsConfig?.thumbnailsNextPageSelector },
    );
    if (!pageUrls.length) {
      throw new Error("Aucune page supplementaire n'a ete resolue.");
    }

    return {
      ...details,
      thumbnails: pageUrls.map(createScraperRuntimeImageThumbnail),
      thumbnailsNextPageUrl: undefined,
    };
  }

  if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.thumbnailsSelector)) {
    throw new Error("Le selecteur des vignettes est requis pour charger la suite.");
  }

  const documentResult = await fetchDocument({
    baseUrl: scraper.baseUrl,
    targetUrl: details.thumbnailsNextPageUrl,
  });
  if (!documentResult?.ok || !documentResult.html) {
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La page de vignettes a repondu avec le code HTTP ${documentResult.status}.`
        : "Impossible de charger la page de vignettes suivante."),
    );
  }

  const documentNode = new DOMParser().parseFromString(documentResult.html, "text/html");
  const thumbnailsPage = extractScraperDetailsThumbnailsPageFromDocument(documentNode, detailsConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  });
  if (!thumbnailsPage.thumbnails.length && !thumbnailsPage.nextPageUrl) {
    throw new Error("Aucune vignette supplementaire n'a ete trouvee.");
  }

  return {
    ...details,
    thumbnails: mergeUniqueThumbnails([
      ...(details.thumbnails ?? []),
      ...thumbnailsPage.thumbnails,
    ]),
    thumbnailsNextPageUrl: thumbnailsPage.nextPageUrl === details.thumbnailsNextPageUrl
      ? undefined
      : thumbnailsPage.nextPageUrl,
  };
};

export const autoLoadInitialScraperDetailsThumbnails = async (
  options: Options,
): Promise<ScraperRuntimeDetailsResult> => (
  shouldAutoLoadScraperDetailsThumbnails(options.details)
    ? loadMoreScraperDetailsThumbnails(options)
    : options.details
);
