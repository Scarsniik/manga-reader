"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApplicationIdentity = exports.LEGACY_PORTABLE_DATA_DIR_NAMES = exports.LEGACY_LOCAL_DATA_DIR_NAMES = exports.LEGACY_ROAMING_CONFIG_DIR_NAMES = exports.LEGACY_USER_DATA_DIR_NAMES = exports.APP_PORTABLE_DATA_DIR_NAME = exports.APP_LOCAL_DATA_DIR_NAME = exports.APP_ROAMING_CONFIG_DIR_NAME = exports.APP_USER_DATA_DIR_NAME = exports.APP_ID = exports.APP_PACKAGE_NAME = exports.APP_PRODUCT_NAME = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const DEFAULT_PRODUCT_NAME = "Scaramanga";
const DEFAULT_PACKAGE_NAME = "scaramanga";
const getEnvValue = (names, fallback) => {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return fallback;
};
const sanitizePackageName = (value) => {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || DEFAULT_PACKAGE_NAME;
};
exports.APP_PRODUCT_NAME = getEnvValue(["APP_PRODUCT_NAME", "SCARAMANGA_PRODUCT_NAME"], DEFAULT_PRODUCT_NAME);
exports.APP_PACKAGE_NAME = getEnvValue(["APP_PACKAGE_NAME", "SCARAMANGA_PACKAGE_NAME"], sanitizePackageName(exports.APP_PRODUCT_NAME));
exports.APP_ID = getEnvValue(["APP_ID", "SCARAMANGA_APP_ID"], "com.scarsniik.scaramanga");
exports.APP_USER_DATA_DIR_NAME = getEnvValue(["APP_USER_DATA_DIR_NAME", "SCARAMANGA_USER_DATA_DIR_NAME"], `${exports.APP_PACKAGE_NAME}-userdata`);
exports.APP_ROAMING_CONFIG_DIR_NAME = getEnvValue(["APP_ROAMING_CONFIG_DIR_NAME", "SCARAMANGA_ROAMING_CONFIG_DIR_NAME"], exports.APP_PACKAGE_NAME);
exports.APP_LOCAL_DATA_DIR_NAME = getEnvValue(["APP_LOCAL_DATA_DIR_NAME", "SCARAMANGA_LOCAL_DATA_DIR_NAME"], exports.APP_PRODUCT_NAME);
exports.APP_PORTABLE_DATA_DIR_NAME = getEnvValue(["APP_PORTABLE_DATA_DIR_NAME", "SCARAMANGA_PORTABLE_DATA_DIR_NAME"], `${exports.APP_PRODUCT_NAME} Data`);
exports.LEGACY_USER_DATA_DIR_NAMES = ["manga-helper-userdata"];
exports.LEGACY_ROAMING_CONFIG_DIR_NAMES = ["manga-helper"];
exports.LEGACY_LOCAL_DATA_DIR_NAMES = ["Manga Helper"];
exports.LEGACY_PORTABLE_DATA_DIR_NAMES = ["Manga Helper Data"];
const pathExists = (targetPath) => {
    try {
        return fs_1.default.existsSync(targetPath);
    }
    catch {
        return false;
    }
};
const findExistingDirectory = (candidates) => {
    for (const candidate of candidates) {
        if (pathExists(candidate)) {
            return candidate;
        }
    }
    return null;
};
const getLegacyUserDataCandidates = (localAppData) => {
    const appData = electron_1.app.getPath("appData");
    return [
        ...exports.LEGACY_USER_DATA_DIR_NAMES.map((dirName) => path_1.default.join(localAppData, dirName)),
        ...exports.LEGACY_ROAMING_CONFIG_DIR_NAMES.map((dirName) => path_1.default.join(appData, dirName)),
    ];
};
const findLegacyUserDataDirectory = (candidates) => {
    for (const candidate of candidates) {
        const mangasPath = path_1.default.join(candidate, "data", "mangas.json");
        if (pathExists(mangasPath)) {
            return candidate;
        }
    }
    return null;
};
const migrateLegacyUserDataDirectory = (userDataPath, localAppData) => {
    const targetDataPath = path_1.default.join(userDataPath, "data");
    const targetMangasPath = path_1.default.join(targetDataPath, "mangas.json");
    if (pathExists(targetMangasPath)) {
        return;
    }
    const legacyUserDataPath = findLegacyUserDataDirectory(getLegacyUserDataCandidates(localAppData));
    if (!legacyUserDataPath) {
        return;
    }
    fs_1.default.mkdirSync(userDataPath, { recursive: true });
    fs_1.default.cpSync(legacyUserDataPath, userDataPath, { recursive: true, force: true });
    console.info(`Migrated user data from ${legacyUserDataPath} to ${userDataPath}`);
};
const configureApplicationIdentity = () => {
    electron_1.app.setName(exports.APP_PRODUCT_NAME);
    if (process.platform === "win32") {
        electron_1.app.setAppUserModelId(exports.APP_ID);
    }
    const localAppData = process.env.LOCALAPPDATA || electron_1.app.getPath("appData");
    const userDataPath = path_1.default.join(localAppData, exports.APP_USER_DATA_DIR_NAME);
    const legacyUserDataPath = findExistingDirectory(getLegacyUserDataCandidates(localAppData));
    try {
        if (!pathExists(userDataPath)) {
            if (legacyUserDataPath) {
                fs_1.default.cpSync(legacyUserDataPath, userDataPath, { recursive: true });
                console.info(`Migrated user data from ${legacyUserDataPath} to ${userDataPath}`);
            }
            else {
                fs_1.default.mkdirSync(userDataPath, { recursive: true });
            }
        }
        migrateLegacyUserDataDirectory(userDataPath, localAppData);
        electron_1.app.setPath("userData", userDataPath);
    }
    catch (error) {
        console.warn("Could not set custom userData path:", error);
    }
};
exports.configureApplicationIdentity = configureApplicationIdentity;
