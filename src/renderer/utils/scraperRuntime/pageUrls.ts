import {
  buildScraperContextTemplateUrl,
  hasScraperFieldSelectorValue,
  type ScraperPagesFeatureConfig,
  type ScraperRecord,
} from "@/shared/scraper";
import {
  buildScraperTemplateContextFromDetails,
  resolveScraperTemplateBaseUrl,
} from "@/renderer/utils/scraperTemplateContext";
import {
  usesScraperPagesChapterSource,
  usesScraperPagesChapters,
  usesScraperPagesLinkedPages,
  usesScraperPagesSelectorSource,
  usesScraperPagesTemplateChapterContext,
} from "@/renderer/utils/scraperPages";
import type {
  ScraperDocumentFetcher,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime/types";
import {
  buildTemplateContextForPage,
  hasPagePlaceholder,
  inferTemplateSelectorPageLimit,
  resolveSequentialPageUrlsFromCover,
} from "@/renderer/utils/scraperRuntime/pageTemplates";
import {
  extractSelectorValues,
  isImageLikeContentType,
  toAbsoluteScraperUrl,
  uniqueValues,
} from "@/renderer/utils/scraperRuntime/selectorExtraction";

const buildScraperPageTemplateUrl = (
  scraperBaseUrl: string,
  pagesConfig: ScraperPagesFeatureConfig,
  templateContext: ReturnType<typeof buildScraperTemplateContextFromDetails>,
  templateBaseUrl: string,
  pageIndex: number,
): string =>
  buildScraperContextTemplateUrl(
    scraperBaseUrl,
    pagesConfig.urlTemplate || "",
    buildTemplateContextForPage(templateContext, pageIndex),
    {
      relativeToUrl: templateBaseUrl,
    },
  );

const buildFetchPagesErrorMessage = (
  result: Awaited<ReturnType<ScraperDocumentFetcher>>,
  fallbackMessage: string,
): string =>
  result.error ||
  (typeof result.status === "number"
    ? `La source des pages a repondu avec le code HTTP ${result.status}.`
    : fallbackMessage);

const fetchScraperHtmlPage = async (
  fetchDocument: ScraperDocumentFetcher,
  scraperBaseUrl: string,
  targetUrl: string,
  fallbackMessage: string,
): Promise<{
  doc: Document;
  documentUrl: string;
}> => {
  const result = await fetchDocument({
    baseUrl: scraperBaseUrl,
    targetUrl,
  });

  if (!result.ok || !result.html) {
    throw new Error(buildFetchPagesErrorMessage(result, fallbackMessage));
  }

  return {
    doc: new DOMParser().parseFromString(result.html, "text/html"),
    documentUrl: result.finalUrl || result.requestedUrl,
  };
};

const extractUniquePageUrlsFromDocument = (
  doc: Document,
  pageImageSelector: NonNullable<ScraperPagesFeatureConfig["pageImageSelector"]>,
  documentUrl: string,
): string[] =>
  uniqueValues(extractSelectorValues(doc, pageImageSelector).map((value) => toAbsoluteScraperUrl(value, documentUrl)));

const extractUniquePageLinkUrlsFromDocument = (
  doc: Document,
  pageLinkSelector: NonNullable<ScraperPagesFeatureConfig["pageLinkSelector"]>,
  documentUrl: string,
): string[] =>
  uniqueValues(extractSelectorValues(doc, pageLinkSelector).map((value) => toAbsoluteScraperUrl(value, documentUrl)));

const resolvePageImageUrlsFromLinkedPages = async (
  fetchDocument: ScraperDocumentFetcher,
  scraperBaseUrl: string,
  pageLinkUrls: string[],
  pageImageSelector: NonNullable<ScraperPagesFeatureConfig["pageImageSelector"]>,
): Promise<string[]> => {
  const resolvedPageUrls: string[] = [];
  const seenPageUrls = new Set<string>();

  for (const pageLinkUrl of pageLinkUrls) {
    const { doc, documentUrl } = await fetchScraperHtmlPage(
      fetchDocument,
      scraperBaseUrl,
      pageLinkUrl,
      "Impossible de recuperer une page intermediaire du lecteur.",
    );
    const pageUrls = extractUniquePageUrlsFromDocument(doc, pageImageSelector, documentUrl);

    pageUrls.forEach((pageUrl) => {
      if (seenPageUrls.has(pageUrl)) {
        return;
      }

      seenPageUrls.add(pageUrl);
      resolvedPageUrls.push(pageUrl);
    });
  }

  return resolvedPageUrls;
};

const assertPageUrlsFound = (pageUrls: string[], message: string): void => {
  if (!pageUrls.length) {
    throw new Error(message);
  }
};

export async function resolveScraperPageUrls(
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  fetchDocument: ScraperDocumentFetcher,
  options?: {
    maxTemplatePages?: number;
    chapter?: ScraperRuntimeChapterResult | null;
  },
): Promise<string[]> {
  const maxTemplatePages = Math.max(1, options?.maxTemplatePages ?? 2000);
  const chapter = options?.chapter ?? null;
  const detailsUrl = details.finalUrl || details.requestedUrl;
  const usesChapterSource = usesScraperPagesChapterSource(pagesConfig);
  const usesChapterContext = usesScraperPagesChapters(pagesConfig);
  const usesTemplateChapterContext = usesScraperPagesTemplateChapterContext(pagesConfig);
  const usesLinkedPages = usesScraperPagesLinkedPages(pagesConfig);
  const targetUrl = usesChapterSource ? chapter?.url || "" : detailsUrl;
  const templateBaseUrl = resolveScraperTemplateBaseUrl(
    scraper.baseUrl,
    pagesConfig.templateBase,
    usesTemplateChapterContext && chapter?.url ? chapter.url : detailsUrl,
  );

  if (usesChapterContext && !chapter?.url) {
    throw new Error("Choisis d'abord un chapitre pour recuperer les pages.");
  }

  if (usesScraperPagesSelectorSource(pagesConfig)) {
    if (!pagesConfig.pageImageSelector || !hasScraperFieldSelectorValue(pagesConfig.pageImageSelector)) {
      throw new Error("Le composant Pages doit avoir un selecteur pour lire les pages depuis la fiche ou un chapitre.");
    }

    const { doc, documentUrl } = await fetchScraperHtmlPage(
      fetchDocument,
      scraper.baseUrl,
      targetUrl,
      "Impossible de recuperer la source des pages pour extraire les pages.",
    );

    if (usesLinkedPages) {
      if (!pagesConfig.pageLinkSelector || !hasScraperFieldSelectorValue(pagesConfig.pageLinkSelector)) {
        throw new Error("Le mode pages intermediaires requiert un selecteur de liens de pages.");
      }

      const pageLinkUrls = extractUniquePageLinkUrlsFromDocument(doc, pagesConfig.pageLinkSelector, documentUrl);
      assertPageUrlsFound(pageLinkUrls, "Aucun lien de page intermediaire n'a ete trouve avec la configuration actuelle.");

      const resolvedPageUrls = await resolvePageImageUrlsFromLinkedPages(
        fetchDocument,
        scraper.baseUrl,
        pageLinkUrls,
        pagesConfig.pageImageSelector,
      );
      assertPageUrlsFound(resolvedPageUrls, "Aucune image n'a ete trouvee dans les pages intermediaires.");

      return resolvedPageUrls;
    }

    const uniquePageUrls = extractUniquePageUrlsFromDocument(doc, pagesConfig.pageImageSelector, documentUrl);

    assertPageUrlsFound(uniquePageUrls, "Aucune page n'a ete trouvee avec la configuration actuelle.");

    return uniquePageUrls;
  }

  if (!pagesConfig.urlTemplate) {
    throw new Error("Le template des pages est requis pour ce mode.");
  }

  const templateContext = buildScraperTemplateContextFromDetails(details, chapter);

  if (pagesConfig.pageImageSelector && hasScraperFieldSelectorValue(pagesConfig.pageImageSelector)) {
    const pageImageSelector = pagesConfig.pageImageSelector;

    if (usesLinkedPages) {
      if (hasPagePlaceholder(pagesConfig.urlTemplate)) {
        const pageUrls: string[] = [];
        const seenPageUrls = new Set<string>();
        const { isKnownTotal, pageLimit } = inferTemplateSelectorPageLimit(
          details,
          pagesConfig,
          chapter,
          maxTemplatePages,
        );

        for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
          const targetUrl = buildScraperPageTemplateUrl(
            scraper.baseUrl,
            pagesConfig,
            templateContext,
            templateBaseUrl,
            pageIndex,
          );
          let nextPageUrls: string[] = [];

          try {
            const pageLinkSelector = pagesConfig.pageLinkSelector;
            const pageLinkUrls = pageLinkSelector && hasScraperFieldSelectorValue(pageLinkSelector)
              ? await (async () => {
                const { doc, documentUrl } = await fetchScraperHtmlPage(
                  fetchDocument,
                  scraper.baseUrl,
                  targetUrl,
                  "Impossible de recuperer la source des liens de pages intermediaires.",
                );

                return extractUniquePageLinkUrlsFromDocument(doc, pageLinkSelector, documentUrl);
              })()
              : [targetUrl];

            if (!pageLinkUrls.length) {
              throw new Error("Aucun lien de page intermediaire n'a ete trouve avec la configuration actuelle.");
            }

            nextPageUrls = (await resolvePageImageUrlsFromLinkedPages(
              fetchDocument,
              scraper.baseUrl,
              pageLinkUrls,
              pageImageSelector,
            )).filter((pageUrl) => {
              if (seenPageUrls.has(pageUrl)) {
                return false;
              }

              seenPageUrls.add(pageUrl);
              return true;
            });
          } catch (error) {
            if (pageIndex === 0 || isKnownTotal) {
              throw error;
            }

            break;
          }

          if (!nextPageUrls.length) {
            if (pageIndex === 0 || isKnownTotal) {
              throw new Error("Aucune image n'a ete trouvee dans les pages intermediaires.");
            }

            break;
          }

          pageUrls.push(...nextPageUrls);
        }

        assertPageUrlsFound(pageUrls, "Aucune image n'a ete trouvee dans les pages intermediaires.");

        return pageUrls;
      }

      const targetUrl = buildScraperPageTemplateUrl(scraper.baseUrl, pagesConfig, templateContext, templateBaseUrl, 0);
      const pageLinkSelector = pagesConfig.pageLinkSelector;
      const pageLinkUrls = pageLinkSelector && hasScraperFieldSelectorValue(pageLinkSelector)
        ? await (async () => {
          const { doc, documentUrl } = await fetchScraperHtmlPage(
            fetchDocument,
            scraper.baseUrl,
            targetUrl,
            "Impossible de recuperer la source des liens de pages intermediaires.",
          );

          return extractUniquePageLinkUrlsFromDocument(doc, pageLinkSelector, documentUrl);
        })()
        : [targetUrl];

      assertPageUrlsFound(pageLinkUrls, "Aucun lien de page intermediaire n'a ete trouve avec la configuration actuelle.");

      const resolvedPageUrls = await resolvePageImageUrlsFromLinkedPages(
        fetchDocument,
        scraper.baseUrl,
        pageLinkUrls,
        pageImageSelector,
      );
      assertPageUrlsFound(resolvedPageUrls, "Aucune image n'a ete trouvee dans les pages intermediaires.");

      return resolvedPageUrls;
    }

    if (hasPagePlaceholder(pagesConfig.urlTemplate)) {
      const pageUrls: string[] = [];
      const seenPageUrls = new Set<string>();
      const { isKnownTotal, pageLimit } = inferTemplateSelectorPageLimit(
        details,
        pagesConfig,
        chapter,
        maxTemplatePages,
      );

      for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
        const targetUrl = buildScraperPageTemplateUrl(
          scraper.baseUrl,
          pagesConfig,
          templateContext,
          templateBaseUrl,
          pageIndex,
        );
        let nextPageUrls: string[] = [];
        try {
          const { doc, documentUrl } = await fetchScraperHtmlPage(
            fetchDocument,
            scraper.baseUrl,
            targetUrl,
            "Impossible de recuperer la source des pages.",
          );
          nextPageUrls = extractUniquePageUrlsFromDocument(doc, pagesConfig.pageImageSelector, documentUrl).filter(
            (pageUrl) => {
              if (seenPageUrls.has(pageUrl)) {
                return false;
              }

              seenPageUrls.add(pageUrl);
              return true;
            },
          );
        } catch (error) {
          if (pageIndex === 0 || isKnownTotal) {
            throw error;
          }

          break;
        }

        if (!nextPageUrls.length) {
          if (pageIndex === 0 || isKnownTotal) {
            throw new Error("Aucune page n'a ete trouvee avec le selecteur fourni.");
          }

          break;
        }

        pageUrls.push(...nextPageUrls);
      }

      if (!pageUrls.length) {
        throw new Error("Aucune page n'a ete trouvee avec le selecteur fourni.");
      }

      return pageUrls;
    }

    const targetUrl = buildScraperPageTemplateUrl(scraper.baseUrl, pagesConfig, templateContext, templateBaseUrl, 0);
    const { doc, documentUrl } = await fetchScraperHtmlPage(
      fetchDocument,
      scraper.baseUrl,
      targetUrl,
      "Impossible de recuperer la source des pages.",
    );
    const uniquePageUrls = extractUniquePageUrlsFromDocument(doc, pagesConfig.pageImageSelector, documentUrl);

    assertPageUrlsFound(uniquePageUrls, "Aucune page n'a ete trouvee avec le selecteur fourni.");

    return uniquePageUrls;
  }

  if (!hasPagePlaceholder(pagesConfig.urlTemplate)) {
    const targetUrl = buildScraperPageTemplateUrl(scraper.baseUrl, pagesConfig, templateContext, templateBaseUrl, 0);
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      const fallbackPageUrls = await resolveSequentialPageUrlsFromCover(details, fetchDocument, maxTemplatePages);
      if (fallbackPageUrls?.length) {
        return fallbackPageUrls;
      }

      throw new Error(result.error || "Le template des pages ne renvoie pas une image exploitable.");
    }

    return [result.finalUrl || result.requestedUrl];
  }

  const pageUrls: string[] = [];

  for (let pageIndex = 0; pageIndex < maxTemplatePages; pageIndex += 1) {
    const targetUrl = buildScraperPageTemplateUrl(
      scraper.baseUrl,
      pagesConfig,
      templateContext,
      templateBaseUrl,
      pageIndex,
    );
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      if (pageIndex === 0) {
        const fallbackPageUrls = await resolveSequentialPageUrlsFromCover(details, fetchDocument, maxTemplatePages);
        if (fallbackPageUrls?.length) {
          return fallbackPageUrls;
        }

        throw new Error(result.error || "Le template des pages ne renvoie pas une premiere page valide.");
      }
      break;
    }

    pageUrls.push(result.finalUrl || result.requestedUrl);
  }

  const uniquePageUrls = uniqueValues(pageUrls);
  if (!uniquePageUrls.length) {
    throw new Error("Aucune page n'a pu etre resolue depuis le template.");
  }

  return uniquePageUrls;
}
