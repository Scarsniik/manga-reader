const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  fetchScraperDocument: (request) => ipcRenderer.invoke("search-corpus:fetch-document", request),
  romanizeJapaneseTexts: (request) => ipcRenderer.invoke("search-corpus:romanize", request),
  getScraperViewHistory: () => ipcRenderer.invoke("search-corpus:get-view-history"),
  getScraperLatestCheckpoints: (scraperId) => (
    ipcRenderer.invoke("search-corpus:get-latest-checkpoints", scraperId)
  ),
  saveScraperLatestCheckpoint: (request) => (
    ipcRenderer.invoke("search-corpus:save-latest-checkpoint", request)
  ),
  getScraperAuthorFavoriteCache: (favoriteId) => (
    ipcRenderer.invoke("search-corpus:get-author-cache", favoriteId)
  ),
  getSearchRegressionPlan: () => ipcRenderer.invoke("search-corpus:get-plan"),
  completeSearchRegressionRun: (payload) => ipcRenderer.invoke("search-corpus:complete", payload),
});
