import { ipcMain, IpcMainInvokeEvent, app, shell } from "electron";
import { dialog, BrowserWindow } from "electron";
import { stat } from "fs/promises";

// Themed handlers
import * as mangas from "./handlers/mangas";
import * as params from "./handlers/params";
import * as links from "./handlers/links";
import * as pages from "./handlers/pages";
import * as clipboardHandlers from "./handlers/clipboard";
import * as ocr from "./handlers/ocr/index";
import * as ocrRuntime from "./handlers/ocrRuntime/index";
import * as authors from "./handlers/authors";
import * as tags from "./handlers/tags";
import * as series from "./handlers/series";
import * as scrapers from "./handlers/scrapers";
import * as windowControls from "./handlers/windowControls";
import * as workspaceWindow from "./handlers/workspaceWindow";
import * as selectorAssistantWindow from "./handlers/selectorAssistantWindow";
import * as appUpdate from "./handlers/appUpdate";
import * as jsonDocuments from "./handlers/jsonDocuments";
import * as history from "./handlers/history";
import * as japaneseRomanization from "./handlers/japaneseRomanization";
import * as japaneseInflection from "./handlers/japaneseInflection";
import { dataDir, ensureDataDir, migrateExistingFiles } from "./utils";

// Run migration at module load
migrateExistingFiles().catch(() => { /* swallow */ });

const notifyScrapersUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scrapers-updated");
    }
};

const notifyScraperBookmarksUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scraper-bookmarks-updated");
    }
};

const notifyScraperAuthorFavoritesUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scraper-author-favorites-updated");
    }
};

const notifyScraperTagFavoritesUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scraper-tag-favorites-updated");
    }
};

const notifyScraperTagListCacheUpdated = (scraperId: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scraper-tag-list-cache-updated", scraperId);
    }
};

const notifyScraperViewHistoryUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scraper-view-history-updated");
    }
};

const notifySeriesUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("series-updated");
    }
};

const notifyMangasUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("mangas-updated");
    }
};

const notifyHistoryUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("history-updated");
    }
};

// Links
ipcMain.handle("get-links", async () => links.getLinks());
ipcMain.handle("add-link", async (event: IpcMainInvokeEvent, link: { url: string; title: string; description?: string }) => links.addLink(event, link));
ipcMain.handle("remove-link", async (event: IpcMainInvokeEvent, url: string) => links.removeLink(event, url));
ipcMain.handle("open-external-url", async (event: IpcMainInvokeEvent, url: string) => links.openExternalUrl(event, url));
ipcMain.handle("open-json-document", async (_event: IpcMainInvokeEvent, request: any) => (
    jsonDocuments.openJsonDocument(request)
));

