import { promises as fs } from "fs";
import { ensureDataDir, authorsFilePath } from "../utils";
import { IpcMainInvokeEvent } from "electron";

export async function getAuthors() {
    try {
        const data = await fs.readFile(authorsFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            await ensureDataDir();
            await fs.writeFile(authorsFilePath, JSON.stringify([], null, 2));
            return [];
        }
        console.error("Error reading authors file:", error);
        throw new Error("Failed to read authors");
    }
}

export async function addAuthor(event: IpcMainInvokeEvent, author: any) {
    try {
        let authors: any[] = [];
        try {
            const data = await fs.readFile(authorsFilePath, "utf-8");
            authors = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") authors = [];
            else throw err;
        }
        authors.push(author);
        await ensureDataDir();
        await fs.writeFile(authorsFilePath, JSON.stringify(authors, null, 2));
        return authors;
    } catch (error) {
        console.error("Error adding author:", error);
        throw new Error("Failed to add author");
    }
}

export async function removeAuthor(event: IpcMainInvokeEvent, authorId: string) {
    try {
        let authors: any[] = [];
        try {
            const data = await fs.readFile(authorsFilePath, "utf-8");
            authors = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") authors = [];
            else throw err;
        }
        const updated = authors.filter(a => String(a.id) !== String(authorId));
        await ensureDataDir();
        await fs.writeFile(authorsFilePath, JSON.stringify(updated, null, 2));
        return updated;
    } catch (error) {
        console.error("Error removing author:", error);
        throw new Error("Failed to remove author");
    }
}

export async function updateAuthor(event: IpcMainInvokeEvent, updatedAuthor: any) {
    try {
        let authors: any[] = [];
        try {
            const data = await fs.readFile(authorsFilePath, "utf-8");
            authors = JSON.parse(data);
        } catch (err: any) {
            if (err && err.code === "ENOENT") authors = [];
            else throw err;
        }
        const idx = authors.findIndex(a => String(a.id) === String(updatedAuthor.id));
        if (idx === -1) throw new Error("Author not found");
        authors[idx] = { ...authors[idx], ...updatedAuthor };
        await ensureDataDir();
        await fs.writeFile(authorsFilePath, JSON.stringify(authors, null, 2));
        return authors;
    } catch (error) {
        console.error("Error updating author:", error);
        throw new Error("Failed to update author");
    }
}
