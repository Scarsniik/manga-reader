import type { AppHistoryRecords, ReadingHistoryRecord } from "@/shared/history";
import type {
  ScraperBookmarkRecord,
  ScraperReaderProgressRecord,
  ScraperRecord,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type { Manga } from "@/renderer/types";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import type { MatchableManga } from "@/renderer/utils/mangaMatching/titleProfiles";
import { extractTentativeAuthorNamesFromTitle } from "@/renderer/utils/mangaMatching/tentativeAuthors";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialMatchTarget,
  ScraperPotentialReadingStatus,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

type ProgressIndex = {
  recordsById: Map<string, ScraperReaderProgressRecord>;
  recordsBySourceKey: Map<string, ScraperReaderProgressRecord[]>;
};

export const EMPTY_HISTORY_RECORDS: AppHistoryRecords = {
  reading: [],
  details: [],
  searches: [],
};

export const normalizePotentialMatchText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizePotentialMatchText(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const getReadingStatus = (
  currentPageValue: unknown,
  totalPagesValue: unknown,
): ScraperPotentialReadingStatus | null => {
  const currentPage = toPositiveInteger(currentPageValue);
  const totalPages = toPositiveInteger(totalPagesValue);

  if (currentPage === null) {
    return null;
  }

  if (totalPages !== null && currentPage >= totalPages) {
    return "read";
  }

  return currentPage > 1 ? "inProgress" : null;
};

const buildSourceKey = (
  scraperId?: string | null,
  sourceUrl?: string | null,
): string => {
  const normalizedScraperId = normalizePotentialMatchText(scraperId);
  const normalizedSourceUrl = normalizeScraperViewHistorySourceUrl(sourceUrl);

  return normalizedScraperId && normalizedSourceUrl
    ? `${normalizedScraperId}::${normalizedSourceUrl}`
    : "";
};

const buildProgressIndex = (records: ScraperReaderProgressRecord[]): ProgressIndex => {
  const recordsById = new Map<string, ScraperReaderProgressRecord>();
  const recordsBySourceKey = new Map<string, ScraperReaderProgressRecord[]>();

  records.forEach((record) => {
    recordsById.set(record.id, record);

    const sourceKey = buildSourceKey(record.scraperId, record.sourceUrl);
    if (!sourceKey) {
      return;
    }

    const sourceRecords = recordsBySourceKey.get(sourceKey) ?? [];
    sourceRecords.push(record);
    recordsBySourceKey.set(sourceKey, sourceRecords);
  });

  return {
    recordsById,
    recordsBySourceKey,
  };
};

const getLatestProgressRecord = (
  records: ScraperReaderProgressRecord[],
): ScraperReaderProgressRecord | null => (
  records
    .filter((record) => getReadingStatus(record.currentPage, record.totalPages) !== null)
    .sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))[0]
  ?? null
);

const getScraperName = (
  scraperId: string | null | undefined,
  scrapersById: Map<string, ScraperRecord>,
): string => (
  scraperId ? scrapersById.get(scraperId)?.name || `Scrapper ${scraperId}` : "Scrapper inconnu"
);

const getAuthorNames = (title: string, values: string[] = []): string[] => (
  uniqueValues([
    ...extractTentativeAuthorNamesFromTitle(title),
    ...values,
  ])
);

export const buildCurrentMatchable = (
  detailsResult: ScraperRuntimeDetailsResult | null,
): MatchableManga | null => {
  const sourceUrl = detailsResult?.finalUrl || detailsResult?.requestedUrl || "";
  const title = normalizePotentialMatchText(detailsResult?.title || sourceUrl);
  if (!title) {
    return null;
  }

  return {
    title,
    sourceUrl,
    authorNames: getAuthorNames(title, detailsResult?.authors ?? []),
  };
};

const buildLibraryTarget = (title: string): ScraperPotentialMatchTarget => ({
  kind: "library",
  title,
});

const buildScraperDetailsTarget = (
  scraperId: string,
  sourceUrl: string,
  title: string,
): ScraperPotentialMatchTarget => ({
  kind: "scraperDetails",
  scraperId,
  sourceUrl,
  title,
});