// Window controls
ipcMain.handle("window-get-state", async (event: IpcMainInvokeEvent) => windowControls.getWindowState(event));
ipcMain.handle("window-minimize", async (event: IpcMainInvokeEvent) => windowControls.minimizeWindow(event));
ipcMain.handle("window-toggle-maximize", async (event: IpcMainInvokeEvent) => windowControls.toggleMaximizeWindow(event));
ipcMain.handle("window-close", async (event: IpcMainInvokeEvent) => windowControls.closeWindow(event));
ipcMain.handle("window-toggle-devtools", async (event: IpcMainInvokeEvent) => windowControls.toggleDevTools(event));
ipcMain.handle("app-runtime-info", async () => windowControls.getAppRuntimeInfo());
ipcMain.handle("workspace-open-target", async (
    event: IpcMainInvokeEvent,
    target: unknown,
    options?: unknown,
) => (
    workspaceWindow.openWorkspaceTarget(event, target, options)
));
ipcMain.handle("selector-assistant-open", async (event: IpcMainInvokeEvent, request: unknown) => (
    selectorAssistantWindow.openSelectorAssistant(event, request)
));
ipcMain.handle("selector-assistant-close", async (event: IpcMainInvokeEvent, formSessionId: unknown) => (
    selectorAssistantWindow.closeSelectorAssistant(event, formSessionId)
));
ipcMain.handle("selector-assistant-get-session", async (event: IpcMainInvokeEvent) => (
    selectorAssistantWindow.getSelectorAssistantSession(event)
));
ipcMain.handle("selector-assistant-set-bounds", async (event: IpcMainInvokeEvent, bounds: unknown) => (
    selectorAssistantWindow.setSelectorAssistantBounds(event, bounds)
));
ipcMain.handle("selector-assistant-set-mode", async (event: IpcMainInvokeEvent, mode: unknown) => (
    selectorAssistantWindow.setSelectorAssistantMode(event, mode)
));
ipcMain.handle("selector-assistant-navigation-response", async (event: IpcMainInvokeEvent, response: unknown) => (
    selectorAssistantWindow.resolveSelectorAssistantNavigation(event, response)
));
ipcMain.handle("selector-assistant-navigation-state", async (event: IpcMainInvokeEvent) => (
    selectorAssistantWindow.getSelectorAssistantNavigationState(event)
));
ipcMain.handle("selector-assistant-navigate", async (event: IpcMainInvokeEvent, command: unknown) => (
    selectorAssistantWindow.navigateSelectorAssistant(event, command)
));
ipcMain.handle("selector-assistant-page-command", async (
    event: IpcMainInvokeEvent,
    mode: unknown,
    command: unknown,
) => selectorAssistantWindow.sendSelectorAssistantPageCommand(event, mode, command));
ipcMain.handle("selector-assistant-evaluate", async (event: IpcMainInvokeEvent, request: unknown) => (
    selectorAssistantWindow.evaluateSelectorAssistant(event, request)
));
ipcMain.handle("selector-assistant-apply", async (event: IpcMainInvokeEvent, value: unknown) => (
    selectorAssistantWindow.applySelectorAssistantValue(event, value)
));
ipcMain.on("selector-assistant-page-event", (event, value: unknown) => {
    selectorAssistantWindow.forwardSelectorAssistantPageEvent(event, value);
});

// History
ipcMain.handle("get-history-records", async () => history.getHistoryRecords());
ipcMain.handle("record-reading-history", async (event: IpcMainInvokeEvent, request: unknown) => {
    const record = await history.recordReadingHistory(event, request as any);
    notifyHistoryUpdated();
    return record;
});
ipcMain.handle("record-details-history", async (event: IpcMainInvokeEvent, request: unknown) => {
    const record = await history.recordDetailsHistory(event, request as any);
    notifyHistoryUpdated();
    return record;
});
ipcMain.handle("record-search-history", async (event: IpcMainInvokeEvent, request: unknown) => {
    const record = await history.recordSearchHistory(event, request as any);
    notifyHistoryUpdated();
    return record;
});
ipcMain.handle("remove-reading-history-record", async (event: IpcMainInvokeEvent, historyId: string) => {
    const records = await history.removeReadingHistoryRecord(event, historyId);
    notifyHistoryUpdated();
    return records;
});
ipcMain.handle("remove-details-history-record", async (event: IpcMainInvokeEvent, historyId: string) => {
    const records = await history.removeDetailsHistoryRecord(event, historyId);
    notifyHistoryUpdated();
    return records;
});
ipcMain.handle("remove-search-history-record", async (event: IpcMainInvokeEvent, historyId: string) => {
    const records = await history.removeSearchHistoryRecord(event, historyId);
    notifyHistoryUpdated();
    return records;
});

// Mangas
ipcMain.handle("get-mangas", async () => mangas.getMangas());
ipcMain.handle("add-manga", async (event: IpcMainInvokeEvent, manga: any) => {
    const updated = await mangas.addManga(event, manga);
    const insertedManga = Array.isArray(updated)
        ? updated.find((item: any) => String(item.id) === String(manga?.id)) || manga
        : manga;
    const hydratedMangas = await mangas.getMangas();
    notifyMangasUpdated();

    // Let the import finish and the library refresh first, then queue OCR in the background.
    setTimeout(() => {
        void (async () => {
            try {
                const queueResult = await ocr.ocrQueueImportManga(insertedManga);
                if (queueResult?.queued) {
                    notifyMangasUpdated();
                }
            } catch (error) {
                console.warn("Failed to auto-queue OCR after manga import", error);
            }
        })();
    }, 0);

    return hydratedMangas;
});
ipcMain.handle("remove-manga", async (event: IpcMainInvokeEvent, mangaId: string) => {
    const updated = await mangas.removeManga(event, mangaId);
    notifyMangasUpdated();
    return updated;
});
ipcMain.handle("update-manga", async (event: IpcMainInvokeEvent, updatedManga: any) => {
    const updated = await mangas.updateManga(event, updatedManga);
    notifyMangasUpdated();
    return updated;
});
ipcMain.handle("batch-update-tags", async (event: IpcMainInvokeEvent, payload: any) => {
    const result = await mangas.batchUpdateTags(event, payload);
    if (result?.success) {
        notifyMangasUpdated();
    }
    return result;
});

