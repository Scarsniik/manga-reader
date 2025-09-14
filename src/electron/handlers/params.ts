import { promises as fs } from "fs";
import { paramsFilePath, ensureDataDir } from "../utils";

export async function getSettings() {
    try {
        const data = await fs.readFile(paramsFilePath, "utf-8");
        if (!data || data.trim().length === 0) {
            const defaults = { libraryPath: "", showPageNumbers: true, titleLineCount: 2, jpdbApiKey: "" };
            await ensureDataDir();
            await fs.writeFile(paramsFilePath, JSON.stringify(defaults, null, 2));
            return defaults;
        }
        try {
            return JSON.parse(data);
        } catch (parseErr) {
            console.warn('params.json exists but contains invalid JSON — resetting to defaults', parseErr);
            const defaults = { libraryPath: "", showPageNumbers: true, titleLineCount: 2, jpdbApiKey: "" };
            await ensureDataDir();
            await fs.writeFile(paramsFilePath, JSON.stringify(defaults, null, 2));
            return defaults;
        }
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            const defaults = { libraryPath: "", showPageNumbers: true, titleLineCount: 2, jpdbApiKey: "" };
            await ensureDataDir();
            await fs.writeFile(paramsFilePath, JSON.stringify(defaults, null, 2));
            return defaults;
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
