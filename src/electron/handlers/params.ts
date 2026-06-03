import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { LEGACY_ROAMING_CONFIG_DIR_NAMES, LEGACY_USER_DATA_DIR_NAMES } from "../appIdentity";
import {
    DEFAULT_SCRAPER_VIEW_HISTORY_MAX_RECORDS,
    DEFAULT_SCRAPER_VIEW_HISTORY_READ_RETENTION_DAYS,
    DEFAULT_SCRAPER_VIEW_HISTORY_SEEN_RETENTION_DAYS,
    normalizeScraperViewHistorySettings,
} from "../scraper";
import { paramsFilePath, ensureDataDir } from "../utils";

const DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT = 2;
const MAX_READER_OCR_PRELOAD_PAGE_COUNT = 10;
const DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES = true;
const DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS = false;
const DEFAULT_READER_OCR_NAVIGATION_OFFSET = 6;
const MIN_READER_OCR_NAVIGATION_OFFSET = 0;
const MAX_READER_OCR_NAVIGATION_OFFSET = 25;
const DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE = 1;
const MIN_READER_OCR_NAVIGATION_DEAD_ZONE = 0;
const MAX_READER_OCR_NAVIGATION_DEAD_ZONE = 10;
const DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION = true;
const DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK = true;
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
const DEFAULT_SCRAPER_LATEST_RESULT_LIMIT = 20;
const MIN_SCRAPER_LATEST_RESULT_LIMIT = 1;
const DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT = 0;
const MIN_SCRAPER_LATEST_DEEP_PAGE_LIMIT = 0;
const DEFAULT_SCRAPER_LATEST_QUICK_CONSECUTIVE_SEEN_STOP_THRESHOLD = 2;
const MIN_SCRAPER_LATEST_QUICK_CONSECUTIVE_SEEN_STOP_THRESHOLD = 0;
const DEFAULT_MULTI_SEARCH_DEPTH_MODE = "quick";
const DEFAULT_MULTI_SEARCH_ADVANCED_PAGES = 3;
const DEFAULT_MULTI_SEARCH_PACE_MODE = "fast";
const DEFAULT_MULTI_SEARCH_VIEW_MODE = "merged";
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
    readerOcrOrderSelection: ["", "", ""],
    readerOcrOrderedPrevious: ["", "", ""],
    readerOcrOrderedNext: ["", "", ""],
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

const normalizeIntegerSettingWithoutMax = (
    value: unknown,
    fallback: number,
    min: number,
): number => {
    const parsed = parseNumericSetting(value);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.floor(parsed));
};

const normalizeReaderOcrPreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_OCR_PRELOAD_PAGE_COUNT,
    )
);

const normalizeBooleanSetting = (value: unknown, fallback: boolean): boolean => (
    typeof value === "boolean" ? value : fallback
);

const normalizeLowercaseStringListSetting = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();
    return value.reduce<string[]>((result, entry) => {
        const normalized = String(entry ?? "").trim().toLowerCase();
        if (!normalized || seen.has(normalized)) {
            return result;
        }

        seen.add(normalized);
        result.push(normalized);
        return result;
    }, []);
};

const normalizeStringListSetting = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();
    return value.reduce<string[]>((result, entry) => {
        const normalized = String(entry ?? "").trim();
        if (!normalized || seen.has(normalized)) {
            return result;
        }

        seen.add(normalized);
        result.push(normalized);
        return result;
    }, []);
};

const normalizeReaderOcrAutoAnalyzeBubbles = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES)
);

const normalizeReaderOcrPreloadTokenDetails = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS)
);

const normalizeReaderOcrNavigationOffset = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_NAVIGATION_OFFSET,
        MIN_READER_OCR_NAVIGATION_OFFSET,
        MAX_READER_OCR_NAVIGATION_OFFSET,
    )
);

const normalizeReaderOcrNavigationDeadZone = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
        MIN_READER_OCR_NAVIGATION_DEAD_ZONE,
        MAX_READER_OCR_NAVIGATION_DEAD_ZONE,
    )
);

