import { Manga } from "@/renderer/types";

export type MangaSourceTarget = {
  scraperId?: string | null;
  sourceUrl?: string | null;
  sourceChapterUrl?: string | null;
  sourceChapterLabel?: string | null;
};

const normalizeOptionalText = (value?: string | null): string => (
  typeof value === "string" ? value.trim() : ""
);

export const hasLocalMangaPath = (manga?: Manga | null): boolean => (
  typeof manga?.path === "string" && manga.path.trim().length > 0
);

export const normalizeMangaSourceUrl = (value?: string | null): string => {
  const trimmedValue = normalizeOptionalText(value);
  if (!trimmedValue) {
    return "";
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    return trimmedValue;
  }
};

export const getMangaSourceUrl = (manga: Manga): string => (
  normalizeMangaSourceUrl(manga.sourceUrl || manga.sourceChapterUrl || null)
);

const isSameSourceChapter = (
  manga: Manga,
  target: MangaSourceTarget,
): boolean => {
  const targetChapterUrl = normalizeMangaSourceUrl(target.sourceChapterUrl);
  const targetChapterLabel = normalizeOptionalText(target.sourceChapterLabel);
  const mangaChapterUrl = normalizeMangaSourceUrl(manga.sourceChapterUrl);
  const mangaChapterLabel = normalizeOptionalText(manga.sourceChapterLabel || manga.chapters || null);

  if (!targetChapterUrl && !targetChapterLabel) {
    return !mangaChapterUrl && !normalizeOptionalText(manga.sourceChapterLabel || null);
  }

  if (targetChapterUrl && mangaChapterUrl === targetChapterUrl) {
    return true;
  }

  return Boolean(targetChapterLabel && mangaChapterLabel === targetChapterLabel);
};

export const findMangaLinkedToSource = (
  mangas: Manga[],
  target: MangaSourceTarget,
): Manga | null => {
  const scraperId = normalizeOptionalText(target.scraperId);
  const sourceUrl = normalizeMangaSourceUrl(target.sourceUrl);

  if (!scraperId || !sourceUrl) {
    return null;
  }

  return mangas.find((manga) => (
    normalizeOptionalText(manga.scraperId) === scraperId
    && normalizeMangaSourceUrl(manga.sourceUrl) === sourceUrl
    && isSameSourceChapter(manga, target)
  )) ?? null;
};

export const findLocalMangaLinkedToSource = (
  mangas: Manga[],
  target: MangaSourceTarget,
): Manga | null => (
  mangas.find((manga) => (
    hasLocalMangaPath(manga)
    && findMangaLinkedToSource([manga], target) !== null
  )) ?? null
);

export const findRemoteMangaLinkedToSource = (
  mangas: Manga[],
  target: MangaSourceTarget,
): Manga | null => (
  mangas.find((manga) => (
    !hasLocalMangaPath(manga)
    && findMangaLinkedToSource([manga], target) !== null
  )) ?? null
);
