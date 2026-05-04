import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { LEGACY_ROAMING_CONFIG_DIR_NAMES, LEGACY_USER_DATA_DIR_NAMES } from "../appIdentity";
import { paramsFilePath, ensureDataDir } from "../utils";

const DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT = 2;
const MAX_READER_OCR_PRELOAD_PAGE_COUNT = 10;
const DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT = 2;
const MAX_READER_IMAGE_PRELOAD_PAGE_COUNT = 10;
const DEFAULT_READER_IMAGE_MAX_WIDTH = 1100;
const MIN_READER_IMAGE_MAX_WIDTH = 480;
const MAX_READER_IMAGE_MAX_WIDTH = 2400;
const DEFAULT_READER_SCROLL_STRENGTH = 60;
const MIN_READER_SCROLL_STRENGTH = 10;
const MAX_READER_SCROLL_STRENGTH = 200;
const DEFAULT_READER_SCROLL_HOLD_SPEED = 280;
const MIN_READER_SCROLL_HOLD_SPEED = 50;
const MAX_READER_SCROLL_HOLD_SPEED = 500;
const DEFAULT_READER_SCROLL_START_BOOST = 90;
const MIN_READER_SCROLL_START_BOOST = 0;
const MAX_READER_SCROLL_START_BOOST = 250;
const DEFAULT_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT = 1;
const MIN_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT = 1;
const MAX_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT = 20;
const SHORTCUT_BINDING_SLOT_COUNT = 3;

const defaultShortcutBindings = {
    readerScrollUp: ["Z", "ArrowUp", "U"],
    readerScrollDown: ["S", "ArrowDown", "J"],
    readerPageNext: ["D", "ArrowRight", "P"],
    readerPagePrevious: ["Q", "ArrowLeft", "I"],
    readerOcrNavigateUp: ["O", "", ""],
    readerOcrNavigateDown: ["L", "", ""],
    readerOcrNavigateLeft: ["K", "", ""],
    readerOcrNavigateRight: ["M", "", ""],
    readerOcrManualSelection: ["*", "", ""],
    readerOcrTogglePanel: ["$", "", ""],
    readerOcrTokenNavigation: [":", "", ""],
};

const legacyShortcutSettingByAction: Partial<Record<keyof typeof defaultShortcutBindings, string>> = {
    readerOcrNavigateUp: "readerOcrShortcutUp",
    readerOcrNavigateLeft: "readerOcrShortcutLeft",
    readerOcrNavigateDown: "readerOcrShortcutDown",
    readerOcrNavigateRight: "readerOcrShortcutRight",
};

const parseNumericSetting = (value: unknown): number => {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        return Number(value);
    }

    return Number.NaN;
};

const normalizeIntegerSetting = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number => {
    const parsed = parseNumericSetting(value);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeReaderOcrPreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_OCR_PRELOAD_PAGE_COUNT,
    )
);

const normalizeReaderImagePreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_IMAGE_PRELOAD_PAGE_COUNT,
    )
);

const normalizeReaderImageMaxWidth = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_IMAGE_MAX_WIDTH,
        MIN_READER_IMAGE_MAX_WIDTH,
        MAX_READER_IMAGE_MAX_WIDTH,
    )
);

const normalizeReaderScrollStrength = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_STRENGTH,
        MIN_READER_SCROLL_STRENGTH,
        MAX_READER_SCROLL_STRENGTH,
    )
);

const normalizeReaderScrollHoldSpeed = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_HOLD_SPEED,
        MIN_READER_SCROLL_HOLD_SPEED,
        MAX_READER_SCROLL_HOLD_SPEED,
    )
);

const normalizeReaderScrollStartBoost = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_START_BOOST,
        MIN_READER_SCROLL_START_BOOST,
        MAX_READER_SCROLL_START_BOOST,
    )
);

const normalizeScraperAuthorFavoritePageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT,
        MIN_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT,
        MAX_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT,
    )
);