const normalizeReaderOcrNavigationStrictDirection = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION)
);

const normalizeReaderOcrNavigationLooseFallback = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK)
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

const normalizeScraperLatestResultLimit = (value: unknown): number => (
    normalizeIntegerSettingWithoutMax(
        value,
        DEFAULT_SCRAPER_LATEST_RESULT_LIMIT,
        MIN_SCRAPER_LATEST_RESULT_LIMIT,
    )
);

const normalizeScraperLatestDeepPageLimit = (value: unknown): number => (
    normalizeIntegerSettingWithoutMax(
        value,
        DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
        MIN_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
    )
);

const normalizeScraperLatestQuickConsecutiveSeenStopThreshold = (value: unknown): number => (
    normalizeIntegerSettingWithoutMax(
        value,
        DEFAULT_SCRAPER_LATEST_QUICK_CONSECUTIVE_SEEN_STOP_THRESHOLD,
        MIN_SCRAPER_LATEST_QUICK_CONSECUTIVE_SEEN_STOP_THRESHOLD,
    )
);

const normalizeMultiSearchDepthMode = (value: unknown): string => (
    value === "extended" || value === "advanced" ? value : DEFAULT_MULTI_SEARCH_DEPTH_MODE
);

const normalizeMultiSearchAdvancedPages = (value: unknown): number | "maximum" => {
    if (value === "maximum") {
        return "maximum";
    }

    return normalizeIntegerSettingWithoutMax(
        value,
        DEFAULT_MULTI_SEARCH_ADVANCED_PAGES,
        1,
    );
};

const normalizeMultiSearchPaceMode = (value: unknown): string => (
    value === "careful" ? "careful" : DEFAULT_MULTI_SEARCH_PACE_MODE
);

