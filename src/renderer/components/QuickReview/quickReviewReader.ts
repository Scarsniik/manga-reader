import type { ReaderLocationState } from "@/renderer/components/Reader/types";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import { resolveScraperReaderPageUrls } from "@/renderer/utils/scraperReaderPages";
import { usesScraperPagesChapters } from "@/renderer/utils/scraperPages";
import {
  createScraperMangaId,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  type ScraperRuntimeChapterResult,
  type ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime";
import { openReaderWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import {
  normalizeScraperBookmarkSourceUrl,
  type ScraperReaderProgressRecord,
} from "@/shared/scraper";

type QuickReviewReaderSelectionOptions = {
  scraperId: string;
  sourceUrls: string[];
  chapters: ScraperRuntimeChapterResult[];
  progressRecords: ScraperReaderProgressRecord[];
};

export type QuickReviewReaderSelection = {
  chapter: ScraperRuntimeChapterResult;
  mangaId: string;
  progress: ScraperReaderProgressRecord | null;
  sourceUrl: string;
};

type OpenQuickReviewReaderOptions = {
  item: QuickReviewItem;
  details: ScraperRuntimeDetailsResult;
  chapters: ScraperRuntimeChapterResult[];
};

export const canOpenQuickReviewChapterReader = (
  item: QuickReviewItem | null,
  chapters: ScraperRuntimeChapterResult[],
): boolean => {
  if (!item || !chapters.length) {
    return false;
  }

  const pagesConfig = getScraperPagesFeatureConfig(
    getScraperFeature(item.primarySource.scraper, "pages"),
  );
  return usesScraperPagesChapters(pagesConfig);
};

const toTimestamp = (value: unknown): number => {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeReaderPage = (value: unknown, totalPages: number): number => {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : 1;
  return Math.max(1, Math.min(Math.max(1, totalPages), parsed));
};

export const selectQuickReviewReaderChapter = ({
  scraperId,
  sourceUrls,
  chapters,
  progressRecords,
}: QuickReviewReaderSelectionOptions): QuickReviewReaderSelection | null => {
  const normalizedSourceUrls = new Set(
    sourceUrls.map(normalizeScraperBookmarkSourceUrl).filter(Boolean),
  );
  const matchingProgressRecords = progressRecords
    .filter((record) => (
      record.scraperId === scraperId
      && normalizedSourceUrls.has(normalizeScraperBookmarkSourceUrl(record.sourceUrl))
    ))
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));

  for (const progress of matchingProgressRecords) {
    const chapter = chapters.find((candidate) => (
      createScraperMangaId(scraperId, progress.sourceUrl, candidate.url) === progress.id
    ));
    if (chapter) {
      return {
        chapter,
        mangaId: progress.id,
        progress,
        sourceUrl: progress.sourceUrl,
      };
    }
  }

  const firstChapter = chapters[0];
  const sourceUrl = sourceUrls.find((value) => value.trim())?.trim() ?? "";
  if (!firstChapter || !sourceUrl) {
    return null;
  }

  return {
    chapter: firstChapter,
    mangaId: createScraperMangaId(scraperId, sourceUrl, firstChapter.url),
    progress: null,
    sourceUrl,
  };
};

export const openQuickReviewReader = async ({
  item,
  details,
  chapters,
}: OpenQuickReviewReaderOptions): Promise<boolean> => {
  const { scraper, result } = item.primarySource;
  const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, "pages"));
  if (!pagesConfig || !canOpenQuickReviewChapterReader(item, chapters)) {
    throw new Error("Le lecteur par chapitres n'est pas configuré pour cette source.");
  }
  if (!chapters.length) {
    throw new Error("Aucun chapitre n'est disponible pour cette fiche.");
  }

  const api = window.api;
  if (!api || typeof api.fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scraper n'est pas disponible dans cette version.");
  }

  const progressRecords = typeof api.getScraperReaderProgressRecords === "function"
    ? await api.getScraperReaderProgressRecords(scraper.id)
    : [];
  const sourceUrls = Array.from(new Set([
    details.finalUrl,
    details.requestedUrl,
    result.detailsSourceUrl,
    result.detailUrl,
  ].map((value) => String(value ?? "").trim()).filter(Boolean)));
  const selection = selectQuickReviewReaderChapter({
    scraperId: scraper.id,
    sourceUrls,
    chapters,
    progressRecords: Array.isArray(progressRecords) ? progressRecords : [],
  });
  if (!selection) {
    throw new Error("Impossible de déterminer le premier chapitre à lire.");
  }

  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details"));
  const preferredPage = selection.progress?.currentPage ?? 1;
  const pageUrls = await resolveScraperReaderPageUrls(
    scraper,
    details,
    pagesConfig,
    (request) => api.fetchScraperDocument(request),
    {
      chapter: selection.chapter,
      initialPage: preferredPage,
      knownTotalPages: selection.progress?.totalPages,
      thumbnailsNextPageSelector: detailsConfig?.thumbnailsNextPageSelector,
    },
  );
  if (!pageUrls.length) {
    throw new Error("Aucune page n'a été trouvée pour ce chapitre.");
  }

  const initialPage = normalizeReaderPage(selection.progress?.currentPage, pageUrls.length);
  const title = details.title || item.displayTitle || result.title || "Manga";
  const locationState: ReaderLocationState = {
    from: {
      pathname: window.location.pathname,
      search: window.location.search,
    },
    mangaId: selection.mangaId,
    scraperBrowserReturn: {
      scraperId: scraper.id,
      query: result.title || title,
      detailsResult: details,
      chaptersResult: chapters,
      listingReturnState: null,
    },
    scraperReader: {
      id: selection.mangaId,
      scraperId: scraper.id,
      title,
      sourceUrl: selection.sourceUrl,
      cover: selection.chapter.image || details.cover || result.thumbnailUrl,
      language: details.languageCodes?.[0] || scraper.globalConfig.defaultLanguage || null,
      pageUrls,
      chapter: selection.chapter,
      bookmarkExcludedFields: scraper.globalConfig.bookmark.excludedFields,
      ignoreSavedProgress: false,
    },
  };

  return openReaderWorkspaceTarget({
    mangaId: selection.mangaId,
    page: initialPage,
    title,
    locationState,
  });
};
