import { preserveEditedOcrText } from "./edited-box-overrides";
import type { MangaOcrFile, MangaOcrPageEntry } from "./types";

type OrderedOcrPage = {
  pageKey: string;
  imagePath: string;
};

type OcrPageSourceFingerprint = {
  imagePath: string;
  size: number;
  mtimeMs: number;
};

type StoredOcrPageMatch = {
  pageKey: string;
  entry: MangaOcrPageEntry;
};

const normalizeImagePathForMatching = (imagePath: string): string => (
  String(imagePath || "")
    .replace(/[\\/]+/gu, "/")
    .replace(/\/$/u, "")
    .toLocaleLowerCase("en-US")
);

const getImageFileName = (imagePath: string): string => (
  String(imagePath || "").split(/[\\/]/u).pop() || String(imagePath || "")
);

export const prepareOcrPagesForOverwrite = (
  pages?: Record<string, MangaOcrPageEntry> | null,
  orderedPages: OrderedOcrPage[] = [],
): Record<string, MangaOcrPageEntry> => {
  const pagesByImagePath = new Map<string, MangaOcrPageEntry[]>();
  for (const page of Object.values(pages || {})) {
    const normalizedImagePath = normalizeImagePathForMatching(page.imagePath);
    const entries = pagesByImagePath.get(normalizedImagePath) || [];
    entries.push(page);
    pagesByImagePath.set(normalizedImagePath, entries);
  }

  const preparedPages: Record<string, MangaOcrPageEntry> = {};
  orderedPages.forEach(({ pageKey, imagePath }, pageIndex) => {
    const matchingPages = pagesByImagePath.get(normalizeImagePathForMatching(imagePath));
    const previousPage = matchingPages?.shift();
    if (!previousPage) {
      return;
    }

    preparedPages[pageKey] = {
      ...previousPage,
      pageIndex,
      pageNumber: pageIndex + 1,
      fileName: getImageFileName(imagePath),
      imagePath,
    };
  });

  return preparedPages;
};

export const doesOcrPageEntryMatchSource = (
  entry: MangaOcrPageEntry | null | undefined,
  source: OcrPageSourceFingerprint | null | undefined,
): boolean => (
  !!entry
  && !!source
  && normalizeImagePathForMatching(entry.imagePath) === normalizeImagePathForMatching(source.imagePath)
  && Number.isFinite(Number(entry.sourceSize))
  && Number.isFinite(Number(entry.sourceMtimeMs))
  && Number.isFinite(Number(source.size))
  && Number.isFinite(Number(source.mtimeMs))
  && Number(entry.sourceSize) === Number(source.size)
  && Number(entry.sourceMtimeMs) === Number(source.mtimeMs)
);

export function findOcrPageEntryBySource(
  pages: Record<string, MangaOcrPageEntry> | null | undefined,
  preferredPageKey: string,
  source: OcrPageSourceFingerprint,
): StoredOcrPageMatch | null {
  const preferredEntry = pages?.[preferredPageKey];
  if (preferredEntry && doesOcrPageEntryMatchSource(preferredEntry, source)) {
    return { pageKey: preferredPageKey, entry: preferredEntry };
  }

  for (const [pageKey, entry] of Object.entries(pages || {})) {
    if (pageKey !== preferredPageKey && doesOcrPageEntryMatchSource(entry, source)) {
      return { pageKey, entry };
    }
  }

  return null;
}

export function rekeyMangaOcrPagesForMutation(
  file: MangaOcrFile,
  orderedPages: OrderedOcrPage[],
): void {
  file.pages = prepareOcrPagesForOverwrite(file.pages, orderedPages);
  const storedPages = Object.values(file.pages);
  const processedPages = storedPages.filter((page) => page.status === "done" || page.status === "error");
  const highestProcessedPage = processedPages.reduce(
    (highest, page) => Math.max(highest, Number(page.pageNumber || 0)),
    0,
  );
  file.progress = {
    ...file.progress,
    totalPages: orderedPages.length,
    completedPages: storedPages.filter((page) => page.status === "done").length,
    failedPages: storedPages.filter((page) => page.status === "error").length,
    lastProcessedPage: highestProcessedPage > 0 ? highestProcessedPage : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export const getOcrPageErrorFallback = (
  entry: MangaOcrPageEntry | null | undefined,
  source: OcrPageSourceFingerprint | null | undefined,
): Pick<MangaOcrPageEntry, "width" | "height" | "boxes" | "blocks" | "manualBoxes"> => {
  if (!doesOcrPageEntryMatchSource(entry, source)) {
    return {
      width: undefined,
      height: undefined,
      boxes: [],
      blocks: [],
      manualBoxes: [],
    };
  }

  return {
    width: entry?.width,
    height: entry?.height,
    boxes: Array.isArray(entry?.boxes) ? entry.boxes : [],
    blocks: Array.isArray(entry?.blocks) ? entry.blocks : [],
    manualBoxes: Array.isArray(entry?.manualBoxes) ? entry.manualBoxes : [],
  };
};

export function rebaseUserOwnedOcrPageFields(
  pages: Record<string, MangaOcrPageEntry>,
  latestPages?: Record<string, MangaOcrPageEntry> | null,
): Record<string, MangaOcrPageEntry> {
  const latestPagesByImagePath = new Map<string, MangaOcrPageEntry[]>();
  for (const latestPage of Object.values(latestPages || {})) {
    const normalizedImagePath = normalizeImagePathForMatching(latestPage.imagePath);
    const entries = latestPagesByImagePath.get(normalizedImagePath) || [];
    entries.push(latestPage);
    latestPagesByImagePath.set(normalizedImagePath, entries);
  }

  return Object.fromEntries(Object.entries(pages).map(([pageKey, page]) => {
    const source = {
      imagePath: page.imagePath,
      size: Number(page.sourceSize),
      mtimeMs: Number(page.sourceMtimeMs),
    };
    const latestPage = latestPagesByImagePath
      .get(normalizeImagePathForMatching(page.imagePath))
      ?.find((candidate) => doesOcrPageEntryMatchSource(candidate, source));
    if (!latestPage) {
      return [pageKey, page];
    }

    const preservedResult = preserveEditedOcrText(
      Array.isArray(page.boxes) ? page.boxes : [],
      Array.isArray(page.blocks) ? page.blocks : [],
      latestPage.boxes,
      { retainUnmatched: true },
    );

    return [pageKey, {
      ...page,
      boxes: preservedResult.boxes,
      blocks: preservedResult.blocks,
      manualBoxes: Array.isArray(latestPage.manualBoxes)
        ? latestPage.manualBoxes.map((box) => ({ ...box }))
        : [],
    }];
  }));
}
