import { Manga } from "@/renderer/types";
import { compareSeriesMangasByChapter } from "@/renderer/utils/seriesChapters";

export type EndOfReadingRecommendationOptions = {
    hiddenTagIds?: string[];
    showHiddenContent?: boolean;
    excludeStartedWithoutPageCount?: boolean;
};

const normalizeText = (value?: string | null): string => (
    typeof value === "string" ? value.trim().toLowerCase() : ""
);

const getMangaTagIds = (manga: Manga | null | undefined): string[] => {
    if (!Array.isArray(manga?.tagIds)) {
        return [];
    }

    return Array.from(new Set(
        manga.tagIds
            .map((tagId) => String(tagId).trim())
            .filter(Boolean),
    ));
};

const isSameManga = (
    left: Manga | null | undefined,
    right: Manga | null | undefined,
): boolean => Boolean(left?.id && right?.id && String(left.id) === String(right.id));

const isMangaCompleted = (manga: Manga): boolean => {
    const currentPage = typeof manga.currentPage === "number" && Number.isFinite(manga.currentPage)
        ? manga.currentPage
        : null;
    const totalPages = typeof manga.pages === "number" && Number.isFinite(manga.pages)
        ? manga.pages
        : null;

    return currentPage !== null
        && totalPages !== null
        && totalPages > 0
        && currentPage >= totalPages;
};

const hasUnknownReadingCompletion = (manga: Manga): boolean => {
    const currentPage = typeof manga.currentPage === "number" && Number.isFinite(manga.currentPage)
        ? manga.currentPage
        : null;
    const totalPages = typeof manga.pages === "number" && Number.isFinite(manga.pages)
        ? manga.pages
        : null;

    return currentPage !== null
        && currentPage > 0
        && (totalPages === null || totalPages <= 0);
};

const hasHiddenTag = (manga: Manga, hiddenTagIdSet: Set<string>): boolean => (
    getMangaTagIds(manga).some((tagId) => hiddenTagIdSet.has(tagId))
);

const getSeriesId = (manga: Manga): string => normalizeText(manga.seriesId);

const getSharedTagCount = (currentTagIds: string[], candidate: Manga): number => {
    if (currentTagIds.length === 0) {
        return 0;
    }

    const candidateTagIds = new Set(getMangaTagIds(candidate));
    return currentTagIds.reduce(
        (count, tagId) => count + (candidateTagIds.has(tagId) ? 1 : 0),
        0,
    );
};

const shuffleMangas = (mangas: Manga[]): Manga[] => {
    const shuffledMangas = [...mangas];

    for (let index = shuffledMangas.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledMangas[index], shuffledMangas[swapIndex]] = [shuffledMangas[swapIndex], shuffledMangas[index]];
    }

    return shuffledMangas;
};

const getDirectUnreadPool = (
    currentManga: Manga,
    libraryMangas: Manga[],
    options: EndOfReadingRecommendationOptions,
): Manga[] => {
    const standaloneMangas: Manga[] = [];
    const seriesMangasById = new Map<string, Manga[]>();
    const currentSeriesId = getSeriesId(currentManga);
    const hiddenTagIdSet = new Set((options.hiddenTagIds ?? []).map((tagId) => String(tagId)));
    const showHiddenContent = Boolean(options.showHiddenContent);
    const canShowManga = (candidate: Manga): boolean => (
        showHiddenContent || !hasHiddenTag(candidate, hiddenTagIdSet)
    );
    const canRecommendManga = (candidate: Manga): boolean => (
        !isMangaCompleted(candidate)
        && (!options.excludeStartedWithoutPageCount || !hasUnknownReadingCompletion(candidate))
        && canShowManga(candidate)
    );

    libraryMangas.forEach((candidate) => {
        const seriesId = getSeriesId(candidate);
        if (!seriesId) {
            if (
                !isSameManga(candidate, currentManga)
                && canRecommendManga(candidate)
            ) {
                standaloneMangas.push(candidate);
            }
            return;
        }

        if (currentSeriesId && seriesId === currentSeriesId) {
            return;
        }

        const seriesMangas = seriesMangasById.get(seriesId);
        if (seriesMangas) {
            seriesMangas.push(candidate);
            return;
        }

        seriesMangasById.set(seriesId, [candidate]);
    });

    const directSeriesMangas = Array.from(seriesMangasById.values()).reduce<Manga[]>((pool, seriesMangas) => {
        const orderedMangas = [...seriesMangas].sort(compareSeriesMangasByChapter);
        const nextUnreadManga = orderedMangas.find((candidate) => (
            !isSameManga(candidate, currentManga)
            && !isMangaCompleted(candidate)
        ));

        if (nextUnreadManga && canRecommendManga(nextUnreadManga)) {
            pool.push(nextUnreadManga);
        }

        return pool;
    }, []);

    return [...standaloneMangas, ...directSeriesMangas];
};

export const getEndOfReadingRecommendations = (
    currentManga: Manga | null,
    libraryMangas: Manga[],
    limit = 3,
    options: EndOfReadingRecommendationOptions = {},
): Manga[] => {
    if (!currentManga || !Array.isArray(libraryMangas) || libraryMangas.length === 0 || limit <= 0) {
        return [];
    }

    const directUnreadPool = getDirectUnreadPool(currentManga, libraryMangas, options);
    if (directUnreadPool.length === 0) {
        return [];
    }

    const currentTagIds = getMangaTagIds(currentManga);
    const currentLanguage = normalizeText(currentManga.language);
    const tagMatchThresholds = Array.from(
        { length: currentTagIds.length + 1 },
        (_, index) => currentTagIds.length - index,
    );
    const requireSameLanguagePasses = currentLanguage ? [true, false] : [false];

    for (const requireSameLanguage of requireSameLanguagePasses) {
        for (const tagMatchThreshold of tagMatchThresholds) {
            const matchingMangas = directUnreadPool.filter((candidate) => {
                if (requireSameLanguage && normalizeText(candidate.language) !== currentLanguage) {
                    return false;
                }

                return getSharedTagCount(currentTagIds, candidate) >= tagMatchThreshold;
            });

            if (matchingMangas.length > 0) {
                return shuffleMangas(matchingMangas).slice(0, limit);
            }
        }
    }

    return [];
};
