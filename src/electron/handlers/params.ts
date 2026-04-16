import { promises as fs } from "fs";
import { paramsFilePath, ensureDataDir } from "../utils";

const DEFAULT_READER_PRELOAD_PAGE_COUNT = 2;
const MAX_READER_PRELOAD_PAGE_COUNT = 10;

const normalizeReaderPreloadPageCount = (value: unknown): number => {
    const parsed = typeof value === "number"
        ? value
        : (typeof value === "string" && value.trim().length > 0 ? Number(value) : Number.NaN);

    if (!Number.isFinite(parsed)) {
        return DEFAULT_READER_PRELOAD_PAGE_COUNT;
    }

    return Math.max(0, Math.min(MAX_READER_PRELOAD_PAGE_COUNT, Math.floor(parsed)));
};

const defaultSettings = {
    libraryPath: "",
    lastHomeSearch: "",
    showPageNumbers: true,
    showHiddens: false,
    titleLineCount: 2,
    readerPreloadPageCount: DEFAULT_READER_PRELOAD_PAGE_COUNT,
    readerOcrDetectedSectionOpen: true,
    readerOcrManualSectionOpen: true,
    jpdbApiKey: "",
    ocrPythonPath: "",
    ocrRepoPath: "",
    ocrForceCpu: false,
    ocrAutoRunOnImport: false,
    ocrAutoAssignJapaneseLanguage: true,
    persistMangaFilters: true,
    showSavedLibrarySearches: true,
    savedLibrarySearches: [],
    stackMangaInSeries: true,
    mangaListFilters: null,
};

export async function getSettings() {
    try {
        const data = await fs.readFile(paramsFilePath, "utf-8");
        if (!data || data.trim().length === 0) {
            await ensureDataDir();
            await fs.writeFile(paramsFilePath, JSON.stringify(defaultSettings, null, 2));
            return defaultSettings;
        }
        try {
            const parsed = JSON.parse(data);
            const merged = {
                ...defaultSettings,
                ...(parsed || {}),
            };
            merged.readerPreloadPageCount = normalizeReaderPreloadPageCount(merged.readerPreloadPageCount);
            if (JSON.stringify(parsed) !== JSON.stringify(merged)) {
                await ensureDataDir();
                await fs.writeFile(paramsFilePath, JSON.stringify(merged, null, 2));
            }
            return merged;
        } catch (parseErr) {
            console.warn('params.json exists but contains invalid JSON — resetting to defaults', parseErr);
            await ensureDataDir();
            await fs.writeFile(paramsFilePath, JSON.stringify(defaultSettings, null, 2));
            return defaultSettings;
        }
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            await ensureDataDir();
            await fs.writeFile(paramsFilePath, JSON.stringify(defaultSettings, null, 2));
            return defaultSettings;
        }
        console.error("Error reading params file:", error);
        throw new Error("Failed to read params");
    }
}

export async function saveSettings(event: any, settings: any) {
    try {
        const nextSettings = {
            ...defaultSettings,
            ...(settings || {}),
        };
        nextSettings.readerPreloadPageCount = normalizeReaderPreloadPageCount(nextSettings.readerPreloadPageCount);

        await ensureDataDir();
        await fs.writeFile(paramsFilePath, JSON.stringify(nextSettings, null, 2));
        return nextSettings;
    } catch (error) {
        console.error("Error saving params file:", error);
        throw new Error("Failed to save params");
    }
}
