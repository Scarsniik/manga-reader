import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { app } from "electron";

export const userDataDir = app.getPath("userData");
export const dataDir = path.join(userDataDir, "data");
export const thumbnailsDir = path.join(dataDir, "thumbnails");
export const mangasFilePath = path.join(dataDir, "mangas.json");
export const paramsFilePath = path.join(dataDir, "params.json");
export const linksFilePath = path.join(app.getAppPath(), "data", "links.json");
export const authorsFilePath = path.join(dataDir, "authors.json");
export const tagsFilePath = path.join(dataDir, "tags.json");
export const seriesFilePath = path.join(dataDir, "series.json");
export const scrapersFilePath = path.join(dataDir, "scrapers.json");
export const scraperBookmarksFilePath = path.join(dataDir, "scraper-bookmarks.json");
export const scraperAuthorFavoritesFilePath = path.join(dataDir, "scraper-author-favorites.json");
export const scraperReaderProgressFilePath = path.join(dataDir, "scraper-reader-progress.json");
export const scraperViewHistoryFilePath = path.join(dataDir, "scraper-view-history.json");
export const workspaceWindowStateFilePath = path.join(dataDir, "workspace-window-state.json");

export async function ensureDataDir() {
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
        console.warn("Failed to ensure data directory exists", err);
    }
}

export async function ensureThumbnailsDir() {
    try {
        await ensureDataDir();
        await fs.mkdir(thumbnailsDir, { recursive: true });
    } catch (err) {
        console.warn("Failed to ensure thumbnails directory exists", err);
    }
}

// Migrate existing files from previous location (userData root) into dataDir
export async function migrateExistingFiles() {
    try {
        const oldMangas = path.join(userDataDir, "mangas.json");
        const oldParams = path.join(userDataDir, "params.json");

        // If old mangas exists and new one doesn't, move it
        try {
            await fs.access(oldMangas);
            try {
                await fs.access(mangasFilePath);
                // new file exists, skip
            } catch (e) {
                await ensureDataDir();
                await fs.rename(oldMangas, mangasFilePath);
                console.log("Migrated mangas.json to data directory");
            }
        } catch (e) {
            // old mangas doesn't exist -> nothing to do
        }

        // Migrate params.json similarly
        try {
            await fs.access(oldParams);
            try {
                await fs.access(paramsFilePath);
                // new params exists, skip
            } catch (e) {
                await ensureDataDir();
                await fs.rename(oldParams, paramsFilePath);
                console.log("Migrated params.json to data directory");
            }
        } catch (e) {
            // old params doesn't exist
        }
    } catch (err) {
        console.warn("Error during migration of existing files:", err);
    }
}

// helper to get image size
export const getImageSize = async (filePathOrDataUrl: string) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sizeOf = require("image-size");
        if (filePathOrDataUrl.startsWith("data:")) {
            // extract base64
            const comma = filePathOrDataUrl.indexOf(",");
            const b64 = filePathOrDataUrl.slice(comma + 1);
            const buf = Buffer.from(b64, "base64");
            const dims = sizeOf(buf as any);
            return { width: dims.width || 0, height: dims.height || 0 };
        }
        // if it's a file:// URL, convert to local path
        let target = filePathOrDataUrl;
        if (filePathOrDataUrl.startsWith("file://")) {
            try {
                target = fileURLToPath(filePathOrDataUrl);
            } catch (e) {
                // fallback to original
            }
        }
        const dims = sizeOf(target);
        return { width: dims.width || 0, height: dims.height || 0 };
    } catch (err) {
        console.warn("getImageSize failed", err);
        return { width: 0, height: 0 };
    }
};
