import { Manga } from "@/renderer/types";
import { normalizeMangaSourceUrl } from "@/renderer/utils/mangaSource";
import { compareSeriesMangasByChapter } from "@/renderer/utils/seriesChapters";

export type EndOfReadingRecommendationSource = "library" | "bookmark";

export type EndOfReadingRecommendation = Manga & {
    recommendationSource?: EndOfReadingRecommendationSource;
    recommendationLanguageCodes?: string[];
};

export type EndOfReadingRecommendationOptions = {
    hiddenTagIds?: string[];
    showHiddenContent?: boolean;
    excludeStartedWithoutPageCount?: boolean;
    requireSameLanguage?: boolean;
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

const getMangaSourceKey = (manga: Manga | null | undefined): string => {
    const scraperId = String(manga?.scraperId ?? "").trim();
    const sourceUrl = normalizeMangaSourceUrl(manga?.sourceUrl || manga?.sourceChapterUrl || null);

    if (!scraperId || !sourceUrl) {
        return "";
    }

    return [
        scraperId,
        sourceUrl,
        normalizeMangaSourceUrl(manga?.sourceChapterUrl),
        normalizeText(manga?.sourceChapterLabel || manga?.chapters || null),
    ].join("::");
};

const isSameManga = (
    left: Manga | null | undefined,
    right: Manga | null | undefined,
): boolean => {
    if (left?.id && right?.id && String(left.id) === String(right.id)) {
        return true;
    }

    const leftSourceKey = getMangaSourceKey(left);
    const rightSourceKey = getMangaSourceKey(right);

    return Boolean(leftSourceKey && rightSourceKey && leftSourceKey === rightSourceKey);
};

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

const getCandidateLanguageCodes = (manga: EndOfReadingRecommendation): string[] => {
    const explicitLanguageCodes = Array.isArray(manga.recommendationLanguageCodes)
        ? manga.recommendationLanguageCodes
            .map((languageCode) => normalizeText(languageCode))
            .filter(Boolean)
        : [];
    const primaryLanguage = normalizeText(manga.language);

    return Array.from(new Set([
        ...explicitLanguageCodes,
        ...(primaryLanguage ? [primaryLanguage] : []),
    ]));
};

const hasSameLanguage = (
    currentLanguage: string,
    candidate: EndOfReadingRecommendation,
): boolean => (
    Boolean(currentLanguage)
    && getCandidateLanguageCodes(candidate).includes(currentLanguage)
);

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

const shuffleMangas = <T extends Manga>(mangas: T[]): T[] => {
    const shuffledMangas = [...mangas];

    for (let index = shuffledMangas.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledMangas[index], shuffledMangas[swapIndex]] = [shuffledMangas[swapIndex], shuffledMangas[index]];
    }

    return shuffledMangas;
};

const getDirectUnreadPool = (
    currentManga: Manga,
    libraryMangas: EndOfReadingRecommendation[],
    options: EndOfReadingRecommendationOptions,
): EndOfReadingRecommendation[] => {
    const standaloneMangas: EndOfReadingRecommendation[] = [];
    const seriesMangasById = new Map<string, EndOfReadingRecommendation[]>();
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

    const directSeriesMangas = Array.from(seriesMangasById.values()).reduce<EndOfReadingRecommendation[]>((pool, seriesMangas) => {
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
    libraryMangas: EndOfReadingRecommendation[],
    limit = 3,
    options: EndOfReadingRecommendationOptions = {},
): EndOfReadingRecommendation[] => {
    if (!currentManga || !Array.isArray(libraryMangas) || libraryMangas.length === 0 || limit <= 0) {
        return [];
    }

    const directUnreadPool = getDirectUnreadPool(currentManga, libraryMangas, options);
    if (directUnreadPool.length === 0) {
        return [];
    }

    const currentTagIds = getMangaTagIds(currentManga);
    const currentLanguage = normalizeText(currentManga.language);
    if (options.requireSameLanguage && !currentLanguage) {
        return [];
    }

    const tagMatchThresholds = Array.from(
        { length: currentTagIds.length + 1 },
        (_, index) => currentTagIds.length - index,
    );
    const requireSameLanguagePasses = options.requireSameLanguage
        ? [true]
        : currentLanguage ? [true, false] : [false];

    for (const requireSameLanguage of requireSameLanguagePasses) {
        for (const tagMatchThreshold of tagMatchThresholds) {
            const matchingMangas = directUnreadPool.filter((candidate) => {
                if (requireSameLanguage && !hasSameLanguage(currentLanguage, candidate)) {
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

export const getRandomStandaloneEndOfReadingRecommendation = (
    currentManga: Manga | null,
    libraryMangas: EndOfReadingRecommendation[],
    options: EndOfReadingRecommendationOptions = {},
): EndOfReadingRecommendation | null => {
    if (!currentManga || !Array.isArray(libraryMangas) || libraryMangas.length === 0) {
        return null;
    }

    const currentLanguage = normalizeText(currentManga.language);
    if (!currentLanguage) {
        return null;
    }

    const hiddenTagIdSet = new Set((options.hiddenTagIds ?? []).map((tagId) => String(tagId)));
    const showHiddenContent = Boolean(options.showHiddenContent);
    const randomPool = libraryMangas.filter((candidate) => (
        !getSeriesId(candidate)
        && !isSameManga(candidate, currentManga)
        && !isMangaCompleted(candidate)
        && (!options.excludeStartedWithoutPageCount || !hasUnknownReadingCompletion(candidate))
        && (showHiddenContent || !hasHiddenTag(candidate, hiddenTagIdSet))
        && hasSameLanguage(currentLanguage, candidate)
    ));

    return shuffleMangas(randomPool)[0] ?? null;
};
