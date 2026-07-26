export type UserDataEntryStatistics = {
  name: string;
  sizeBytes: number;
  fileCount: number;
};

export type ApplicationStatistics = {
  generatedAt: string;
  library: {
    mangaCount: number;
    pageCount: number;
    imageSizeBytes: number;
    averagePagesPerManga: number;
    averagePageSizeBytes: number;
    readCount: number;
    inProgressCount: number;
    unreadCount: number;
    inaccessibleMangaCount: number;
    largestManga: {
      title: string;
      pageCount: number;
    } | null;
    mostCommonLanguage: {
      languageCode: string;
      mangaCount: number;
    } | null;
  };
  scraper: {
    bookmarkCount: number;
    seenCount: number;
    readCount: number;
    seenOnlyCount: number;
    encounteredSourceCount: number;
    averageBookmarkPages: number;
  };
  collection: {
    authorCount: number;
    tagCount: number;
    seriesCount: number;
    savedReadingListCount: number;
    readingHistoryCount: number;
    detailsHistoryCount: number;
    searchHistoryCount: number;
  };
  userData: {
    totalSizeBytes: number;
    fileCount: number;
    entries: UserDataEntryStatistics[];
  };
};
