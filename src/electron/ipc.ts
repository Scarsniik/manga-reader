import { ipcMain, IpcMainInvokeEvent, app } from "electron";
import { dialog, BrowserWindow } from "electron";

// Themed handlers
import * as mangas from "./handlers/mangas";
import * as params from "./handlers/params";
import * as links from "./handlers/links";
import * as pages from "./handlers/pages";
import * as ocr from "./handlers/ocr";
import * as authors from "./handlers/authors";
import * as tags from "./handlers/tags";
import * as series from "./handlers/series";
import { migrateExistingFiles } from "./utils";

// Run migration at module load
migrateExistingFiles().catch(() => { /* swallow */ });

// Links
ipcMain.handle("get-links", async () => links.getLinks());
ipcMain.handle("add-link", async (event: IpcMainInvokeEvent, link: { url: string; title: string; description?: string }) => links.addLink(event, link));
ipcMain.handle("remove-link", async (event: IpcMainInvokeEvent, url: string) => links.removeLink(event, url));

// Mangas
ipcMain.handle("get-mangas", async () => mangas.getMangas());
ipcMain.handle("add-manga", async (event: IpcMainInvokeEvent, manga: any) => mangas.addManga(event, manga));
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

// Pages / covers
ipcMain.handle("count-pages", async (event: IpcMainInvokeEvent, folderPath: string) => pages.countPages(event, folderPath));
ipcMain.handle("get-cover", async (event: IpcMainInvokeEvent, folderPath: string) => pages.getCover(event, folderPath));
ipcMain.handle("get-cover-data", async (event: IpcMainInvokeEvent, folderPath: string) => pages.getCoverData(event, folderPath));
ipcMain.handle("list-pages", async (event: IpcMainInvokeEvent, folderPath: string) => pages.listPages(event, folderPath));

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
ipcMain.handle("ocr-recognize", async (event: IpcMainInvokeEvent, imagePathOrDataUrl: string) => ocr.ocrRecognize(event, imagePathOrDataUrl, {
    debug: true,
    returnRaw: true,
}));
ipcMain.handle("ocr-terminate", async () => ocr.ocrTerminate());