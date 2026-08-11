import { promises as fs } from "fs";
import path from "path";
import type { AppHistoryRecords } from "../history";
import type {
  ScraperBookmarkRecord,
  ScraperReaderProgressRecord,
  ScraperViewHistoryRecord,
} from "../../shared/scraper";
import type {
  ApplicationStatistics,
  UserDataEntryStatistics,
} from "../../shared/statistics";
import { listScraperBookmarks } from "../database/bookmarkRepository";
import { readStoredAppHistory } from "../database/historyRepository";
import { listScraperReaderProgress } from "../database/readerProgressRepository";
import { listScraperViewHistory } from "../database/viewHistoryRepository";
import { listImageFiles } from "./pages";
import {
  authorsFilePath,
  dataDir,
  mangasFilePath,
  savedReadingListsFilePath,
  seriesFilePath,
  tagsFilePath,
} from "../utils";

type StoredManga = {
  id?: unknown;
  title?: unknown;
  path?: unknown;
  currentPage?: unknown;
  pages?: unknown;
  language?: unknown;
};

type FileTreeStatistics = {
  sizeBytes: number;
  fileCount: number;
};

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
};

const toPositiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getReadingStatus = (
  currentPageValue: unknown,
  totalPagesValue: unknown,
): "read" | "inProgress" | "unread" => {
  const currentPage = toPositiveNumber(currentPageValue);
  const totalPages = toPositiveNumber(totalPagesValue);

  if (currentPage !== null && totalPages !== null && currentPage >= totalPages) {
    return "read";
  }

  return currentPage !== null && currentPage > 1 ? "inProgress" : "unread";
};

const getScraperIdentity = (scraperId: unknown, sourceUrl: unknown): string => (
  `${String(scraperId ?? "").trim()}::${String(sourceUrl ?? "").trim()}`
);

const getFileTreeStatistics = async (targetPath: string): Promise<FileTreeStatistics> => {
  try {
    const targetStats = await fs.lstat(targetPath);
    if (targetStats.isSymbolicLink()) {
      return { sizeBytes: 0, fileCount: 0 };
    }

    if (!targetStats.isDirectory()) {
      return {
        sizeBytes: targetStats.size,
        fileCount: 1,
      };
    }

    const entries = await fs.readdir(targetPath);
    const childStatistics = await Promise.all(entries.map((entry) => (
      getFileTreeStatistics(path.join(targetPath, entry))
    )));

    return childStatistics.reduce<FileTreeStatistics>((total, item) => ({
      sizeBytes: total.sizeBytes + item.sizeBytes,
      fileCount: total.fileCount + item.fileCount,
    }), {
      sizeBytes: 0,
      fileCount: 0,
    });
  } catch {
    return { sizeBytes: 0, fileCount: 0 };
  }
};

const getUserDataStatistics = async (): Promise<ApplicationStatistics["userData"]> => {
  let entryNames: string[] = [];
  try {
    entryNames = await fs.readdir(dataDir);
  } catch {
    return {
      totalSizeBytes: 0,
      fileCount: 0,
      entries: [],
    };
  }

  const entries = await Promise.all(entryNames.map(async (name): Promise<UserDataEntryStatistics> => {
    const statistics = await getFileTreeStatistics(path.join(dataDir, name));
    return {
      name,
      ...statistics,
    };
  }));

  entries.sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));

  return {
    totalSizeBytes: entries.reduce((total, entry) => total + entry.sizeBytes, 0),
    fileCount: entries.reduce((total, entry) => total + entry.fileCount, 0),
    entries,
  };
};

const getLibraryStatistics = async (
  mangas: StoredManga[],
): Promise<ApplicationStatistics["library"]> => {
  const mangaPageStatistics = await Promise.all(mangas.map(async (manga) => {
    const folderPath = typeof manga.path === "string" ? manga.path.trim() : "";
    if (!folderPath) {
      return { pageCount: 0, imageSizeBytes: 0, inaccessible: true };
    }

    try {
      const pagePaths = await listImageFiles(folderPath);
      const pageSizes = await Promise.all(pagePaths.map(async (pagePath) => {
        try {
          return (await fs.stat(pagePath)).size;
        } catch {
          return 0;
        }
      }));

      return {
        pageCount: pagePaths.length,
        imageSizeBytes: pageSizes.reduce((total, size) => total + size, 0),
        inaccessible: false,
      };
    } catch {
      return { pageCount: 0, imageSizeBytes: 0, inaccessible: true };
    }
  }));

  let readCount = 0;
  let inProgressCount = 0;
  let unreadCount = 0;
  const languageCounts = new Map<string, number>();

  mangas.forEach((manga, index) => {
    const actualPageCount = mangaPageStatistics[index].pageCount || manga.pages;
    const readingStatus = getReadingStatus(manga.currentPage, actualPageCount);
    if (readingStatus === "read") readCount += 1;
    else if (readingStatus === "inProgress") inProgressCount += 1;
    else unreadCount += 1;

    const languageCode = String(manga.language ?? "").trim().toLowerCase();
    if (languageCode) {
      languageCounts.set(languageCode, (languageCounts.get(languageCode) ?? 0) + 1);
    }
  });

  const pageCount = mangaPageStatistics.reduce((total, manga) => total + manga.pageCount, 0);
  const imageSizeBytes = mangaPageStatistics.reduce((total, manga) => total + manga.imageSizeBytes, 0);
  const largestMangaIndex = mangaPageStatistics.reduce((largestIndex, manga, index, all) => (
    manga.pageCount > (all[largestIndex]?.pageCount ?? 0) ? index : largestIndex
  ), 0);
  const mostCommonLanguageEntry = [...languageCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];

  return {
    mangaCount: mangas.length,
    pageCount,
    imageSizeBytes,
    averagePagesPerManga: mangas.length ? pageCount / mangas.length : 0,
    averagePageSizeBytes: pageCount ? imageSizeBytes / pageCount : 0,
    readCount,
    inProgressCount,
    unreadCount,
    inaccessibleMangaCount: mangaPageStatistics.filter((manga) => manga.inaccessible).length,
    largestManga: mangaPageStatistics[largestMangaIndex]?.pageCount
      ? {
        title: String(mangas[largestMangaIndex]?.title ?? "Sans titre"),
        pageCount: mangaPageStatistics[largestMangaIndex].pageCount,
      }
      : null,
    mostCommonLanguage: mostCommonLanguageEntry
      ? {
        languageCode: mostCommonLanguageEntry[0],
        mangaCount: mostCommonLanguageEntry[1],
      }
      : null,
  };
};