// Authors
ipcMain.handle("get-authors", async () => authors.getAuthors());
ipcMain.handle("add-author", async (event: IpcMainInvokeEvent, author: any) => authors.addAuthor(event, author));
ipcMain.handle("remove-author", async (event: IpcMainInvokeEvent, authorId: string) => authors.removeAuthor(event, authorId));
ipcMain.handle("update-author", async (event: IpcMainInvokeEvent, updatedAuthor: any) => authors.updateAuthor(event, updatedAuthor));

// Tags
ipcMain.handle("get-tags", async () => tags.getTags());
ipcMain.handle("add-tag", async (event: IpcMainInvokeEvent, tag: any) => tags.addTag(event, tag));
ipcMain.handle("remove-tag", async (event: IpcMainInvokeEvent, tagId: string) => tags.removeTag(event, tagId));
ipcMain.handle("update-tag", async (event: IpcMainInvokeEvent, updatedTag: any) => tags.updateTag(event, updatedTag));

// Series
ipcMain.handle("get-series", async () => series.getSeries());
ipcMain.handle("add-series", async (event: IpcMainInvokeEvent, seriesItem: any) => {
    const updated = await series.addSeries(event, seriesItem);
    notifySeriesUpdated();
    return updated;
});
ipcMain.handle("remove-series", async (event: IpcMainInvokeEvent, seriesId: string) => {
    const updated = await series.removeSeries(event, seriesId);
    notifySeriesUpdated();
    return updated;
});
ipcMain.handle("update-series", async (event: IpcMainInvokeEvent, updatedSeries: any) => {
    const updated = await series.updateSeries(event, updatedSeries);
    notifySeriesUpdated();
    return updated;
});

// Settings
ipcMain.handle("get-settings", async () => params.getSettings());
ipcMain.handle("save-settings", async (event: IpcMainInvokeEvent, settings: any) => params.saveSettings(event, settings));
ipcMain.handle("app-update-status", async () => appUpdate.getAppUpdateStatus());
ipcMain.handle("app-update-check", async () => appUpdate.checkForAppUpdates());
ipcMain.handle("app-update-download", async () => appUpdate.downloadAppUpdate());
ipcMain.handle("app-update-install", async () => appUpdate.installAppUpdate());
ipcMain.handle("app-update-open-release-page", async () => appUpdate.openAppUpdateReleasePage());
ipcMain.handle("app-update-get-patch-notes", async (_event: IpcMainInvokeEvent, query?: unknown) => (
    appUpdate.getAppUpdatePatchNotes(query as Parameters<typeof appUpdate.getAppUpdatePatchNotes>[0])
));

// Japanese romanization
ipcMain.handle("romanize-japanese-texts", async (_event: IpcMainInvokeEvent, request: unknown) => (
    japaneseRomanization.romanizeJapaneseTexts(request as any)
));
ipcMain.handle("analyze-japanese-inflections", async (_event: IpcMainInvokeEvent, request: unknown) => (
    japaneseInflection.analyzeJapaneseInflections(request as any)
));

