import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";

const APP_UPDATE_LOG_FILE_NAME = "app-update-last.log";

const getAppUpdateLogDirectory = () => path.join(app.getPath("userData"), "data");

export const getAppUpdateLogFilePath = () => (
    path.join(getAppUpdateLogDirectory(), APP_UPDATE_LOG_FILE_NAME)
);

const ensureAppUpdateLogDirectory = async () => {
    await fs.mkdir(getAppUpdateLogDirectory(), { recursive: true });
};

export const appendAppUpdateLog = async (message: string, details?: unknown) => {
    await ensureAppUpdateLogDirectory();

    const formattedDetails = details === undefined
        ? ""
        : ` ${JSON.stringify(details)}`;

    await fs.appendFile(
        getAppUpdateLogFilePath(),
        `[${new Date().toISOString()}] ${message}${formattedDetails}\n`,
        "utf-8",
    );
};
