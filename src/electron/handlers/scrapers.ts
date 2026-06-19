export {
  fetchScraperDocument,
  validateScraperAccess,
} from "./scrapers/documents";
export {
  cancelAllScraperDownloadJobs,
  cancelScraperDownloadJob,
  getScraperDownloadQueueStatus,
  queueScraperDownload,
} from "./scrapers/downloads";
export {
  getScraperBookmarks,
  removeScraperBookmark,
  saveScraperBookmark,
} from "./scrapers/bookmarks";
export {
  getScraperBookmarkView,
} from "./scrapers/bookmarkView";
export {
  getScraperAuthorFavorites,
  removeScraperAuthorFavorite,
  removeScraperAuthorFavoriteSource,
  saveScraperAuthorFavorite,
} from "./scrapers/authorFavorites";
export {
  getScraperTagFavorites,
  removeScraperTagFavorite,
  removeScraperTagFavoriteSource,
  saveScraperTagFavorite,
} from "./scrapers/tagFavorites";
export {
  addScraperTagListCacheItems,
  getScraperTagListCache,
  saveScraperTagListCache,
} from "./scrapers/tagListCache";
export {
  getScraperAuthorFavoriteCache,
  removeScraperAuthorFavoriteCache,
  saveScraperAuthorFavoriteCache,
} from "./scrapers/authorFavoriteCache";
export {
  getScraperReaderProgress,
  getScraperReaderProgressRecords,
  saveScraperReaderProgress,
} from "./scrapers/readerProgress";
export {
  getScraperViewHistory,
  recordScraperCardsSeen,
  recordScraperCardsSeenCompact,
  setScraperCardRead,
} from "./scrapers/viewHistory";
export {
  getScraperLatestCheckpoints,
  saveScraperLatestCheckpoint,
} from "./scrapers/latestCheckpoints";
export {
  deleteScraper,
  getScrapers,
  saveScraperDraft,
  saveScraperFeatureConfig,
  saveScraperGlobalConfig,
} from "./scrapers/records";
