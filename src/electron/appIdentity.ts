import fs from "fs";
import path from "path";
import { app } from "electron";

const DEFAULT_PRODUCT_NAME = "Scaramanga";
const DEFAULT_PACKAGE_NAME = "scaramanga";

const getEnvValue = (names: string[], fallback: string): string => {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }

    return fallback;
};

const sanitizePackageName = (value: string): string => {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || DEFAULT_PACKAGE_NAME;
};

export const APP_PRODUCT_NAME = getEnvValue(
    ["APP_PRODUCT_NAME", "SCARAMANGA_PRODUCT_NAME"],
    DEFAULT_PRODUCT_NAME,
);

export const APP_PACKAGE_NAME = getEnvValue(
    ["APP_PACKAGE_NAME", "SCARAMANGA_PACKAGE_NAME"],
    sanitizePackageName(APP_PRODUCT_NAME),
);

export const APP_ID = getEnvValue(
    ["APP_ID", "SCARAMANGA_APP_ID"],
    "com.scarsniik.scaramanga",
);

export const APP_USER_DATA_DIR_NAME = getEnvValue(
    ["APP_USER_DATA_DIR_NAME", "SCARAMANGA_USER_DATA_DIR_NAME"],
    `${APP_PACKAGE_NAME}-userdata`,
);

export const APP_ROAMING_CONFIG_DIR_NAME = getEnvValue(
    ["APP_ROAMING_CONFIG_DIR_NAME", "SCARAMANGA_ROAMING_CONFIG_DIR_NAME"],
    APP_PACKAGE_NAME,
);

export const APP_LOCAL_DATA_DIR_NAME = getEnvValue(
    ["APP_LOCAL_DATA_DIR_NAME", "SCARAMANGA_LOCAL_DATA_DIR_NAME"],
    APP_PRODUCT_NAME,
);

export const APP_PORTABLE_DATA_DIR_NAME = getEnvValue(
    ["APP_PORTABLE_DATA_DIR_NAME", "SCARAMANGA_PORTABLE_DATA_DIR_NAME"],
    `${APP_PRODUCT_NAME} Data`,
);

export const LEGACY_USER_DATA_DIR_NAMES = ["manga-helper-userdata"];
export const LEGACY_ROAMING_CONFIG_DIR_NAMES = ["manga-helper"];
export const LEGACY_LOCAL_DATA_DIR_NAMES = ["Manga Helper"];
export const LEGACY_PORTABLE_DATA_DIR_NAMES = ["Manga Helper Data"];

const MANAGED_DATA_FILE_NAMES = [
    "authors.json",
    "mangas.json",
    "ocr-runtime.json",
    "params.json",
    "scraper-bookmarks.json",
    "scraper-reader-progress.json",
    "scraper-view-history.json",
    "scrapers.json",
    "series.json",
    "tags.json",
];

const pathExists = (targetPath: string): boolean => {
    try {
        return fs.existsSync(targetPath);
    } catch {
        return false;
    }
};

const getLegacyUserDataCandidates = (localAppData: string): string[] => {
    const appData = app.getPath("appData");

    return [
        ...LEGACY_USER_DATA_DIR_NAMES.map((dirName) => path.join(localAppData, dirName)),
        ...LEGACY_ROAMING_CONFIG_DIR_NAMES.map((dirName) => path.join(appData, dirName)),
    ];
};

const hasLegacyRootData = (basePath: string): boolean => (
    MANAGED_DATA_FILE_NAMES.some((fileName) => pathExists(path.join(basePath, fileName)))
);

const hasManagedDataDirectoryContent = (basePath: string): boolean => {
    const dataPath = path.join(basePath, "data");
    if (!pathExists(dataPath)) {
        return false;
    }

    try {
        return fs.readdirSync(dataPath, { withFileTypes: true }).some((entry) => (
            entry.isFile()
            && (
                MANAGED_DATA_FILE_NAMES.includes(entry.name)
            )
        ));
    } catch {
        return false;
    }
};

const hasLegacyManagedData = (basePath: string): boolean => (
    hasManagedDataDirectoryContent(basePath) || hasLegacyRootData(basePath)
);

const findLegacyUserDataDirectory = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
        if (hasLegacyManagedData(candidate)) {
            return candidate;
        }
    }

    return null;
};

const copyManagedFilesIntoDataDirectory = (
    sourceBasePath: string,
    userDataPath: string,
): void => {
    const targetDataPath = path.join(userDataPath, "data");
    fs.mkdirSync(targetDataPath, { recursive: true });

    for (const fileName of MANAGED_DATA_FILE_NAMES) {
        const sourcePath = path.join(sourceBasePath, fileName);
        const targetPath = path.join(targetDataPath, fileName);

        if (!pathExists(sourcePath) || pathExists(targetPath)) {
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
    }
};

const migrateLegacyUserDataDirectory = (userDataPath: string, localAppData: string): void => {
    if (hasLegacyManagedData(userDataPath)) {
        return;
    }

    const legacyUserDataPath = findLegacyUserDataDirectory(getLegacyUserDataCandidates(localAppData));
    if (!legacyUserDataPath) {
        return;
    }

    const legacyDataPath = path.join(legacyUserDataPath, "data");
    const targetDataPath = path.join(userDataPath, "data");

    fs.mkdirSync(userDataPath, { recursive: true });

    if (pathExists(legacyDataPath)) {
        copyManagedFilesIntoDataDirectory(legacyDataPath, userDataPath);
    }

    copyManagedFilesIntoDataDirectory(legacyUserDataPath, userDataPath);
    console.info(`Migrated legacy managed data from ${legacyUserDataPath} to ${userDataPath}`);
};

export const configureApplicationIdentity = (): void => {
    app.setName(APP_PRODUCT_NAME);

    if (process.platform === "win32") {
        app.setAppUserModelId(APP_ID);
    }

    const localAppData = process.env.LOCALAPPDATA || app.getPath("appData");
    const userDataPath = path.join(localAppData, APP_USER_DATA_DIR_NAME);

    try {
        fs.mkdirSync(userDataPath, { recursive: true });
        migrateLegacyUserDataDirectory(userDataPath, localAppData);
        app.setPath("userData", userDataPath);
    } catch (error) {
        console.warn("Could not set custom userData path:", error);
    }
};
