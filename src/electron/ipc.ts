import { ipcMain, IpcMainInvokeEvent, app } from "electron";
import { dialog, BrowserWindow } from "electron";

// Themed handlers
import * as mangas from "./handlers/mangas";
import * as params from "./handlers/params";
import * as links from "./handlers/links";
import * as pages from "./handlers/pages";
import * as clipboardHandlers from "./handlers/clipboard";
import * as ocr from "./handlers/ocr";
import * as authors from "./handlers/authors";
import * as tags from "./handlers/tags";
import * as series from "./handlers/series";
import * as scrapers from "./handlers/scrapers";
import { migrateExistingFiles } from "./utils";

// Run migration at module load
migrateExistingFiles().catch(() => { /* swallow */ });

const notifyScrapersUpdated = () => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("scrapers-updated");
    }
};

// Links
ipcMain.handle("get-links", async () => links.getLinks());
ipcMain.handle("add-link", async (event: IpcMainInvokeEvent, link: { url: string; title: string; description?: string }) => links.addLink(event, link));
ipcMain.handle("remove-link", async (event: IpcMainInvokeEvent, url: string) => links.removeLink(event, url));

// Mangas
ipcMain.handle("get-mangas", async () => mangas.getMangas());
ipcMain.handle("add-manga", async (event: IpcMainInvokeEvent, manga: any) => {
    const updated = await mangas.addManga(event, manga);
    const insertedManga = Array.isArray(updated)
        ? updated.find((item: any) => String(item.id) === String(manga?.id)) || manga
        : manga;
    const hydratedMangas = await mangas.getMangas();

    // Let the import finish and the library refresh first, then queue OCR in the background.
    setTimeout(() => {
        void (async () => {
            try {
                const queueResult = await ocr.ocrQueueImportManga(insertedManga);
                if (queueResult?.queued) {
                    for (const win of BrowserWindow.getAllWindows()) {
                        win.webContents.send("mangas-updated");
                    }
                }
            } catch (error) {
                console.warn("Failed to auto-queue OCR after manga import", error);
            }
        })();
    }, 0);

    return hydratedMangas;
});
ipcMain.handle("remove-manga", async (event: IpcMainInvokeEvent, mangaId: string) => mangas.removeManga(event, mangaId));
ipcMain.handle("update-manga", async (event: IpcMainInvokeEvent, updatedManga: any) => mangas.updateManga(event, updatedManga));
ipcMain.handle("batch-update-tags", async (event: IpcMainInvokeEvent, payload: any) => mangas.batchUpdateTags(event, payload));

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
ipcMain.handle("add-series", async (event: IpcMainInvokeEvent, seriesItem: any) => series.addSeries(event, seriesItem));
ipcMain.handle("remove-series", async (event: IpcMainInvokeEvent, seriesId: string) => series.removeSeries(event, seriesId));
ipcMain.handle("update-series", async (event: IpcMainInvokeEvent, updatedSeries: any) => series.updateSeries(event, updatedSeries));

// Settings
ipcMain.handle("get-settings", async () => params.getSettings());
ipcMain.handle("save-settings", async (event: IpcMainInvokeEvent, settings: any) => params.saveSettings(event, settings));

// Scrapers
ipcMain.handle("validate-scraper-access", async (event: IpcMainInvokeEvent, request: any) => scrapers.validateScraperAccess(event, request));
ipcMain.handle("get-scrapers", async () => scrapers.getScrapers());
ipcMain.handle("delete-scraper", async (event: IpcMainInvokeEvent, scraperId: string) => {
    const updated = await scrapers.deleteScraper(event, scraperId);
    notifyScrapersUpdated();
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
ipcMain.handle("download-scraper-manga", async (event: IpcMainInvokeEvent, request: any) => {
    const result = await scrapers.downloadScraperManga(event, request);
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("mangas-updated");
    }
    return result;
});

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

// OCR
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
