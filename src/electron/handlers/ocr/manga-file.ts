export {
  createEmptyLanguageDetection,
  createEmptyMangaOcrProfileFile,
  ensureMangaOcrFile,
  readMangaOcrFile,
  showQueueJobCompletionNotification,
  syncMangaOcrProfileSession,
  writeMangaOcrFile,
  writeMangaOcrProfileFile,
} from "./manga-storage";

export {
  ensureMangaFileProgress,
  isStoredPageUpToDate,
  pageEntryToNormalized,
  setMangaOcrPageEntryForFile,
  touchMangaFileProgress,
} from "./manga-progress";

export {
  detectLanguageForManga,
  updateLanguageDetectionFromRecognizedPage,
} from "./manga-language";

export {
  addManualBoxesToMangaPage,
  persistPageResultForManga,
  readStoredPageFromMangaFile,
  removeManualBoxFromMangaPage,
} from "./manga-pages";