const getScraperStatistics = (
  bookmarks: ScraperBookmarkRecord[],
  viewHistory: ScraperViewHistoryRecord[],
  readerProgress: ScraperReaderProgressRecord[],
  history: AppHistoryRecords,
): ApplicationStatistics["scraper"] => {
  const bookmarkIdentities = new Set(bookmarks.map((bookmark) => (
    getScraperIdentity(bookmark.scraperId, bookmark.sourceUrl)
  )));
  const readIdentities = new Set<string>();

  viewHistory.forEach((record) => {
    if (record.readAt) {
      readIdentities.add(getScraperIdentity(record.scraperId, record.sourceUrl));
    }
  });
  readerProgress.forEach((record) => {
    if (getReadingStatus(record.currentPage, record.totalPages) === "read") {
      readIdentities.add(getScraperIdentity(record.scraperId, record.sourceUrl));
    }
  });
  history.reading.forEach((record) => {
    if (
      record.sourceKind === "scraper"
      && getReadingStatus(record.currentPage, record.totalPages) === "read"
    ) {
      readIdentities.add(getScraperIdentity(record.scraperId, record.sourceUrl));
    }
  });

  const seenOnlyCount = viewHistory.filter((record) => {
    const identity = getScraperIdentity(record.scraperId, record.sourceUrl);
    return !record.readAt && !bookmarkIdentities.has(identity) && !readIdentities.has(identity);
  }).length;
  const bookmarkPageCounts = bookmarks
    .map((bookmark) => toPositiveNumber(bookmark.pageCount))
    .filter((pageCount): pageCount is number => pageCount !== null);
  const encounteredSourceIds = new Set([
    ...bookmarks.map((record) => record.scraperId),
    ...viewHistory.map((record) => record.scraperId),
    ...readerProgress.map((record) => record.scraperId),
  ].filter(Boolean));

  return {
    bookmarkCount: bookmarks.length,
    seenCount: viewHistory.length,
    readCount: readIdentities.size,
    seenOnlyCount,
    encounteredSourceCount: encounteredSourceIds.size,
    averageBookmarkPages: bookmarkPageCounts.length
      ? bookmarkPageCounts.reduce((total, pageCount) => total + pageCount, 0) / bookmarkPageCounts.length
      : 0,
  };
};

export async function getApplicationStatistics(): Promise<ApplicationStatistics> {
  const [
    rawMangas,
    bookmarks,
    viewHistory,
    readerProgress,
    history,
    rawAuthors,
    rawTags,
    rawSeries,
    rawReadingLists,
    userData,
  ] = await Promise.all([
    readJsonFile<StoredManga[]>(mangasFilePath, []),
    Promise.resolve(listScraperBookmarks()),
    Promise.resolve(listScraperViewHistory()),
    Promise.resolve(listScraperReaderProgress()),
    Promise.resolve(readStoredAppHistory()),
    readJsonFile<unknown[]>(authorsFilePath, []),
    readJsonFile<unknown[]>(tagsFilePath, []),
    readJsonFile<unknown[]>(seriesFilePath, []),
    readJsonFile<unknown[]>(savedReadingListsFilePath, []),
    getUserDataStatistics(),
  ]);

  const mangas = Array.isArray(rawMangas) ? rawMangas : [];
  return {
    generatedAt: new Date().toISOString(),
    library: await getLibraryStatistics(mangas),
    scraper: getScraperStatistics(bookmarks, viewHistory, readerProgress, history),
    collection: {
      authorCount: Array.isArray(rawAuthors) ? rawAuthors.length : 0,
      tagCount: Array.isArray(rawTags) ? rawTags.length : 0,
      seriesCount: Array.isArray(rawSeries) ? rawSeries.length : 0,
      savedReadingListCount: Array.isArray(rawReadingLists) ? rawReadingLists.length : 0,
      readingHistoryCount: history.reading.length,
      detailsHistoryCount: history.details.length,
      searchHistoryCount: history.searches.length,
    },
    userData,
  };
}
