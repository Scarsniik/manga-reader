import path from "path";
import { app } from "electron";
import { dataDir } from "../../utils";
import { OCR_RUNTIME_CONFIG_FILE_NAME } from "./constants";

const getPortableDataDir = () => {
    const executableDir = app.isPackaged
        ? path.dirname(process.execPath)
        : app.getAppPath();
    return path.join(executableDir, "Manga Helper Data");
};

export const getOcrRuntimeConfigPath = () => path.join(dataDir, OCR_RUNTIME_CONFIG_FILE_NAME);
export const getPortableOcrRuntimeConfigPath = () => path.join(getPortableDataDir(), OCR_RUNTIME_CONFIG_FILE_NAME);

export const getDefaultOcrRuntimePath = () => path.join(
    process.env.LOCALAPPDATA || app.getPath("appData"),
    "Manga Helper",
    "ocr-runtime",
);

export const getPortableOcrRuntimePath = () => path.join(getPortableDataDir(), "ocr-runtime");
