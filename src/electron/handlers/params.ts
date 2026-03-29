import { promises as fs } from "fs";
import { paramsFilePath, ensureDataDir } from "../utils";

const defaultSettings = {
    libraryPath: "",
    showPageNumbers: true,
    showHiddens: false,
    titleLineCount: 2,
    jpdbApiKey: "",
    persistMangaFilters: true,
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
            const merged = { ...defaultSettings, ...(parsed || {}) };
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
        await ensureDataDir();
        await fs.writeFile(paramsFilePath, JSON.stringify(settings || {}, null, 2));
        return settings || {};
    } catch (error) {
        console.error("Error saving params file:", error);
        throw new Error("Failed to save params");
    }
}
