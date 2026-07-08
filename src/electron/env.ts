import { app } from "electron";
import fs from "fs";
import path from "path";

const parseDotEnvLine = (line: string): [string, string] | null => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
        return null;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) {
        return null;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        return null;
    }

    let value = trimmedLine.slice(separatorIndex + 1).trim();
    if (
        (value.startsWith("\"") && value.endsWith("\""))
        || (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }

    return [key, value];
};

const getDotEnvCandidatePaths = (): string[] => Array.from(new Set([
    path.join(process.cwd(), ".env"),
    path.join(app.getAppPath(), ".env"),
    path.join(path.dirname(process.execPath), ".env"),
]));

export const loadDotEnvFiles = (): void => {
    for (const filePath of getDotEnvCandidatePaths()) {
        if (!fs.existsSync(filePath)) {
            continue;
        }

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            content.split(/\r?\n/).forEach((line) => {
                const parsedLine = parseDotEnvLine(line);
                if (!parsedLine) {
                    return;
                }

                const [key, value] = parsedLine;
                if (typeof process.env[key] !== "string") {
                    process.env[key] = value;
                }
            });
        } catch (error) {
            console.warn(`Unable to load environment file ${filePath}`, error);
        }
    }
};

loadDotEnvFiles();
