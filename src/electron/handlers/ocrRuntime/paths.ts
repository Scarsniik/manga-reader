import path from "path";
import { app } from "electron";
import {
    APP_LOCAL_DATA_DIR_NAME,
    APP_PORTABLE_DATA_DIR_NAME,
    LEGACY_LOCAL_DATA_DIR_NAMES,
    LEGACY_PORTABLE_DATA_DIR_NAMES,
} from "../../appIdentity";
import { dataDir } from "../../utils";
import { OCR_RUNTIME_CONFIG_FILE_NAME } from "./constants";

const getPortableDataDir = () => {
    const executableDir = app.isPackaged
        ? path.dirname(process.execPath)
        : app.getAppPath();
    return path.join(executableDir, APP_PORTABLE_DATA_DIR_NAME);
};

export const getOcrRuntimeConfigPath = () => path.join(dataDir, OCR_RUNTIME_CONFIG_FILE_NAME);
export const getPortableOcrRuntimeConfigPath = () => path.join(getPortableDataDir(), OCR_RUNTIME_CONFIG_FILE_NAME);

export const getDefaultOcrRuntimePath = () => path.join(
    process.env.LOCALAPPDATA || app.getPath("appData"),
    APP_LOCAL_DATA_DIR_NAME,
    "ocr-runtime",
);

export const getPortableOcrRuntimePath = () => path.join(getPortableDataDir(), "ocr-runtime");

export const getLegacyDefaultOcrRuntimePaths = () => LEGACY_LOCAL_DATA_DIR_NAMES.map((dirName) => path.join(
    process.env.LOCALAPPDATA || app.getPath("appData"),
    dirName,
    "ocr-runtime",
));

export const getLegacyPortableOcrRuntimePaths = () => {
    const executableDir = app.isPackaged
        ? path.dirname(process.execPath)
        : app.getAppPath();

    return LEGACY_PORTABLE_DATA_DIR_NAMES.map((dirName) => path.join(executableDir, dirName, "ocr-runtime"));
};
