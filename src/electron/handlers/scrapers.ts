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
  getScraperReaderProgress,
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
