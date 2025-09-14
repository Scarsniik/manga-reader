import { promises as fs } from "fs";
import { ensureDataDir, tagsFilePath } from "../utils";
import { IpcMainInvokeEvent } from "electron";

export async function getTags() {
    try {
        const data = await fs.readFile(tagsFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            await ensureDataDir();
            await fs.writeFile(tagsFilePath, JSON.stringify([], null, 2));
            return [];
        }
        console.error("Error reading tags file:", error);
        throw new Error("Failed to read tags");
    }
}

export async function addTag(event: IpcMainInvokeEvent, tag: any) {
    try {
        let tags: any[] = [];
        try {
            const data = await fs.readFile(tagsFilePath, "utf-8");
            tags = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") tags = [];
            else throw err;
        }
        tags.push(tag);
        await ensureDataDir();
        await fs.writeFile(tagsFilePath, JSON.stringify(tags, null, 2));
        return tags;
    } catch (error) {
        console.error("Error adding tag:", error);
        throw new Error("Failed to add tag");
    }
}

export async function removeTag(event: IpcMainInvokeEvent, tagId: string) {
    try {
        let tags: any[] = [];
        try {
            const data = await fs.readFile(tagsFilePath, "utf-8");
            tags = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") tags = [];
            else throw err;
        }
        const updated = tags.filter(t => String(t.id) !== String(tagId));
        await ensureDataDir();
        await fs.writeFile(tagsFilePath, JSON.stringify(updated, null, 2));
        return updated;
    } catch (error) {
        console.error("Error removing tag:", error);
        throw new Error("Failed to remove tag");
    }
}

export async function updateTag(event: IpcMainInvokeEvent, updatedTag: any) {
    try {
        let tags: any[] = [];
        try {
            const data = await fs.readFile(tagsFilePath, "utf-8");
            tags = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") tags = [];
            else throw err;
        }
        const idx = tags.findIndex(t => String(t.id) === String(updatedTag.id));
        if (idx === -1) throw new Error("Tag not found");
        tags[idx] = { ...tags[idx], ...updatedTag };
        await ensureDataDir();
        await fs.writeFile(tagsFilePath, JSON.stringify(tags, null, 2));
        return tags;
    } catch (error) {
        console.error("Error updating tag:", error);
        throw new Error("Failed to update tag");
    }
}