const buildLibraryCandidate = (manga: Manga): ScraperPotentialMangaMatch | null => {
  const status = getReadingStatus(manga.currentPage, manga.pages);
  if (!status) {
    return null;
  }

  const title = normalizePotentialMatchText(manga.title);
  if (!title) {
    return null;
  }

  return {
    id: `library:${manga.id}`,
    category: "reading",
    title,
    sourceUrl: manga.sourceUrl,
    authorNames: getAuthorNames(title),
    sourceLabel: "Bibliotheque",
    detailLabel: status === "read" ? "Lu en local" : "En cours en local",
    updatedAt: manga.createdAt,
    readingStatus: status,
    target: buildLibraryTarget(title),
  };
};

const buildProgressCandidate = (
  record: ScraperReaderProgressRecord,
  scrapersById: Map<string, ScraperRecord>,
): ScraperPotentialMangaMatch | null => {
  const status = getReadingStatus(record.currentPage, record.totalPages);
  const sourceUrl = normalizeScraperViewHistorySourceUrl(record.sourceUrl);
  const title = normalizePotentialMatchText(record.title || sourceUrl);
  if (!status || !record.scraperId || !sourceUrl || !title) {
    return null;
  }

  return {
    id: `progress:${record.id}`,
    category: "reading",
    title,
    sourceUrl,
    authorNames: getAuthorNames(title),
    sourceLabel: getScraperName(record.scraperId, scrapersById),
    detailLabel: status === "read" ? "Lu" : "En cours",
    updatedAt: record.updatedAt,
    readingStatus: status,
    target: buildScraperDetailsTarget(record.scraperId, sourceUrl, title),
  };
};

const resolveReadingRecordProgress = (
  record: ReadingHistoryRecord,
  progressIndex: ProgressIndex,
): ScraperReaderProgressRecord | null => {
  if (record.sourceKind !== "scraper") {
    return null;
  }

  if (record.readerProgressId) {
    const directRecord = progressIndex.recordsById.get(record.readerProgressId) ?? null;
    if (directRecord) {
      return directRecord;
    }
  }

  return getLatestProgressRecord(
    progressIndex.recordsBySourceKey.get(buildSourceKey(record.scraperId, record.sourceUrl)) ?? [],
  );
};

const buildReadingHistoryCandidate = (
  record: ReadingHistoryRecord,
  mangaById: Map<string, Manga>,
  progressIndex: ProgressIndex,
  scrapersById: Map<string, ScraperRecord>,
): ScraperPotentialMangaMatch | null => {
  if (record.sourceKind === "library") {
    const manga = record.mangaId ? mangaById.get(record.mangaId) ?? null : null;
    const status = getReadingStatus(
      manga?.currentPage ?? record.currentPage,
      manga?.pages ?? record.totalPages,
    );
    const title = normalizePotentialMatchText(manga?.title || record.title);
    if (!status || !title) {
      return null;
    }

    return {
      id: `history:${record.id}`,
      category: "reading",
      title,
      sourceUrl: manga?.sourceUrl,
      authorNames: getAuthorNames(title),
      sourceLabel: "Bibliotheque",
      detailLabel: status === "read" ? "Lu en local" : "En cours en local",
      updatedAt: record.updatedAt,
      readingStatus: status,
      target: buildLibraryTarget(title),
    };
  }

  const progressRecord = resolveReadingRecordProgress(record, progressIndex);
  const status = getReadingStatus(
    progressRecord?.currentPage ?? record.currentPage,
    progressRecord?.totalPages ?? record.totalPages,
  );
  const scraperId = normalizePotentialMatchText(record.scraperId);
  const sourceUrl = normalizeScraperViewHistorySourceUrl(record.sourceUrl);
  const title = normalizePotentialMatchText(progressRecord?.title || record.title || sourceUrl);
  if (!status || !scraperId || !sourceUrl || !title) {
    return null;
  }

  return {
    id: `history:${record.id}`,
    category: "reading",
    title,
    sourceUrl,
    authorNames: getAuthorNames(title),
    sourceLabel: getScraperName(scraperId, scrapersById),
    detailLabel: status === "read" ? "Lu" : "En cours",
    updatedAt: progressRecord?.updatedAt || record.updatedAt,
    readingStatus: status,
    target: buildScraperDetailsTarget(scraperId, sourceUrl, title),
  };
};

