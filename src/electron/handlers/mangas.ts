import { IpcMainInvokeEvent } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { ensureDataDir, mangasFilePath } from "../utils";

export async function readMangasFile() {
    try {
        const data = await fs.readFile(mangasFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

export async function writeMangasFile(mangas: any[]) {
    await ensureDataDir();
    await fs.writeFile(mangasFilePath, JSON.stringify(mangas, null, 2));
    return mangas;
}

export async function getMangaById(mangaId: string) {
    const mangas = await readMangasFile();
    return mangas.find((m: any) => String(m.id) === String(mangaId)) || null;
}

export async function patchMangaById(mangaId: string, patch: Record<string, any>) {
    const mangas = await readMangasFile();
    const idx = mangas.findIndex((m: any) => String(m.id) === String(mangaId));
    if (idx === -1) {
        throw new Error("Manga not found");
    }

    mangas[idx] = { ...mangas[idx], ...(patch || {}) };
    await writeMangasFile(mangas);
    return mangas[idx];
}

export async function getMangas() {
    try {
        return await readMangasFile();
    } catch (error: any) {
        if (error && error.code === "ENOENT") {
            await ensureDataDir();
            await fs.writeFile(mangasFilePath, JSON.stringify([], null, 2));
            return [];
        }
        console.error("Error reading mangas file:", error);
        throw new Error("Failed to read mangas");
    }
}

export async function addManga(event: IpcMainInvokeEvent, manga: any) {
    try {
        const mangas: any[] = await readMangasFile();
        if (manga && manga.path) {
            const resolvedPath = path.isAbsolute(manga.path) ? manga.path : path.resolve(manga.path);
            manga.path = resolvedPath;
            try {
                const stat = await fs.stat(resolvedPath);
                if (!stat.isDirectory()) {
                    console.warn("add-manga: provided path is not a directory:", resolvedPath);
                }
            } catch (e) {
                console.warn("add-manga: provided path does not exist:", resolvedPath);
            }
        }
        mangas.push(manga);
        await writeMangasFile(mangas);
        return mangas;
    } catch (error) {
        console.error("Error adding manga:", error);
        throw new Error("Failed to add manga");
    }
}

export async function removeManga(event: IpcMainInvokeEvent, mangaId: string) {
    try {
        const mangas: any[] = await readMangasFile();
        const updated = mangas.filter(m => m.id !== mangaId);
        await writeMangasFile(updated);
        return updated;
    } catch (error) {
        console.error("Error removing manga:", error);
        throw new Error("Failed to remove manga");
    }
}

export async function updateManga(event: IpcMainInvokeEvent, updatedManga: any) {
    try {
        const mangas: any[] = await readMangasFile();

        const idx = mangas.findIndex(m => String(m.id) === String(updatedManga.id));
        if (idx === -1) {
            throw new Error("Manga not found");
        }

        if (updatedManga && updatedManga.path) {
            const resolvedPath = path.isAbsolute(updatedManga.path) ? updatedManga.path : path.resolve(updatedManga.path);
            updatedManga.path = resolvedPath;
            try {
                const stat = await fs.stat(resolvedPath);
                if (!stat.isDirectory()) {
                    console.warn("update-manga: provided path is not a directory:", resolvedPath);
                }
            } catch (e) {
                console.warn("update-manga: provided path does not exist:", resolvedPath);
            }
        }

        mangas[idx] = { ...mangas[idx], ...updatedManga };

        await writeMangasFile(mangas);
        return mangas;
    } catch (error) {
        console.error("Error updating manga:", error);
        throw new Error("Failed to update manga");
    }
}

export async function batchUpdateTags(event: IpcMainInvokeEvent, payload: {
    mangaIds: string[];
    language?: string | null;
    authorId?: string;
    seriesId?: string;
    clearAuthor?: boolean;
    clearSeries?: boolean;
    addTagIds?: string[];
    removeTagIds?: string[]
}) {
    try {
        const {
            mangaIds = [],
            language = null,
            authorId,
            seriesId,
            clearAuthor = false,
            clearSeries = false,
            addTagIds = [],
            removeTagIds = [],
        } = payload || {};
        let mangas: any[] = await readMangasFile();

        const failed: { id: string; reason: string }[] = [];
        let updatedCount = 0;

        for (const id of mangaIds) {
            const idx = mangas.findIndex(m => String(m.id) === String(id));
            if (idx === -1) {
                failed.push({ id, reason: 'not_found' });
                continue;
            }
            const m = mangas[idx];
            const currentTags: string[] = Array.isArray(m.tagIds) ? [...m.tagIds] : [];

            // Add tags (ensure uniqueness)
            for (const t of addTagIds || []) {
                if (!currentTags.includes(t)) currentTags.push(t);
            }

            // Remove tags
            const nextTags = currentTags.filter(t => !(removeTagIds || []).includes(t));

            // Update language if provided
            if (language !== null) {
                m.language = language || undefined;
            }

            if (clearAuthor) {
                m.authorIds = [];
            } else if (typeof authorId === 'string' && authorId.length > 0) {
                m.authorIds = [authorId];
            }

            if (clearSeries) {
                m.seriesId = null;
            } else if (typeof seriesId === 'string' && seriesId.length > 0) {
                m.seriesId = seriesId;
            }

            mangas[idx] = { ...m, tagIds: nextTags };
            updatedCount++;
        }

        await writeMangasFile(mangas);

        return { success: true, updatedCount, failed };
    } catch (error) {
        console.error('Error in batchUpdateTags:', error);
        return { success: false, updatedCount: 0, failed: [] };
    }
}