const normalizeShortcutBinding = (value: unknown): string => {
    const normalizedValue = typeof value === "string" ? value.trim() : "";
    return normalizedValue.length === 1 ? normalizedValue.toUpperCase() : normalizedValue;
};

const normalizeShortcutSlots = (value: unknown, fallbackSlots: string[]): string[] => {
    const sourceSlots = Array.isArray(value)
        ? value
        : (typeof value === "string" ? [value] : fallbackSlots);

    const normalizedSlots = sourceSlots
        .slice(0, SHORTCUT_BINDING_SLOT_COUNT)
        .map((slot) => normalizeShortcutBinding(slot));

    while (normalizedSlots.length < SHORTCUT_BINDING_SLOT_COUNT) {
        normalizedSlots.push("");
    }

    return normalizedSlots;
};

const normalizeShortcutSettings = (settings: Record<string, unknown>) => {
    const shortcutRecord = settings.shortcuts && typeof settings.shortcuts === "object" && !Array.isArray(settings.shortcuts)
        ? settings.shortcuts as Record<string, unknown>
        : {};

    return Object.entries(defaultShortcutBindings).reduce((result, [actionId, fallbackSlots]) => {
        const typedActionId = actionId as keyof typeof defaultShortcutBindings;
        const legacySettingKey = legacyShortcutSettingByAction[typedActionId];
        result[typedActionId] = normalizeShortcutSlots(
            shortcutRecord[actionId] ?? (legacySettingKey ? settings[legacySettingKey] : undefined),
            fallbackSlots,
        );
        return result;
    }, {} as Record<keyof typeof defaultShortcutBindings, string[]>);
};

const defaultSettings = {
    libraryPath: "",
    lastHomeSearch: "",
    showPageNumbers: true,
    showHiddens: false,
    titleLineCount: 2,
    readerOcrPreloadPageCount: DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
    readerImagePreloadPageCount: DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
    readerImageMaxWidth: DEFAULT_READER_IMAGE_MAX_WIDTH,
    readerShowProgressIndicator: true,
    readerScrollStrength: DEFAULT_READER_SCROLL_STRENGTH,
    readerScrollHoldSpeed: DEFAULT_READER_SCROLL_HOLD_SPEED,
    readerScrollStartBoost: DEFAULT_READER_SCROLL_START_BOOST,
    readerOpenOcrPanelForJapaneseManga: false,
    shortcuts: defaultShortcutBindings,
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
    showSavedScraperSearches: true,
    savedScraperSearches: [],
    scraperAuthorFavoritePageCount: DEFAULT_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT,
    stackMangaInSeries: true,
    mangaListFilters: null,
    appUpdateAutoCheck: true,
    appUpdateLastCheckedAt: null,
    appUpdateSkippedVersion: null,
};

const paramsBackupFilePath = `${paramsFilePath}.bak`;

const pathExists = async (targetPath: string): Promise<boolean> => {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
};

const normalizeSettings = (value: unknown) => {
    const merged = {
        ...defaultSettings,
        ...(value && typeof value === "object" ? value as Record<string, unknown> : {}),
    };

    const legacyReaderPreloadPageCount = (merged as Record<string, unknown>).readerPreloadPageCount;
    merged.readerOcrPreloadPageCount = normalizeReaderOcrPreloadPageCount(
        merged.readerOcrPreloadPageCount ?? legacyReaderPreloadPageCount,
    );
    merged.readerImagePreloadPageCount = normalizeReaderImagePreloadPageCount(merged.readerImagePreloadPageCount);
    merged.readerImageMaxWidth = normalizeReaderImageMaxWidth(merged.readerImageMaxWidth);
    merged.readerShowProgressIndicator = typeof merged.readerShowProgressIndicator === "boolean"
        ? merged.readerShowProgressIndicator
        : defaultSettings.readerShowProgressIndicator;
    merged.readerScrollStrength = normalizeReaderScrollStrength(merged.readerScrollStrength);
    merged.readerScrollHoldSpeed = normalizeReaderScrollHoldSpeed(merged.readerScrollHoldSpeed);
    merged.readerScrollStartBoost = normalizeReaderScrollStartBoost(merged.readerScrollStartBoost);
    merged.readerOpenOcrPanelForJapaneseManga = typeof merged.readerOpenOcrPanelForJapaneseManga === "boolean"
        ? merged.readerOpenOcrPanelForJapaneseManga
        : defaultSettings.readerOpenOcrPanelForJapaneseManga;
    merged.scraperAuthorFavoritePageCount = normalizeScraperAuthorFavoritePageCount(merged.scraperAuthorFavoritePageCount);
    merged.shortcuts = normalizeShortcutSettings(merged);
    return merged;
};

