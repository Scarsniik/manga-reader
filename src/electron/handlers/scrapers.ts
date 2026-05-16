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
  setScraperCardRead,
} from "./scrapers/viewHistory";
export {
  deleteScraper,
  getScrapers,
  saveScraperDraft,
  saveScraperFeatureConfig,
  saveScraperGlobalConfig,
} from "./scrapers/records";
