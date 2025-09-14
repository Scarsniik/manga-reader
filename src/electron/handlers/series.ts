import { promises as fs } from "fs";
import { ensureDataDir, seriesFilePath } from "../utils";
import { IpcMainInvokeEvent } from "electron";

export async function getSeries() {
    try {
        const data = await fs.readFile(seriesFilePath, "utf-8");
        return JSON.parse(data);
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

export async function addSeries(event: IpcMainInvokeEvent, seriesItem: any) {
    try {
        let list: any[] = [];
        try {
            const data = await fs.readFile(seriesFilePath, "utf-8");
            list = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") list = [];
            else throw err;
        }
        list.push(seriesItem);
        await ensureDataDir();
        await fs.writeFile(seriesFilePath, JSON.stringify(list, null, 2));
        return list;
    } catch (error) {
        console.error("Error adding series:", error);
        throw new Error("Failed to add series");
    }
}

export async function removeSeries(event: IpcMainInvokeEvent, seriesId: string) {
    try {
        let list: any[] = [];
        try {
            const data = await fs.readFile(seriesFilePath, "utf-8");
            list = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") list = [];
            else throw err;
        }
        const updated = list.filter(s => String(s.id) !== String(seriesId));
        await ensureDataDir();
        await fs.writeFile(seriesFilePath, JSON.stringify(updated, null, 2));
        return updated;
    } catch (error) {
        console.error("Error removing series:", error);
        throw new Error("Failed to remove series");
    }
}

export async function updateSeries(event: IpcMainInvokeEvent, updatedSeries: any) {
    try {
        let list: any[] = [];
        try {
            const data = await fs.readFile(seriesFilePath, "utf-8");
            list = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") list = [];
            else throw err;
        }
        const idx = list.findIndex(s => String(s.id) === String(updatedSeries.id));
        if (idx === -1) throw new Error("Series not found");
        list[idx] = { ...list[idx], ...updatedSeries };
        await ensureDataDir();
        await fs.writeFile(seriesFilePath, JSON.stringify(list, null, 2));
        return list;
    } catch (error) {
        console.error("Error updating series:", error);
        throw new Error("Failed to update series");
    }
}
