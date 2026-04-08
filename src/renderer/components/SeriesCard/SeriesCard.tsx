import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card, { CardOverlayItem } from "@/renderer/components/Card/Card";
import { DetailsCardIcon, OpenBookIcon } from "@/renderer/components/icons";
import useSeries from "@/renderer/hooks/useSeries";
import { Manga } from "@/renderer/types";
import { writeMangaManagerViewState } from "@/renderer/utils/readerNavigation";
import { compareSeriesMangasByChapter } from "@/renderer/utils/seriesChapters";

interface Props {
    seriesId: string;
    onRemove?: (id: string) => void;
    onCardUpdated?: (id: string) => void;
    selected?: boolean;
    onToggleSelect?: (id: string, additive: boolean) => void;
    selectionMode?: boolean;
    titleLineCount?: number;
    showPageNumbers?: boolean;
}

type PageCountMap = Record<string, number | null | undefined>;

let allMangasCache: Manga[] | null = null;
let allMangasPromise: Promise<Manga[]> | null = null;

const toPositiveNumber = (value: unknown): number | null => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }

    return Math.floor(numericValue);
};

const normalizeCoverPath = (thumbnailPath?: string | null): string | null => {
    if (!thumbnailPath) {
        return null;
    }

    let normalizedPath = thumbnailPath;

    if (normalizedPath.startsWith("local://")) {
        return normalizedPath;
    }

    if (normalizedPath.startsWith("file://")) {
        return normalizedPath.replace(/^file:\/\//, "local://");
    }

    if (normalizedPath.match(/^[A-Za-z]:\\/)) {
        return `local:///${normalizedPath.replace(/\\/g, "/")}`;
    }

    if (normalizedPath.startsWith("/")) {
        return `local://${normalizedPath}`;
    }

    return `local://${normalizedPath.replace(/\\/g, "/")}`;
};

const readResolvedPageCount = (manga: Manga, pageCounts: PageCountMap): number | null => {
    const hasCachedValue = Object.prototype.hasOwnProperty.call(pageCounts, manga.id);
    const sourceValue = hasCachedValue ? pageCounts[manga.id] : manga.pages;

    return toPositiveNumber(sourceValue);
};

const loadAllMangas = async (forceRefresh = false): Promise<Manga[]> => {
    if (forceRefresh) {
        allMangasCache = null;
    }

    if (allMangasCache) {
        return allMangasCache;
    }

    if (allMangasPromise) {
        return allMangasPromise;
    }

    const pendingRequest = (async () => {
        if (!window.api || typeof window.api.getMangas !== "function") {
            return [];
        }

        const data = await window.api.getMangas();
        const normalizedData = Array.isArray(data) ? data : [];
        allMangasCache = normalizedData;
        return normalizedData;
    })();

    allMangasPromise = pendingRequest;

    try {
        return await pendingRequest;
    } finally {
        if (allMangasPromise === pendingRequest) {
            allMangasPromise = null;
        }
    }
};

const SeriesCard: React.FC<Props> = ({
    seriesId,
    onRemove: _onRemove,
    onCardUpdated: _onCardUpdated,
    selected = false,
    onToggleSelect,
    selectionMode = false,
    titleLineCount = 2,
    showPageNumbers = true,
}) => {
    const [seriesMangas, setSeriesMangas] = useState<Manga[]>([]);
    const [pageCounts, setPageCounts] = useState<PageCountMap>({});
    const navigate = useNavigate();
    const location = useLocation();
    const { series } = useSeries();

    const refreshSeriesMangas = useCallback(async (forceRefresh = false) => {
        try {
            const allMangas = await loadAllMangas(forceRefresh);
            const nextSeriesMangas = allMangas
                .filter((manga) => manga.seriesId === seriesId)
                .sort(compareSeriesMangasByChapter);

            setSeriesMangas(nextSeriesMangas);
        } catch (error) {
            console.error("Failed to load series mangas", error);
            setSeriesMangas([]);
        }
    }, [seriesId]);

    useEffect(() => {
        void refreshSeriesMangas();
    }, [refreshSeriesMangas]);

    useEffect(() => {
        const handleMangasUpdated = () => {
            void refreshSeriesMangas(true);
        };

        window.addEventListener("mangas-updated", handleMangasUpdated);
        return () => {
            window.removeEventListener("mangas-updated", handleMangasUpdated);
        };
    }, [refreshSeriesMangas]);

    useEffect(() => {
        setPageCounts((previousPageCounts) => {
            let hasChanged = false;
            const nextPageCounts = { ...previousPageCounts };

            seriesMangas.forEach((manga) => {
                const knownPages = toPositiveNumber(manga.pages);

                if (knownPages === null || nextPageCounts[manga.id] === knownPages) {
                    return;
                }

                nextPageCounts[manga.id] = knownPages;
                hasChanged = true;
            });

            return hasChanged ? nextPageCounts : previousPageCounts;
        });
    }, [seriesMangas]);

    useEffect(() => {
        if (!window.api || typeof window.api.countPages !== "function") {
            return;
        }

        const mangasMissingPages = seriesMangas.filter((manga) => {
            if (!manga.path) {
                return false;
            }

            if (readResolvedPageCount(manga, pageCounts) !== null) {
                return false;
            }

            return !Object.prototype.hasOwnProperty.call(pageCounts, manga.id);
        });

        if (mangasMissingPages.length === 0) {
            return;
        }

        let cancelled = false;

        (async () => {
            const nextPageCounts: PageCountMap = {};

            await Promise.all(mangasMissingPages.map(async (manga) => {
                try {
                    const countedPages = await window.api.countPages(manga.path);
                    nextPageCounts[manga.id] = toPositiveNumber(countedPages);
                } catch (error) {
                    console.warn("Failed to count series manga pages", error);
                    nextPageCounts[manga.id] = null;
                }
            }));

            if (cancelled || Object.keys(nextPageCounts).length === 0) {
                return;
            }

            setPageCounts((previousPageCounts) => ({
                ...previousPageCounts,
                ...nextPageCounts,
            }));
        })();

        return () => {
            cancelled = true;
        };
    }, [pageCounts, seriesMangas]);

    const rememberReaderReturnPoint = useCallback(() => {
        const content = document.querySelector(".mangaManager-content");
        const elementScrollTop = content instanceof HTMLElement ? content.scrollTop : 0;
        const windowScrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollTop = Math.max(elementScrollTop, windowScrollTop);

        writeMangaManagerViewState({
            focusMangaId: seriesId,
            scrollTop,
        });
    }, [seriesId]);

    const resolveTotalPagesForManga = useCallback(async (manga: Manga): Promise<number | null> => {
        const knownPages = readResolvedPageCount(manga, pageCounts);
        if (knownPages !== null) {
            return knownPages;
        }

        if (!manga.path || !window.api || typeof window.api.countPages !== "function") {
            return null;
        }

        try {
            const countedPages = await window.api.countPages(manga.path);
            const normalizedCount = toPositiveNumber(countedPages);

            setPageCounts((previousPageCounts) => ({
                ...previousPageCounts,
                [manga.id]: normalizedCount,
            }));

            return normalizedCount;
        } catch (error) {
            console.warn("Failed to count pages before opening a series manga", error);
            setPageCounts((previousPageCounts) => ({
                ...previousPageCounts,
                [manga.id]: null,
            }));
            return null;
        }
    }, [pageCounts]);

    const resolveReaderTargetPage = useCallback((manga: Manga, totalPages: number | null): number => {
        const savedPage = toPositiveNumber(manga.currentPage) ?? 1;

        if (totalPages !== null && savedPage >= totalPages) {
            return 1;
        }

        return savedPage;
    }, []);

    const openReader = useCallback(async () => {
        if (seriesMangas.length === 0) {
            return;
        }

        rememberReaderReturnPoint();

        const startedMangas = seriesMangas.filter((manga) => toPositiveNumber(manga.currentPage) !== null);
        const fallbackManga = seriesMangas[0];
        let targetManga = startedMangas[startedMangas.length - 1] ?? fallbackManga;
        const targetMangaPages = await resolveTotalPagesForManga(targetManga);
        const targetMangaCurrentPage = toPositiveNumber(targetManga.currentPage) ?? 1;
        const isTargetMangaComplete = targetMangaPages !== null && targetMangaCurrentPage >= targetMangaPages;

        if (isTargetMangaComplete) {
            const targetMangaIndex = seriesMangas.findIndex((manga) => manga.id === targetManga.id);
            targetManga = seriesMangas[targetMangaIndex + 1] ?? targetManga;
        }

        const totalPages = await resolveTotalPagesForManga(targetManga);
        const targetPage = resolveReaderTargetPage(targetManga, totalPages);

        navigate(
            `/reader?id=${encodeURIComponent(targetManga.id)}&page=${encodeURIComponent(String(targetPage))}`,
            {
                state: {
                    from: {
                        pathname: location.pathname,
                        search: location.search,
                    },
                    mangaId: targetManga.id,
                },
            },
        );
    }, [location.pathname, location.search, navigate, rememberReaderReturnPoint, resolveReaderTargetPage, resolveTotalPagesForManga, seriesMangas]);

    const seriesTitle = useMemo(() => {
        const matchingSeries = series.find((seriesItem) => seriesItem.id === seriesId);

        if (matchingSeries?.title) {
            return matchingSeries.title;
        }

        return seriesMangas[0]?.title ?? "Serie";
    }, [series, seriesId, seriesMangas]);

    const primaryAuthorId = useMemo(() => {
        const mangaWithAuthor = seriesMangas.find((manga) => Array.isArray(manga.authorIds) && manga.authorIds.length > 0);
        return mangaWithAuthor?.authorIds[0] ?? null;
    }, [seriesMangas]);

    const coverSrc = useMemo(() => normalizeCoverPath(seriesMangas[0]?.thumbnailPath ?? null), [seriesMangas]);
    const mangaCount = seriesMangas.length > 0 ? seriesMangas.length : undefined;

    const aggregatedProgress = useMemo(() => {
        let totalPages = 0;
        let currentPages = 0;

        seriesMangas.forEach((manga) => {
            const resolvedPages = readResolvedPageCount(manga, pageCounts);

            if (resolvedPages === null) {
                return;
            }

            totalPages += resolvedPages;
            currentPages += Math.min(toPositiveNumber(manga.currentPage) ?? 0, resolvedPages);
        });

        if (totalPages <= 0) {
            return {
                current: null,
                total: null,
            };
        }

        return {
            current: currentPages,
            total: totalPages,
        };
    }, [pageCounts, seriesMangas]);

    const onCardClick = useCallback((event: React.MouseEvent) => {
        const additive = event.ctrlKey || event.metaKey;

        if (additive || selectionMode) {
            if (onToggleSelect) {
                onToggleSelect(seriesId, additive);
            }
            return;
        }

        void openReader();
    }, [onToggleSelect, openReader, selectionMode, seriesId]);

    const onReadClick = useCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        void openReader();
    }, [openReader]);

    const onCardKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
            void openReader();
        }
    }, [openReader]);

    const onFilterByAuthor = useCallback((event: React.MouseEvent) => {
        event.stopPropagation();

        if (!primaryAuthorId) {
            return;
        }

        navigate({
            pathname: location.pathname,
            search: `?author=${encodeURIComponent(primaryAuthorId)}`,
        });
    }, [location.pathname, navigate, primaryAuthorId]);

    const onFilterBySeries = useCallback((event: React.MouseEvent) => {
        event.stopPropagation();

        navigate({
            pathname: location.pathname,
            search: `?series=${encodeURIComponent(seriesId)}`,
        });
    }, [location.pathname, navigate, seriesId]);

    const overlayContent: CardOverlayItem[] = useMemo(() => ([
        {
            icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
            ariaLabel: "Lire",
            onClick: onReadClick,
            itemsPerRow: 3,
        },
        {
            icon: <DetailsCardIcon aria-hidden="true" focusable="false" />,
            ariaLabel: "Consulter la série",
            onClick: onFilterBySeries,
            itemsPerRow: 3,
        },
        {
            type: "title",
            label: "Filtrer par :",
        },
        {
            label: "Auteur",
            onClick: onFilterByAuthor,
            disabled: !primaryAuthorId,
        },
    ]), [onFilterByAuthor, onFilterBySeries, onReadClick, primaryAuthorId]);

    return (
        <Card
            key={seriesId}
            coverPath={coverSrc}
            title={seriesTitle}
            dataMangaId={seriesId}
            current={aggregatedProgress.current}
            total={aggregatedProgress.total}
            countValue={mangaCount}
            countLabel="mangas"
            overlayContent={overlayContent}
            selected={selected}
            titleLineCount={titleLineCount}
            showPageNumbers={showPageNumbers}
            overlayTriggerSize="compact"
            onClick={onCardClick}
            onKeyDown={onCardKeyDown}
        />
    );
};

const MemoizedSeriesCard = memo(SeriesCard);
MemoizedSeriesCard.displayName = "SeriesCard";

export default MemoizedSeriesCard;