const isMeaningfullyCustomized = (settings: Record<string, unknown>): boolean => (
    Object.entries(defaultSettings).some(([key, defaultValue]) => {
        if (key === "appUpdateLastCheckedAt" || key === "appUpdateSkippedVersion") {
            return false;
        }

        return JSON.stringify(settings[key as keyof typeof settings] ?? null) !== JSON.stringify(defaultValue);
    })
);

const getLegacyParamsCandidatePaths = (): string[] => {
    const localAppData = process.env.LOCALAPPDATA || app.getPath("appData");
    const appData = app.getPath("appData");

    return [
        ...LEGACY_USER_DATA_DIR_NAMES.flatMap((dirName) => [
            path.join(localAppData, dirName, "data", "params.json"),
            path.join(localAppData, dirName, "params.json"),
        ]),
        ...LEGACY_ROAMING_CONFIG_DIR_NAMES.flatMap((dirName) => [
            path.join(appData, dirName, "data", "params.json"),
            path.join(appData, dirName, "params.json"),
        ]),
    ];
};

async function readStoredSettingsFromPath(targetPath: string) {
    try {
        const data = await fs.readFile(targetPath, "utf-8");
        if (!data || data.trim().length === 0) {
            return {
                kind: "empty" as const,
                settings: null,
            };
        }

        const parsed = JSON.parse(data);
        return {
            kind: "valid" as const,
            settings: parsed && typeof parsed === "object" ? normalizeSettings(parsed) : normalizeSettings({}),
        };
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            return {
                kind: "missing" as const,
                settings: null,
            };
        }

        console.warn(`Could not read settings file ${targetPath}`, error);
        return {
            kind: "invalid" as const,
            settings: null,
        };
    }
}

async function readStoredSettings() {
    const result = await readStoredSettingsFromPath(paramsFilePath);
    if (result.kind === "valid" && result.settings) {
        return result.settings;
    }

    const recoveredSettings = await tryRecoverSettings();
    return recoveredSettings || {};
}

async function writeSettingsAtomically(settings: Record<string, unknown>) {
    await ensureDataDir();

    const serialized = JSON.stringify(settings, null, 2);
    const temporaryFilePath = `${paramsFilePath}.tmp-${process.pid}`;
    const hadCurrentFile = await pathExists(paramsFilePath);

    await fs.writeFile(temporaryFilePath, serialized, "utf-8");

    if (hadCurrentFile) {
        await fs.rm(paramsBackupFilePath, { force: true });
        await fs.rename(paramsFilePath, paramsBackupFilePath);
    }

    try {
        await fs.rename(temporaryFilePath, paramsFilePath);
    } catch (error) {
        await fs.rm(temporaryFilePath, { force: true });

        if (hadCurrentFile && await pathExists(paramsBackupFilePath) && !await pathExists(paramsFilePath)) {
            await fs.copyFile(paramsBackupFilePath, paramsFilePath);
        }

        throw error;
    }
}