// Scrapers
ipcMain.handle("validate-scraper-access", async (event: IpcMainInvokeEvent, request: any) => scrapers.validateScraperAccess(event, request));
ipcMain.handle("get-scrapers", async () => scrapers.getScrapers());
ipcMain.handle("get-scraper-bookmarks", async (event: IpcMainInvokeEvent, scraperId?: string | null) => (
    scrapers.getScraperBookmarks(event, scraperId)
));
ipcMain.handle("get-scraper-bookmark-view", async (event: IpcMainInvokeEvent, request: any) => (
    scrapers.getScraperBookmarkView(event, request)
));
ipcMain.handle("save-scraper-bookmark", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperBookmark(event, request);
    notifyScraperBookmarksUpdated();
    return updated;
});
ipcMain.handle("remove-scraper-bookmark", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.removeScraperBookmark(event, request);
    notifyScraperBookmarksUpdated();
    return updated;
});
ipcMain.handle("get-scraper-author-favorites", async (event: IpcMainInvokeEvent) => (
    scrapers.getScraperAuthorFavorites(event)
));
ipcMain.handle("save-scraper-author-favorite", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperAuthorFavorite(event, request);
    notifyScraperAuthorFavoritesUpdated();
    return updated;
});
ipcMain.handle("remove-scraper-author-favorite", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.removeScraperAuthorFavorite(event, request);
    if (updated && request?.favoriteId) {
        await scrapers.removeScraperAuthorFavoriteCache(event, request.favoriteId);
    }
    notifyScraperAuthorFavoritesUpdated();
    return updated;
});
ipcMain.handle("remove-scraper-author-favorite-source", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.removeScraperAuthorFavoriteSource(event, request);
    notifyScraperAuthorFavoritesUpdated();
    return updated;
});
ipcMain.handle("get-scraper-tag-favorites", async (event: IpcMainInvokeEvent) => (
    scrapers.getScraperTagFavorites(event)
));
ipcMain.handle("save-scraper-tag-favorite", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperTagFavorite(event, request);
    notifyScraperTagFavoritesUpdated();
    return updated;
});
ipcMain.handle("remove-scraper-tag-favorite", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.removeScraperTagFavorite(event, request);
    notifyScraperTagFavoritesUpdated();
    return updated;
});
ipcMain.handle("remove-scraper-tag-favorite-source", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.removeScraperTagFavoriteSource(event, request);
    notifyScraperTagFavoritesUpdated();
    return updated;
});
ipcMain.handle("get-scraper-tag-list-cache", async (_event: IpcMainInvokeEvent, scraperId: string) => (
    scrapers.getScraperTagListCache(scraperId)
));
ipcMain.handle("save-scraper-tag-list-cache", async (_event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperTagListCache(request);
    notifyScraperTagListCacheUpdated(updated.scraperId);
    return updated;
});
ipcMain.handle("add-scraper-tag-list-cache-items", async (_event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.addScraperTagListCacheItems(request);
    notifyScraperTagListCacheUpdated(updated.scraperId);
    return updated;
});
ipcMain.handle("get-scraper-author-favorite-cache", async (event: IpcMainInvokeEvent, favoriteId: string) => (
    scrapers.getScraperAuthorFavoriteCache(event, favoriteId)
));
ipcMain.handle("save-scraper-author-favorite-cache", async (event: IpcMainInvokeEvent, request: any) => (
    scrapers.saveScraperAuthorFavoriteCache(event, request)
));
ipcMain.handle("get-scraper-view-history", async (event: IpcMainInvokeEvent, scraperId?: string | null) => (
    scrapers.getScraperViewHistory(event, scraperId)
));
ipcMain.handle("record-scraper-cards-seen", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.recordScraperCardsSeen(event, request);
    notifyScraperViewHistoryUpdated();
    return updated;
});
ipcMain.handle("record-scraper-cards-seen-compact", async (event: IpcMainInvokeEvent, request: any) => (
    scrapers.recordScraperCardsSeenCompact(event, request)
));
ipcMain.handle("set-scraper-card-read", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.setScraperCardRead(event, request);
    notifyScraperViewHistoryUpdated();
    return updated;
});
ipcMain.handle("get-scraper-latest-checkpoints", async (event: IpcMainInvokeEvent, scraperId?: string | null) => (
    scrapers.getScraperLatestCheckpoints(event, scraperId)
));
ipcMain.handle("save-scraper-latest-checkpoint", async (event: IpcMainInvokeEvent, request: any) => (
    scrapers.saveScraperLatestCheckpoint(event, request)
));
ipcMain.handle("delete-scraper", async (event: IpcMainInvokeEvent, scraperId: string) => {
    const updated = await scrapers.deleteScraper(event, scraperId);
    notifyScrapersUpdated();
    notifyScraperBookmarksUpdated();
    return updated;
});
ipcMain.handle("save-scraper-draft", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperDraft(event, request);
    notifyScrapersUpdated();
    return updated;
});
ipcMain.handle("fetch-scraper-document", async (event: IpcMainInvokeEvent, request: any) => scrapers.fetchScraperDocument(event, request));
ipcMain.handle("save-scraper-feature-config", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperFeatureConfig(event, request);
    notifyScrapersUpdated();
    return updated;
});
ipcMain.handle("save-scraper-global-config", async (event: IpcMainInvokeEvent, request: any) => {
    const updated = await scrapers.saveScraperGlobalConfig(event, request);
    notifyScrapersUpdated();
    return updated;
});
ipcMain.handle("get-scraper-reader-progress", async (event: IpcMainInvokeEvent, scraperMangaId: string) => (
    scrapers.getScraperReaderProgress(event, scraperMangaId)
));
ipcMain.handle("get-scraper-reader-progress-records", async (event: IpcMainInvokeEvent, scraperId?: string | null) => (
    scrapers.getScraperReaderProgressRecords(event, scraperId)
));
ipcMain.handle("save-scraper-reader-progress", async (event: IpcMainInvokeEvent, request: any) => {
    const saved = await scrapers.saveScraperReaderProgress(event, request);
    notifyMangasUpdated();
    return saved;
});
ipcMain.handle("download-scraper-manga", async (event: IpcMainInvokeEvent, request: any) => (
    scrapers.queueScraperDownload(event, request)
));
ipcMain.handle("scraper-download-queue-status", async () => scrapers.getScraperDownloadQueueStatus());
ipcMain.handle("scraper-download-cancel-job", async (event: IpcMainInvokeEvent, jobId: string) => (
    scrapers.cancelScraperDownloadJob(event, jobId)
));
ipcMain.handle("scraper-download-cancel-all-jobs", async () => scrapers.cancelAllScraperDownloadJobs());

