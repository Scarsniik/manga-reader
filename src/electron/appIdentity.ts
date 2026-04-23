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

const pathExists = (targetPath: string): boolean => {
    try {
        return fs.existsSync(targetPath);
    } catch {
        return false;
    }
};

const findExistingDirectory = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
        if (pathExists(candidate)) {
            return candidate;
        }
    }

    return null;
};

const getLegacyUserDataCandidates = (localAppData: string): string[] => {
    const appData = app.getPath("appData");

    return [
        ...LEGACY_USER_DATA_DIR_NAMES.map((dirName) => path.join(localAppData, dirName)),
        ...LEGACY_ROAMING_CONFIG_DIR_NAMES.map((dirName) => path.join(appData, dirName)),
    ];
};

const findLegacyUserDataDirectory = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
        const mangasPath = path.join(candidate, "data", "mangas.json");
        if (pathExists(mangasPath)) {
            return candidate;
        }
    }

    return null;
};

const migrateLegacyUserDataDirectory = (userDataPath: string, localAppData: string): void => {
    const targetDataPath = path.join(userDataPath, "data");
    const targetMangasPath = path.join(targetDataPath, "mangas.json");

    if (pathExists(targetMangasPath)) {
        return;
    }

    const legacyUserDataPath = findLegacyUserDataDirectory(getLegacyUserDataCandidates(localAppData));
    if (!legacyUserDataPath) {
        return;
    }

    fs.mkdirSync(userDataPath, { recursive: true });
    fs.cpSync(legacyUserDataPath, userDataPath, { recursive: true, force: true });
    console.info(`Migrated user data from ${legacyUserDataPath} to ${userDataPath}`);
};

export const configureApplicationIdentity = (): void => {
    app.setName(APP_PRODUCT_NAME);

    if (process.platform === "win32") {
        app.setAppUserModelId(APP_ID);
    }

    const localAppData = process.env.LOCALAPPDATA || app.getPath("appData");
    const userDataPath = path.join(localAppData, APP_USER_DATA_DIR_NAME);
    const legacyUserDataPath = findExistingDirectory(
        getLegacyUserDataCandidates(localAppData),
    );

    try {
        if (!pathExists(userDataPath)) {
            if (legacyUserDataPath) {
                fs.cpSync(legacyUserDataPath, userDataPath, { recursive: true });
                console.info(`Migrated user data from ${legacyUserDataPath} to ${userDataPath}`);
            } else {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
        }

        migrateLegacyUserDataDirectory(userDataPath, localAppData);
        app.setPath("userData", userDataPath);
    } catch (error) {
        console.warn("Could not set custom userData path:", error);
    }
};
