import { Manga } from '@/renderer/types';

const EXPLICIT_CHAPTER_PATTERN = /(?:chap(?:it(?:re)?)?|chapter|ch|cap(?:itulo)?|ep(?:isode)?)\s*\.?\s*([0-9]+(?:[.,][0-9]+)?)/i;
const GENERIC_CHAPTER_PATTERN = /([0-9]+(?:[.,][0-9]+)?)/g;

const normalizeChapterValue = (value: string): string => value
    .trim()
    .replace(/\s+/g, ' ');

export const extractChapterSortValue = (value?: string | null): number | null => {
    const normalizedValue = normalizeChapterValue(String(value ?? ''));
    if (!normalizedValue) {
        return null;
    }

    const explicitMatch = normalizedValue.match(EXPLICIT_CHAPTER_PATTERN);
    if (explicitMatch?.[1]) {
        const parsedValue = Number(explicitMatch[1].replace(',', '.'));
        return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    const matches = Array.from(normalizedValue.matchAll(GENERIC_CHAPTER_PATTERN));
    if (!matches.length) {
        return null;
    }

    const parsedValue = Number(matches[matches.length - 1][1].replace(',', '.'));
    return Number.isFinite(parsedValue) ? parsedValue : null;
};

export const compareSeriesMangasByChapter = (left: Manga, right: Manga): number => {
    const leftChapterNumber = extractChapterSortValue(left.chapters);
    const rightChapterNumber = extractChapterSortValue(right.chapters);

    if (leftChapterNumber !== null && rightChapterNumber !== null && leftChapterNumber !== rightChapterNumber) {
        return leftChapterNumber - rightChapterNumber;
    }

    if (leftChapterNumber !== null && rightChapterNumber === null) {
        return -1;
    }

    if (leftChapterNumber === null && rightChapterNumber !== null) {
        return 1;
    }

    const leftChapterLabel = normalizeChapterValue(String(left.chapters ?? ''));
    const rightChapterLabel = normalizeChapterValue(String(right.chapters ?? ''));
    const chapterLabelCompare = leftChapterLabel.localeCompare(
        rightChapterLabel,
        undefined,
        { numeric: true, sensitivity: 'base' },
    );

    if (chapterLabelCompare !== 0) {
        return chapterLabelCompare;
    }

    const titleCompare = String(left.title ?? '').localeCompare(
        String(right.title ?? ''),
        undefined,
        { numeric: true, sensitivity: 'base' },
    );

    if (titleCompare !== 0) {
        return titleCompare;
    }

    return String(left.id).localeCompare(String(right.id), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
};

const findAdjacentSeriesManga = (
    currentManga: Manga | null | undefined,
    mangas: Manga[],
    offset: number,
): Manga | null => {
    if (!currentManga?.seriesId) {
        return null;
    }

    const seriesMangas = mangas.filter((candidate) => candidate.seriesId === currentManga.seriesId);
    if (!seriesMangas.some((candidate) => candidate.id === currentManga.id)) {
        seriesMangas.push(currentManga);
    }

    const orderedSeriesMangas = [...seriesMangas].sort(compareSeriesMangasByChapter);
    const currentIndex = orderedSeriesMangas.findIndex((candidate) => candidate.id === currentManga.id);

    if (currentIndex < 0) {
        return null;
    }

    return orderedSeriesMangas[currentIndex + offset] ?? null;
};

export const findNextSeriesManga = (
    currentManga: Manga | null | undefined,
    mangas: Manga[],
): Manga | null => findAdjacentSeriesManga(currentManga, mangas, 1);

export const findPreviousSeriesManga = (
    currentManga: Manga | null | undefined,
    mangas: Manga[],
): Manga | null => findAdjacentSeriesManga(currentManga, mangas, -1);