const buildViewHistoryReadCandidate = (
  record: ScraperViewHistoryRecord,
  titleBySourceKey: Map<string, string>,
  scrapersById: Map<string, ScraperRecord>,
): ScraperPotentialMangaMatch | null => {
  const sourceUrl = normalizeScraperViewHistorySourceUrl(record.sourceUrl);
  if (!record.readAt || !record.scraperId || !sourceUrl) {
    return null;
  }

  const title = normalizePotentialMatchText(titleBySourceKey.get(buildSourceKey(record.scraperId, sourceUrl)) || sourceUrl);
  if (!title) {
    return null;
  }

  return {
    id: `view-history:${record.id}`,
    category: "reading",
    title,
    sourceUrl,
    authorNames: getAuthorNames(title),
    sourceLabel: getScraperName(record.scraperId, scrapersById),
    detailLabel: "Marque lu",
    updatedAt: record.readAt,
    readingStatus: "read",
    target: buildScraperDetailsTarget(record.scraperId, sourceUrl, title),
  };
};

export const buildBookmarkCandidate = (
  bookmark: ScraperBookmarkRecord,
  scrapersById: Map<string, ScraperRecord>,
): ScraperPotentialMangaMatch | null => {
  const sourceUrl = normalizeScraperViewHistorySourceUrl(bookmark.sourceUrl);
  const title = normalizePotentialMatchText(bookmark.title || sourceUrl);
  if (!bookmark.scraperId || !sourceUrl || !title) {
    return null;
  }

  return {
    id: `bookmark:${bookmark.scraperId}:${sourceUrl}`,
    category: "bookmark",
    title,
    sourceUrl,
    authorNames: getAuthorNames(title, bookmark.authors ?? []),
    sourceLabel: getScraperName(bookmark.scraperId, scrapersById),
    detailLabel: "Bookmark",
    updatedAt: bookmark.updatedAt || bookmark.createdAt,
    target: buildScraperDetailsTarget(bookmark.scraperId, sourceUrl, title),
  };
};

const buildTitleLookup = (
  historyRecords: AppHistoryRecords,
  progressRecords: ScraperReaderProgressRecord[],
  bookmarks: ScraperBookmarkRecord[],
): Map<string, string> => {
  const titleBySourceKey = new Map<string, string>();

  const setTitle = (scraperId?: string | null, sourceUrl?: string | null, title?: string | null) => {
    const key = buildSourceKey(scraperId, sourceUrl);
    const normalizedTitle = normalizePotentialMatchText(title);
    if (key && normalizedTitle && !titleBySourceKey.has(key)) {
      titleBySourceKey.set(key, normalizedTitle);
    }
  };

  bookmarks.forEach((bookmark) => setTitle(bookmark.scraperId, bookmark.sourceUrl, bookmark.title));
  progressRecords.forEach((record) => setTitle(record.scraperId, record.sourceUrl, record.title));
  historyRecords.reading.forEach((record) => setTitle(record.scraperId, record.sourceUrl, record.title));

  return titleBySourceKey;
};

export const buildReadingCandidates = ({
  historyRecords,
  libraryMangas,
  progressRecords,
  viewHistoryRecords,
  bookmarks,
  scrapersById,
}: {
  historyRecords: AppHistoryRecords;
  libraryMangas: Manga[];
  progressRecords: ScraperReaderProgressRecord[];
  viewHistoryRecords: ScraperViewHistoryRecord[];
  bookmarks: ScraperBookmarkRecord[];
  scrapersById: Map<string, ScraperRecord>;
}): ScraperPotentialMangaMatch[] => {
  const mangaById = new Map(libraryMangas.map((manga) => [manga.id, manga]));
  const progressIndex = buildProgressIndex(progressRecords);
  const titleBySourceKey = buildTitleLookup(historyRecords, progressRecords, bookmarks);

  return [
    ...libraryMangas.map(buildLibraryCandidate),
    ...progressRecords.map((record) => buildProgressCandidate(record, scrapersById)),
    ...historyRecords.reading.map((record) => (
      buildReadingHistoryCandidate(record, mangaById, progressIndex, scrapersById)
    )),
    ...viewHistoryRecords.map((record) => buildViewHistoryReadCandidate(record, titleBySourceKey, scrapersById)),
  ].filter((candidate): candidate is ScraperPotentialMangaMatch => Boolean(candidate));
};