// Pages / covers
ipcMain.handle("count-pages", async (event: IpcMainInvokeEvent, folderPath: string) => pages.countPages(event, folderPath));
ipcMain.handle("get-cover", async (event: IpcMainInvokeEvent, folderPath: string) => pages.getCover(event, folderPath));
ipcMain.handle("get-cover-data", async (event: IpcMainInvokeEvent, folderPath: string) => pages.getCoverData(event, folderPath));
ipcMain.handle("list-pages", async (event: IpcMainInvokeEvent, folderPath: string) => pages.listPages(event, folderPath));
ipcMain.handle("copy-image-to-clipboard", async (event: IpcMainInvokeEvent, imagePathOrUrl: string) => clipboardHandlers.copyImageToClipboard(event, imagePathOrUrl));
ipcMain.handle("copy-text-to-clipboard", async (event: IpcMainInvokeEvent, text: string) => clipboardHandlers.copyTextToClipboard(event, text));

// Open a folder picker and return the selected directory path (fallback for renderer)
ipcMain.handle("open-directory", async (event: IpcMainInvokeEvent) => {
    try {
        const win = BrowserWindow.getFocusedWindow();
        const result = await dialog.showOpenDialog((win as BrowserWindow) || undefined, {
            properties: ["openDirectory"]
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    } catch (error) {
        console.error("Error opening directory dialog", error);
        return null;
    }
});

ipcMain.handle("open-file", async (event: IpcMainInvokeEvent) => {
    try {
        const win = BrowserWindow.getFocusedWindow();
        const result = await dialog.showOpenDialog((win as BrowserWindow) || undefined, {
            properties: ["openFile"]
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    } catch (error) {
        console.error("Error opening file dialog", error);
        return null;
    }
});

ipcMain.handle("open-path", async (event: IpcMainInvokeEvent, targetPath: string) => {
    const normalizedPath = String(targetPath || "").trim();
    if (!normalizedPath) {
        return { success: false, error: "Path is empty" };
    }

    try {
        const pathStat = await stat(normalizedPath);
        if (pathStat.isDirectory()) {
            const error = await shell.openPath(normalizedPath);
            return {
                success: error.length === 0,
                error,
            };
        }

        shell.showItemInFolder(normalizedPath);
        return { success: true, error: "" };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unable to open path",
        };
    }
});

ipcMain.handle("open-user-data-directory", async () => {
    try {
        await ensureDataDir();
        const error = await shell.openPath(dataDir);
        return {
            success: error.length === 0,
            error,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unable to open user data directory",
        };
    }
});

// OCR
ipcMain.handle("ocr-runtime-defaults", async () => ocrRuntime.getOcrRuntimeDefaults());
ipcMain.handle("ocr-runtime-status", async () => ocrRuntime.getOcrRuntimeStatus());
ipcMain.handle("ocr-runtime-mark-skipped", async () => ocrRuntime.markOcrRuntimeSkipped());
ipcMain.handle("ocr-runtime-read-manifest", async (_event: IpcMainInvokeEvent, request?: Record<string, any>) => (
    ocrRuntime.readOcrRuntimeManifest(request)
));
ipcMain.handle("ocr-runtime-install-status", async () => ocrRuntime.getOcrRuntimeInstallStatus());
ipcMain.handle("ocr-runtime-start-install", async (_event: IpcMainInvokeEvent, request?: Record<string, any>) => (
    ocrRuntime.startOcrRuntimeInstall(request)
));
ipcMain.handle("ocr-runtime-cancel-install", async () => ocrRuntime.cancelOcrRuntimeInstall());
ipcMain.handle("ocr-runtime-open-install-log", async () => ocrRuntime.openOcrRuntimeInstallLog());
ipcMain.handle("ocr-runtime-verify", async () => ocrRuntime.verifyOcrRuntime());
ipcMain.handle("ocr-runtime-repair", async (_event: IpcMainInvokeEvent, request?: Record<string, any>) => (
    ocrRuntime.repairOcrRuntime(request)
));
ipcMain.handle("ocr-runtime-uninstall", async (_event: IpcMainInvokeEvent, request?: Record<string, any>) => (
    ocrRuntime.uninstallOcrRuntime(request)
));
ipcMain.handle("ocr-recognize", async (event: IpcMainInvokeEvent, imagePathOrDataUrl: string, opts?: Record<string, any>) => ocr.ocrRecognize(event, imagePathOrDataUrl, {
    debug: true,
    returnRaw: true,
    ...(opts || {}),
}));
ipcMain.handle("ocr-add-manual-selections", async (event: IpcMainInvokeEvent, payload?: Record<string, any>) => ocr.ocrAddManualSelections(event, payload));
ipcMain.handle("ocr-delete-manual-selection", async (event: IpcMainInvokeEvent, payload?: Record<string, any>) => ocr.ocrDeleteManualSelection(event, payload));
ipcMain.handle("ocr-get-manga-status", async (event: IpcMainInvokeEvent, mangaId: string) => ocr.ocrGetMangaStatus(event, mangaId));
ipcMain.handle("ocr-get-manga-completion-map", async (event: IpcMainInvokeEvent, mangaIds?: string[]) => ocr.ocrGetMangaCompletionMap(event, mangaIds));
ipcMain.handle("ocr-start-manga", async (event: IpcMainInvokeEvent, mangaId: string, opts?: Record<string, any>) => ocr.ocrStartManga(event, mangaId, opts));
ipcMain.handle("ocr-read-manga-vocabulary", async (event: IpcMainInvokeEvent, mangaId: string) => ocr.ocrReadMangaVocabulary(event, mangaId));
ipcMain.handle("ocr-extract-manga-vocabulary", async (event: IpcMainInvokeEvent, mangaId: string, opts?: Record<string, any>) => ocr.ocrExtractMangaVocabulary(event, mangaId, opts));
ipcMain.handle("ocr-start-library", async (event: IpcMainInvokeEvent, opts?: Record<string, any>) => ocr.ocrStartLibrary(event, opts));
ipcMain.handle("ocr-queue-status", async () => ocr.ocrGetQueueStatus());
ipcMain.handle("ocr-pause-job", async (event: IpcMainInvokeEvent, jobId: string) => ocr.ocrPauseJob(event, jobId));
ipcMain.handle("ocr-resume-job", async (event: IpcMainInvokeEvent, jobId: string) => ocr.ocrResumeJob(event, jobId));
ipcMain.handle("ocr-cancel-job", async (event: IpcMainInvokeEvent, jobId: string) => ocr.ocrCancelJob(event, jobId));
ipcMain.handle("ocr-cancel-all-jobs", async () => ocr.ocrCancelAllJobs());
ipcMain.handle("ocr-terminate", async () => ocr.ocrTerminate());
