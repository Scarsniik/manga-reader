import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { IpcMainInvokeEvent } from "electron";
import { ensureDataDir, seriesFilePath } from "../utils";

type SeriesRecord = {
    id: string;
    title: string;
};

const sanitizeSeriesRecord = (value: unknown): SeriesRecord | null => {
    if (!value || typeof value !== "object") {
        return null;
    }

    const raw = value as Record<string, unknown>;
    const id = String(raw.id ?? "").trim();
    const title = String(raw.title ?? "").trim();

    if (!id || !title) {
        return null;
    }

    return {
        id,
        title,
    };
};

const normalizeSeriesTitle = (value: string): string => value.trim().replace(/\s+/g, " ");

const findSeriesByTitle = (list: SeriesRecord[], title: string): SeriesRecord | null => {
    const normalizedTitle = normalizeSeriesTitle(title).toLocaleLowerCase();

    return list.find((series) => (
        normalizeSeriesTitle(series.title).toLocaleLowerCase() === normalizedTitle
    )) || null;
};

export async function readSeriesFile(): Promise<SeriesRecord[]> {
    try {
        const data = await fs.readFile(seriesFilePath, "utf-8");
        const parsed = JSON.parse(data);
        const sanitized = Array.isArray(parsed)
            ? parsed
                .map((entry) => sanitizeSeriesRecord(entry))
                .filter((entry): entry is SeriesRecord => Boolean(entry))
            : [];

        const normalizedRaw = JSON.stringify(parsed, null, 2);
        const normalizedSanitized = JSON.stringify(sanitized, null, 2);
        if (normalizedRaw !== normalizedSanitized) {
            await ensureDataDir();
            await fs.writeFile(seriesFilePath, normalizedSanitized);
        }

        return sanitized;
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            await ensureDataDir();
            await fs.writeFile(seriesFilePath, JSON.stringify([], null, 2));
            return [];
        }
        console.error("Error reading series file:", error);
        throw new Error("Failed to read series");
    }
}

export async function writeSeriesFile(list: SeriesRecord[]) {
    const sanitized = list
        .map((entry) => sanitizeSeriesRecord(entry))
        .filter((entry): entry is SeriesRecord => Boolean(entry));

    await ensureDataDir();
    await fs.writeFile(seriesFilePath, JSON.stringify(sanitized, null, 2));
    return sanitized;
}

export async function ensureSeriesByTitle(title: string): Promise<SeriesRecord> {
    const normalizedTitle = normalizeSeriesTitle(title);
    if (!normalizedTitle) {
        throw new Error("Series title is required");
    }

    const list = await readSeriesFile();
    const existing = findSeriesByTitle(list, normalizedTitle);
    if (existing) {
        return existing;
    }

    const created: SeriesRecord = {
        id: randomUUID(),
        title: normalizedTitle,
    };

    await writeSeriesFile([
        ...list,
        created,
    ]);

    return created;
}

export async function getSeries() {
    return readSeriesFile();
}

export async function addSeries(event: IpcMainInvokeEvent, seriesItem: any) {
    try {
        const list = await readSeriesFile();
        const sanitized = sanitizeSeriesRecord(seriesItem);

        if (!sanitized) {
            throw new Error("Series is invalid");
        }

        return writeSeriesFile([
            ...list,
            sanitized,
        ]);
    } catch (error) {
        console.error("Error adding series:", error);
        throw new Error("Failed to add series");
    }
}

export async function removeSeries(event: IpcMainInvokeEvent, seriesId: string) {
    try {
        const list = await readSeriesFile();
        const updated = list.filter(s => String(s.id) !== String(seriesId));
        return writeSeriesFile(updated);
    } catch (error) {
        console.error("Error removing series:", error);
        throw new Error("Failed to remove series");
    }
}

export async function updateSeries(event: IpcMainInvokeEvent, updatedSeries: any) {
    try {
        const list = await readSeriesFile();
        const sanitized = sanitizeSeriesRecord(updatedSeries);
        if (!sanitized) {
            throw new Error("Series is invalid");
        }

        const idx = list.findIndex(s => String(s.id) === String(updatedSeries.id));
        if (idx === -1) throw new Error("Series not found");
        list[idx] = sanitized;
        return writeSeriesFile(list);
    } catch (error) {
        console.error("Error updating series:", error);
        throw new Error("Failed to update series");
    }
}