const normalizeMultiSearchViewMode = (value: unknown): string => (
    value === "byScraper" ? "byScraper" : DEFAULT_MULTI_SEARCH_VIEW_MODE
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
    readerOcrAutoAnalyzeBubbles: DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES,
    readerOcrPreloadTokenDetails: DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS,
    readerOcrNavigationOffset: DEFAULT_READER_OCR_NAVIGATION_OFFSET,
    readerOcrNavigationDeadZone: DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
    readerOcrNavigationStrictDirection: DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION,
    readerOcrNavigationLooseFallback: DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK,
    readerImagePreloadPageCount: DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
    readerImageMaxWidth: DEFAULT_READER_IMAGE_MAX_WIDTH,
    readerShowProgressIndicator: true,
    readerScrollStrength: DEFAULT_READER_SCROLL_STRENGTH,
    readerScrollHoldSpeed: DEFAULT_READER_SCROLL_HOLD_SPEED,
    readerScrollStartBoost: DEFAULT_READER_SCROLL_START_BOOST,
    readerOpenOcrPanelForJapaneseManga: false,
    readerRecommendBookmarks: false,
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
    multiSearchShowUnseenFirst: false,
    multiSearchEnableRomajiPhoneticMerge: false,
    multiSearchSelectedScraperIds: [] as string[],
    multiSearchSelectedLanguageCodes: [] as string[],
    multiSearchSelectedContentTypes: [] as string[],
    multiSearchDepthMode: DEFAULT_MULTI_SEARCH_DEPTH_MODE,
    multiSearchAdvancedPages: DEFAULT_MULTI_SEARCH_ADVANCED_PAGES as number | "maximum",
    multiSearchPaceMode: DEFAULT_MULTI_SEARCH_PACE_MODE,
    multiSearchViewMode: DEFAULT_MULTI_SEARCH_VIEW_MODE,
    scraperAuthorCombinedView: false,
    scraperAuthorFavoriteShowUnseenFirst: false,
    scraperTagFavoriteShowUnseenFirst: true,
    scraperAuthorFavoritePageCount: DEFAULT_SCRAPER_AUTHOR_FAVORITE_PAGE_COUNT,
    scraperAuthorFavoriteCacheResults: false,
    scraperLatestResultLimit: DEFAULT_SCRAPER_LATEST_RESULT_LIMIT,
    scraperLatestDeepPageLimit: DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
    scraperLatestQuickConsecutiveSeenStopThreshold: DEFAULT_SCRAPER_LATEST_QUICK_CONSECUTIVE_SEEN_STOP_THRESHOLD,
    scraperLatestIncludedLanguageCodes: [] as string[],
    scraperLatestIncludedScraperIds: [] as string[],
    scraperLatestIncludedAuthorFavoriteIds: [] as string[],
    scraperLatestIncludedTagFavoriteIds: [] as string[],
    scraperViewHistoryMaxRecords: DEFAULT_SCRAPER_VIEW_HISTORY_MAX_RECORDS,
    scraperViewHistorySeenRetentionDays: DEFAULT_SCRAPER_VIEW_HISTORY_SEEN_RETENTION_DAYS,
    scraperViewHistoryReadRetentionDays: DEFAULT_SCRAPER_VIEW_HISTORY_READ_RETENTION_DAYS,
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
    merged.readerOcrAutoAnalyzeBubbles = normalizeReaderOcrAutoAnalyzeBubbles(merged.readerOcrAutoAnalyzeBubbles);
    merged.readerOcrPreloadTokenDetails = normalizeReaderOcrPreloadTokenDetails(merged.readerOcrPreloadTokenDetails);
    merged.readerOcrNavigationOffset = normalizeReaderOcrNavigationOffset(merged.readerOcrNavigationOffset);
    merged.readerOcrNavigationDeadZone = normalizeReaderOcrNavigationDeadZone(merged.readerOcrNavigationDeadZone);
    merged.readerOcrNavigationStrictDirection = normalizeReaderOcrNavigationStrictDirection(
        merged.readerOcrNavigationStrictDirection,
    );
    merged.readerOcrNavigationLooseFallback = normalizeReaderOcrNavigationLooseFallback(
        merged.readerOcrNavigationLooseFallback,
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
    merged.readerRecommendBookmarks = typeof merged.readerRecommendBookmarks === "boolean"
        ? merged.readerRecommendBookmarks
        : defaultSettings.readerRecommendBookmarks;
    merged.scraperAuthorFavoritePageCount = normalizeScraperAuthorFavoritePageCount(merged.scraperAuthorFavoritePageCount);
    merged.scraperLatestResultLimit = normalizeScraperLatestResultLimit(merged.scraperLatestResultLimit);
    merged.scraperLatestDeepPageLimit = normalizeScraperLatestDeepPageLimit(merged.scraperLatestDeepPageLimit);
    merged.scraperLatestQuickConsecutiveSeenStopThreshold = normalizeScraperLatestQuickConsecutiveSeenStopThreshold(
        merged.scraperLatestQuickConsecutiveSeenStopThreshold,
    );
    merged.scraperLatestIncludedLanguageCodes = normalizeLowercaseStringListSetting(
        merged.scraperLatestIncludedLanguageCodes,
    );
    merged.scraperLatestIncludedScraperIds = normalizeStringListSetting(
        merged.scraperLatestIncludedScraperIds,
    );
    merged.scraperLatestIncludedAuthorFavoriteIds = normalizeStringListSetting(
        merged.scraperLatestIncludedAuthorFavoriteIds,
    );
    merged.scraperLatestIncludedTagFavoriteIds = normalizeStringListSetting(
        merged.scraperLatestIncludedTagFavoriteIds,
    );
    Object.assign(merged, normalizeScraperViewHistorySettings(merged));
    merged.multiSearchShowUnseenFirst = typeof merged.multiSearchShowUnseenFirst === "boolean"
        ? merged.multiSearchShowUnseenFirst
        : defaultSettings.multiSearchShowUnseenFirst;
    merged.multiSearchEnableRomajiPhoneticMerge = typeof merged.multiSearchEnableRomajiPhoneticMerge === "boolean"
        ? merged.multiSearchEnableRomajiPhoneticMerge
        : defaultSettings.multiSearchEnableRomajiPhoneticMerge;
    merged.multiSearchSelectedScraperIds = normalizeStringListSetting(
        merged.multiSearchSelectedScraperIds,
    );
    merged.multiSearchSelectedLanguageCodes = normalizeLowercaseStringListSetting(
        merged.multiSearchSelectedLanguageCodes,
    );
    merged.multiSearchSelectedContentTypes = normalizeStringListSetting(
        merged.multiSearchSelectedContentTypes,
    );
    merged.multiSearchDepthMode = normalizeMultiSearchDepthMode(merged.multiSearchDepthMode);
    merged.multiSearchAdvancedPages = normalizeMultiSearchAdvancedPages(merged.multiSearchAdvancedPages);
    merged.multiSearchPaceMode = normalizeMultiSearchPaceMode(merged.multiSearchPaceMode);
    merged.multiSearchViewMode = normalizeMultiSearchViewMode(merged.multiSearchViewMode);
    merged.scraperAuthorCombinedView = typeof merged.scraperAuthorCombinedView === "boolean"
        ? merged.scraperAuthorCombinedView
        : defaultSettings.scraperAuthorCombinedView;
    merged.scraperAuthorFavoriteShowUnseenFirst = typeof merged.scraperAuthorFavoriteShowUnseenFirst === "boolean"
        ? merged.scraperAuthorFavoriteShowUnseenFirst
        : defaultSettings.scraperAuthorFavoriteShowUnseenFirst;
    merged.scraperTagFavoriteShowUnseenFirst = typeof merged.scraperTagFavoriteShowUnseenFirst === "boolean"
        ? merged.scraperTagFavoriteShowUnseenFirst
        : defaultSettings.scraperTagFavoriteShowUnseenFirst;
    const legacyAuthorFavoriteScrapeAllPages = (merged as Record<string, unknown>).scraperAuthorFavoriteScrapeAllPages;
    merged.scraperAuthorFavoriteCacheResults = typeof merged.scraperAuthorFavoriteCacheResults === "boolean"
        ? merged.scraperAuthorFavoriteCacheResults
        : normalizeBooleanSetting(
            legacyAuthorFavoriteScrapeAllPages,
            defaultSettings.scraperAuthorFavoriteCacheResults,
        );
    delete (merged as Record<string, unknown>).scraperAuthorFavoriteScrapeAllPages;
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
        nextSettings.readerOcrAutoAnalyzeBubbles = normalizeReaderOcrAutoAnalyzeBubbles(
            nextSettings.readerOcrAutoAnalyzeBubbles,
        );
        nextSettings.readerOcrPreloadTokenDetails = normalizeReaderOcrPreloadTokenDetails(
            nextSettings.readerOcrPreloadTokenDetails,
        );
        nextSettings.readerOcrNavigationOffset = normalizeReaderOcrNavigationOffset(nextSettings.readerOcrNavigationOffset);
        nextSettings.readerOcrNavigationDeadZone = normalizeReaderOcrNavigationDeadZone(
            nextSettings.readerOcrNavigationDeadZone,
        );
        nextSettings.readerOcrNavigationStrictDirection = normalizeReaderOcrNavigationStrictDirection(
            nextSettings.readerOcrNavigationStrictDirection,
        );
        nextSettings.readerOcrNavigationLooseFallback = normalizeReaderOcrNavigationLooseFallback(
            nextSettings.readerOcrNavigationLooseFallback,
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
        nextSettings.readerRecommendBookmarks = typeof nextSettings.readerRecommendBookmarks === "boolean"
            ? nextSettings.readerRecommendBookmarks
            : defaultSettings.readerRecommendBookmarks;
        nextSettings.scraperAuthorFavoritePageCount = normalizeScraperAuthorFavoritePageCount(
            nextSettings.scraperAuthorFavoritePageCount,
        );
        nextSettings.scraperLatestResultLimit = normalizeScraperLatestResultLimit(nextSettings.scraperLatestResultLimit);
        nextSettings.scraperLatestDeepPageLimit = normalizeScraperLatestDeepPageLimit(
            nextSettings.scraperLatestDeepPageLimit,
        );
        nextSettings.scraperLatestQuickConsecutiveSeenStopThreshold = normalizeScraperLatestQuickConsecutiveSeenStopThreshold(
            nextSettings.scraperLatestQuickConsecutiveSeenStopThreshold,
        );
        nextSettings.scraperLatestIncludedLanguageCodes = normalizeLowercaseStringListSetting(
            nextSettings.scraperLatestIncludedLanguageCodes,
        );
        nextSettings.scraperLatestIncludedScraperIds = normalizeStringListSetting(
            nextSettings.scraperLatestIncludedScraperIds,
        );
        nextSettings.scraperLatestIncludedAuthorFavoriteIds = normalizeStringListSetting(
            nextSettings.scraperLatestIncludedAuthorFavoriteIds,
        );
        nextSettings.scraperLatestIncludedTagFavoriteIds = normalizeStringListSetting(
            nextSettings.scraperLatestIncludedTagFavoriteIds,
        );
        Object.assign(nextSettings, normalizeScraperViewHistorySettings(nextSettings));
        nextSettings.multiSearchEnableRomajiPhoneticMerge = typeof nextSettings.multiSearchEnableRomajiPhoneticMerge === "boolean"
            ? nextSettings.multiSearchEnableRomajiPhoneticMerge
            : defaultSettings.multiSearchEnableRomajiPhoneticMerge;
        nextSettings.multiSearchSelectedScraperIds = normalizeStringListSetting(
            nextSettings.multiSearchSelectedScraperIds,
        );
        nextSettings.multiSearchSelectedLanguageCodes = normalizeLowercaseStringListSetting(
            nextSettings.multiSearchSelectedLanguageCodes,
        );
        nextSettings.multiSearchSelectedContentTypes = normalizeStringListSetting(
            nextSettings.multiSearchSelectedContentTypes,
        );
        nextSettings.multiSearchDepthMode = normalizeMultiSearchDepthMode(nextSettings.multiSearchDepthMode);
        nextSettings.multiSearchAdvancedPages = normalizeMultiSearchAdvancedPages(nextSettings.multiSearchAdvancedPages);
        nextSettings.multiSearchPaceMode = normalizeMultiSearchPaceMode(nextSettings.multiSearchPaceMode);
        nextSettings.multiSearchViewMode = normalizeMultiSearchViewMode(nextSettings.multiSearchViewMode);
        nextSettings.scraperAuthorCombinedView = typeof nextSettings.scraperAuthorCombinedView === "boolean"
            ? nextSettings.scraperAuthorCombinedView
            : defaultSettings.scraperAuthorCombinedView;
        const legacyAuthorFavoriteScrapeAllPages = (nextSettings as Record<string, unknown>).scraperAuthorFavoriteScrapeAllPages;
        nextSettings.scraperAuthorFavoriteCacheResults = typeof nextSettings.scraperAuthorFavoriteCacheResults === "boolean"
            ? nextSettings.scraperAuthorFavoriteCacheResults
            : normalizeBooleanSetting(
                legacyAuthorFavoriteScrapeAllPages,
                defaultSettings.scraperAuthorFavoriteCacheResults,
            );
        delete (nextSettings as Record<string, unknown>).scraperAuthorFavoriteScrapeAllPages;
        nextSettings.shortcuts = normalizeShortcutSettings(nextSettings);

        await writeSettingsAtomically(nextSettings);
        return nextSettings;
    } catch (error) {
        console.error("Error saving params file:", error);
        throw new Error("Failed to save params");
    }
}
