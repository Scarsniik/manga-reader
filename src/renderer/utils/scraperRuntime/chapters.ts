import {
  hasScraperFieldSelectorValue,
  type FetchScraperDocumentResult,
  type ScraperChaptersFeatureConfig,
} from "@/shared/scraper";
import {
  hasScraperChapterPagePlaceholder,
  resolveScraperChaptersSourceUrl,
  type ScraperTemplateContext,
} from "@/renderer/utils/scraperTemplateContext";
import type {
  ScraperDocumentFetcher,
  ScraperResolvedChaptersResult,
  ScraperRuntimeChapterResult,
} from "@/renderer/utils/scraperRuntime/types";
import {
  extractFieldSelectorValuesFromRoot,
  extractUrlFieldSelectorValuesFromRoot,
  toAbsoluteScraperUrl,
} from "@/renderer/utils/scraperRuntime/selectorExtraction";

const uniqueChapterResults = (chapters: ScraperRuntimeChapterResult[]): ScraperRuntimeChapterResult[] => {
  const seen = new Set<string>();

  return chapters.filter((chapter) => {
    const key = `${chapter.url}::${chapter.label}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const applyScraperChaptersOrder = (
  chapters: ScraperRuntimeChapterResult[],
  config: Pick<ScraperChaptersFeatureConfig, "reverseOrder">,
): ScraperRuntimeChapterResult[] => (config.reverseOrder ? [...chapters].reverse() : chapters);

export const extractScraperChaptersFromDocument = (
  doc: Document,
  config: ScraperChaptersFeatureConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperRuntimeChapterResult[] => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const chapterRoots = config.chapterListSelector
    ? Array.from(doc.querySelectorAll(config.chapterListSelector))
    : [doc];
  const chapterItems = Array.from(
    new Set(chapterRoots.flatMap((root) => Array.from(root.querySelectorAll(config.chapterItemSelector)))),
  );

  const chapters = chapterItems.reduce<ScraperRuntimeChapterResult[]>((accumulator, item, index) => {
    const chapterUrl = extractUrlFieldSelectorValuesFromRoot(item, config.chapterUrlSelector)[0];
    const chapterLabel = extractFieldSelectorValuesFromRoot(item, config.chapterLabelSelector)[0];
    const chapterImage = config.chapterImageSelector
      ? extractFieldSelectorValuesFromRoot(item, config.chapterImageSelector)[0]
      : undefined;

    if (!chapterUrl || !chapterLabel) {
      return accumulator;
    }

    accumulator.push({
      url: toAbsoluteScraperUrl(chapterUrl, documentUrl),
      label: chapterLabel || `Chapitre ${index + 1}`,
      image: chapterImage ? toAbsoluteScraperUrl(chapterImage, documentUrl) : undefined,
    });

    return accumulator;
  }, []);

  return uniqueChapterResults(chapters);
};

export async function resolveScraperChapters(
  scraperBaseUrl: string,
  detailsUrl: string,
  config: ScraperChaptersFeatureConfig,
  templateContext: ScraperTemplateContext,
  fetchDocument: ScraperDocumentFetcher,
  options?: {
    maxChapterPages?: number;
  },
): Promise<ScraperResolvedChaptersResult> {
  const maxChapterPages = Math.max(1, options?.maxChapterPages ?? 100);
  const usesChapterPagination =
    config.urlStrategy === "template" && hasScraperChapterPagePlaceholder(config.urlTemplate);
  const parser = new DOMParser();
  let sourceResult: FetchScraperDocumentResult | null = null;
  let chapters: ScraperRuntimeChapterResult[] = [];
  let pagesVisited = 0;

  for (let chapterPageIndex = 0; chapterPageIndex < maxChapterPages; chapterPageIndex += 1) {
    const targetUrl = resolveScraperChaptersSourceUrl(scraperBaseUrl, config, templateContext, detailsUrl, {
      chapterPage: chapterPageIndex + 1,
    });

    const documentResult = await fetchDocument({
      baseUrl: scraperBaseUrl,
      targetUrl,
    });
    pagesVisited += 1;

    if (!sourceResult) {
      sourceResult = documentResult;
    }

    if (!documentResult.ok || !documentResult.html) {
      if (chapterPageIndex === 0) {
        return {
          sourceResult: documentResult,
          chapters: [],
          pagesVisited,
        };
      }

      break;
    }

    const doc = parser.parseFromString(documentResult.html, "text/html");
    const pageChapters = extractScraperChaptersFromDocument(doc, config, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });

    if (!pageChapters.length) {
      if (chapterPageIndex === 0) {
        return {
          sourceResult: documentResult,
          chapters: [],
          pagesVisited,
        };
      }

      break;
    }

    const mergedChapters = uniqueChapterResults([...chapters, ...pageChapters]);
    const addedChapterCount = mergedChapters.length - chapters.length;
    chapters = mergedChapters;

    if (!usesChapterPagination) {
      break;
    }

    if (chapterPageIndex > 0 && addedChapterCount === 0) {
      break;
    }
  }

  if (!sourceResult) {
    throw new Error("Impossible de recuperer la source des chapitres.");
  }

  return {
    sourceResult,
    chapters: applyScraperChaptersOrder(chapters, config),
    pagesVisited,
  };
}
