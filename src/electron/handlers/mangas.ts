import { IpcMainInvokeEvent } from "electron";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { listImageFiles } from "./pages";
import { ensureDataDir, ensureThumbnailsDir, mangasFilePath, thumbnailsDir } from "../utils";

const THUMBNAIL_EXTENSION = ".webp";
const THUMBNAIL_WIDTH = 320;

function sanitizeFileSegment(value: string) {
    const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
    return sanitized || "manga";
}

function getThumbnailPathForMangaId(mangaId: string) {
    return path.join(
        thumbnailsDir,
        `${sanitizeFileSegment(String(mangaId))}${THUMBNAIL_EXTENSION}`,
    );
}

async function pathExists(targetPath?: string | null) {
    if (!targetPath) {
        return false;
    }

    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function removeFileIfExists(targetPath?: string | null) {
    if (!targetPath) {
        return;
    }

    try {
        await fs.rm(targetPath, { force: true });
    } catch (error) {
        console.warn("Failed to remove thumbnail file", targetPath, error);
    }
}

async function getFirstMangaImagePath(manga: any) {
    if (!manga?.path || typeof manga.path !== "string") {
        return null;
    }

    try {
        const imageFiles = await listImageFiles(manga.path);
        return imageFiles[0] || null;
    } catch (error) {
        console.warn("Failed to list image files for thumbnail generation", manga.path, error);
        return null;
    }
}

async function writeStoredThumbnail(
    mangaId: string,
    source: string | Buffer,
) {
    const thumbnailPath = getThumbnailPathForMangaId(String(mangaId));
    await ensureThumbnailsDir();
    await removeFileIfExists(thumbnailPath);

    await sharp(source)
        .rotate()
        .resize({
            width: THUMBNAIL_WIDTH,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toFile(thumbnailPath);

    return thumbnailPath;
}

export async function createStoredThumbnailForManga(manga: any) {
    if (!manga?.id) {
        return null;
    }

    const sourceImagePath = await getFirstMangaImagePath(manga);
    if (!sourceImagePath) {
        return null;
    }

    return writeStoredThumbnail(String(manga.id), sourceImagePath);
}

export async function createStoredThumbnailForMangaFromBuffer(
    mangaId: string,
    sourceBuffer: Buffer,
) {
    if (!mangaId || !sourceBuffer?.length) {
        return null;
    }

    return writeStoredThumbnail(mangaId, sourceBuffer);
}

export async function ensureStoredThumbnailForManga(
    manga: any,
    options?: { forceRegenerate?: boolean },
) {
    if (!manga || typeof manga !== "object") {
        return { manga, changed: false };
    }

    const storedThumbnailPath = typeof manga.thumbnailPath === "string" && manga.thumbnailPath.trim().length > 0
        ? manga.thumbnailPath
        : null;

    if (!manga.id) {
        const nextThumbnailPath = null;
        const changed = storedThumbnailPath !== nextThumbnailPath;
        return {
            manga: changed ? { ...manga, thumbnailPath: nextThumbnailPath } : manga,
            changed,
        };
    }

    const expectedThumbnailPath = getThumbnailPathForMangaId(String(manga.id));
    let nextThumbnailPath: string | null = null;

    if (options?.forceRegenerate) {
        await removeFileIfExists(expectedThumbnailPath);
        if (storedThumbnailPath && storedThumbnailPath !== expectedThumbnailPath) {
            await removeFileIfExists(storedThumbnailPath);
        }
    }

    const hasExpectedThumbnail = await pathExists(expectedThumbnailPath);
    if (hasExpectedThumbnail && !options?.forceRegenerate) {
        nextThumbnailPath = expectedThumbnailPath;
    } else {
        try {
            nextThumbnailPath = await createStoredThumbnailForManga(manga);
        } catch (error) {
            console.warn("Failed to generate manga thumbnail", manga?.id, error);
            nextThumbnailPath = null;
        }
    }

    if (
        storedThumbnailPath
        && storedThumbnailPath !== nextThumbnailPath
        && storedThumbnailPath !== expectedThumbnailPath
    ) {
        await removeFileIfExists(storedThumbnailPath);
    }

    const changed = storedThumbnailPath !== nextThumbnailPath;
    return {
        manga: changed ? { ...manga, thumbnailPath: nextThumbnailPath } : manga,
        changed,
    };
}

async function hydrateMangasWithStoredThumbnails(mangas: any[]) {
    let hasChanges = false;
    const hydratedMangas: any[] = [];

    for (const manga of mangas) {
        const { manga: hydratedManga, changed } = await ensureStoredThumbnailForManga(manga);
        hydratedMangas.push(hydratedManga);
        if (changed) {
            hasChanges = true;
        }
    }

    return { mangas: hydratedMangas, changed: hasChanges };
}

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
    const mangas = await getMangas();
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
        const mangas = await readMangasFile();
        const { mangas: hydratedMangas, changed } = await hydrateMangasWithStoredThumbnails(mangas);

        if (changed) {
            await writeMangasFile(hydratedMangas);
        }

        return hydratedMangas;
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
        const { manga: mangaWithThumbnail } = await ensureStoredThumbnailForManga(manga, {
            forceRegenerate: true,
        });
        mangas.push(mangaWithThumbnail);
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
        const mangaToRemove = mangas.find(m => String(m.id) === String(mangaId)) || null;
        const updated = mangas.filter(m => String(m.id) !== String(mangaId));
        const expectedThumbnailPath = getThumbnailPathForMangaId(String(mangaId));
        await removeFileIfExists(expectedThumbnailPath);
        if (mangaToRemove?.thumbnailPath && mangaToRemove.thumbnailPath !== expectedThumbnailPath) {
            await removeFileIfExists(mangaToRemove.thumbnailPath);
        }
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

        const previousManga = mangas[idx];
        const mergedManga = { ...previousManga, ...updatedManga };
        const shouldRegenerateThumbnail = typeof updatedManga?.path === "string"
            && updatedManga.path !== previousManga?.path;
        const { manga: mangaWithThumbnail } = await ensureStoredThumbnailForManga(mergedManga, {
            forceRegenerate: shouldRegenerateThumbnail,
        });

        mangas[idx] = mangaWithThumbnail;

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