async function tryRecoverSettings() {
    const backupResult = await readStoredSettingsFromPath(paramsBackupFilePath);
    if (backupResult.kind === "valid" && backupResult.settings) {
        await writeSettingsAtomically(backupResult.settings);
        return backupResult.settings;
    }

    for (const legacyPath of getLegacyParamsCandidatePaths()) {
        const legacyResult = await readStoredSettingsFromPath(legacyPath);
        if (legacyResult.kind !== "valid" || !legacyResult.settings) {
            continue;
        }

        if (!isMeaningfullyCustomized(legacyResult.settings)) {
            continue;
        }

        const recoveredSettings = {
            ...legacyResult.settings,
            appUpdateAutoCheck: defaultSettings.appUpdateAutoCheck,
            appUpdateLastCheckedAt: null,
            appUpdateSkippedVersion: null,
        };
        await writeSettingsAtomically(recoveredSettings);
        console.warn(`Recovered params.json from legacy settings file ${legacyPath}`);
        return recoveredSettings;
    }

    return null;
}

export async function getSettings() {
    const result = await readStoredSettingsFromPath(paramsFilePath);

    if (result.kind === "valid" && result.settings) {
        return result.settings;
    }

    if (result.kind === "invalid") {
        console.warn("params.json exists but contains invalid JSON — attempting recovery");
    }

    if (result.kind === "empty") {
        console.warn("params.json exists but is empty — attempting recovery");
    }

    try {
        const recoveredSettings = await tryRecoverSettings();
        if (recoveredSettings) {
            return recoveredSettings;
        }

        await writeSettingsAtomically(defaultSettings);
        return defaultSettings;
    } catch (error) {
        console.error("Error reading params file:", error);
        throw new Error("Failed to read params");
    }
}

export async function saveSettings(event: any, settings: any) {
    try {
        const storedSettings = await readStoredSettings();
        const nextSettings = {
            ...defaultSettings,
            ...storedSettings,
            ...(settings || {}),
        };
        const legacyReaderPreloadPageCount = (nextSettings as Record<string, unknown>).readerPreloadPageCount;
        nextSettings.readerOcrPreloadPageCount = normalizeReaderOcrPreloadPageCount(
            nextSettings.readerOcrPreloadPageCount ?? legacyReaderPreloadPageCount,
        );
        nextSettings.readerImagePreloadPageCount = normalizeReaderImagePreloadPageCount(nextSettings.readerImagePreloadPageCount);
        nextSettings.readerImageMaxWidth = normalizeReaderImageMaxWidth(nextSettings.readerImageMaxWidth);
        nextSettings.readerShowProgressIndicator = typeof nextSettings.readerShowProgressIndicator === "boolean"
            ? nextSettings.readerShowProgressIndicator
            : defaultSettings.readerShowProgressIndicator;
        nextSettings.readerScrollStrength = normalizeReaderScrollStrength(nextSettings.readerScrollStrength);
        nextSettings.readerScrollHoldSpeed = normalizeReaderScrollHoldSpeed(nextSettings.readerScrollHoldSpeed);
        nextSettings.readerScrollStartBoost = normalizeReaderScrollStartBoost(nextSettings.readerScrollStartBoost);
        nextSettings.readerOpenOcrPanelForJapaneseManga = typeof nextSettings.readerOpenOcrPanelForJapaneseManga === "boolean"
            ? nextSettings.readerOpenOcrPanelForJapaneseManga
            : defaultSettings.readerOpenOcrPanelForJapaneseManga;
        nextSettings.scraperAuthorFavoritePageCount = normalizeScraperAuthorFavoritePageCount(
            nextSettings.scraperAuthorFavoritePageCount,
        );
        nextSettings.shortcuts = normalizeShortcutSettings(nextSettings);

        await writeSettingsAtomically(nextSettings);
        return nextSettings;
    } catch (error) {
        console.error("Error saving params file:", error);
        throw new Error("Failed to save params");
    }
}
