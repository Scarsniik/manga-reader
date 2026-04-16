import React from 'react';
import { NavigateFunction } from 'react-router-dom';
import { Manga } from '@/renderer/types';
import {
    ScraperBookmarkMetadataField,
    ScraperRecord,
} from '@/shared/scraper';
import {
    createScraperMangaId,
    getScraperFeature,
    getScraperPagesFeatureConfig,
    resolveScraperPageUrls,
} from '@/renderer/utils/scraperRuntime';
import {
    clearScraperRouteState,
    writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import { findNextSeriesManga, findPreviousSeriesManga } from '@/renderer/utils/seriesChapters';
import { getMangaSourceUrl } from '@/renderer/utils/mangaSource';
import { writeMangaManagerViewState } from '@/renderer/utils/readerNavigation';
import { getEndOfReadingRecommendations } from '@/renderer/components/Reader/endOfReadingRecommendations';
import {
    ReaderAdjacentTarget,
    ReaderCopyFeedback,
    ReaderLocationState,
} from '../types';
import {
    copyImageViaBrowserClipboard,
    isSameScraperChapter,
    isScraperReaderManga,
    normalizeReaderAssetSrc,
} from '../utils';

type Args = {
    locationSearch: string;
    locationState: ReaderLocationState;
    manga: Manga | null;
    libraryMangas: Manga[];
    hiddenTagIds: string[];
    showHiddenContent: boolean;
    images: string[];
    currentIndex: number;
    setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
    bookmarkExcludedFields: ScraperBookmarkMetadataField[];
    imgRef: React.RefObject<HTMLImageElement | null>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    navigate: NavigateFunction;
};

const useReaderNavigation = ({
    locationSearch,
    locationState,
    manga,
    libraryMangas,
    hiddenTagIds,
    showHiddenContent,
    images,
    currentIndex,
    setCurrentIndex,
    bookmarkExcludedFields,
    imgRef,
    containerRef,
    navigate,
}: Args) => {
    const [transitionDirection, setTransitionDirection] = React.useState<'previous' | 'next' | null>(null);
    const [isCompletionPage, setIsCompletionPage] = React.useState<boolean>(false);
    const [continuationLoading, setContinuationLoading] = React.useState<boolean>(false);
    const [continuationError, setContinuationError] = React.useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = React.useState<ReaderCopyFeedback | null>(null);
    const [resolvedPageCounts, setResolvedPageCounts] = React.useState<Record<string, number>>({});

    const ocrAvailable = !isScraperReaderManga(manga);
    const previousLocalManga = React.useMemo(
        () => (manga?.path ? findPreviousSeriesManga(manga, libraryMangas) : null),
        [libraryMangas, manga],
    );
    const nextLocalManga = React.useMemo(
        () => (manga?.path ? findNextSeriesManga(manga, libraryMangas) : null),
        [libraryMangas, manga],
    );

    const previousTarget = React.useMemo<ReaderAdjacentTarget | null>(() => {
        if (manga?.path && previousLocalManga) {
            return {
                kind: 'library',
                title: previousLocalManga.title,
                chapterLabel: previousLocalManga.chapters,
                cover: previousLocalManga.thumbnailPath || null,
                adjacentManga: previousLocalManga,
            };
        }

        const scraperReaderState = locationState?.scraperReader;
        const scraperBrowserReturn = locationState?.scraperBrowserReturn;
        const currentChapter = scraperReaderState?.chapter;
        const chaptersResult = scraperBrowserReturn?.chaptersResult;

        if (!scraperReaderState || !scraperBrowserReturn || !currentChapter || !Array.isArray(chaptersResult) || chaptersResult.length === 0) {
            return null;
        }

        const currentChapterIndex = chaptersResult.findIndex((chapter) => isSameScraperChapter(chapter, currentChapter));
        if (currentChapterIndex <= 0) {
            return null;
        }

        const previousChapter = chaptersResult[currentChapterIndex - 1];
        if (!previousChapter) {
            return null;
        }

        return {
            kind: 'scraper',
            title: scraperBrowserReturn.detailsResult.title || scraperReaderState.title || manga?.title || 'manga',
            chapterLabel: previousChapter.label,
            cover: previousChapter.image || scraperBrowserReturn.detailsResult.cover || scraperReaderState.cover || manga?.thumbnailPath || null,
            adjacentChapter: previousChapter,
            detailsResult: scraperBrowserReturn.detailsResult,
            scraperId: scraperReaderState.scraperId,
        };
    }, [libraryMangas, locationState, manga, previousLocalManga]);

    const nextTarget = React.useMemo<ReaderAdjacentTarget | null>(() => {
        if (manga?.path && nextLocalManga) {
            return {
                kind: 'library',
                title: nextLocalManga.title,
                chapterLabel: nextLocalManga.chapters,
                cover: nextLocalManga.thumbnailPath || null,
                adjacentManga: nextLocalManga,
            };
        }

        const scraperReaderState = locationState?.scraperReader;
        const scraperBrowserReturn = locationState?.scraperBrowserReturn;
        const currentChapter = scraperReaderState?.chapter;
        const chaptersResult = scraperBrowserReturn?.chaptersResult;

        if (!scraperReaderState || !scraperBrowserReturn || !currentChapter || !Array.isArray(chaptersResult) || chaptersResult.length === 0) {
            return null;
        }

        const currentChapterIndex = chaptersResult.findIndex((chapter) => isSameScraperChapter(chapter, currentChapter));
        if (currentChapterIndex < 0) {
            return null;
        }

        const nextChapter = chaptersResult[currentChapterIndex + 1];
        if (!nextChapter) {
            return null;
        }

        return {
            kind: 'scraper',
            title: scraperBrowserReturn.detailsResult.title || scraperReaderState.title || manga?.title || 'manga',
            chapterLabel: nextChapter.label,
            cover: nextChapter.image || scraperBrowserReturn.detailsResult.cover || scraperReaderState.cover || manga?.thumbnailPath || null,
            adjacentChapter: nextChapter,
            detailsResult: scraperBrowserReturn.detailsResult,
            scraperId: scraperReaderState.scraperId,
        };
    }, [libraryMangas, locationState, manga, nextLocalManga]);

    const activeTransitionTarget = transitionDirection === 'previous'
        ? previousTarget
        : transitionDirection === 'next'
            ? nextTarget
            : null;
    const isTransitionPage = Boolean(transitionDirection && activeTransitionTarget);
    const currentImageSrc = !isTransitionPage && !isCompletionPage && currentIndex >= 0 && currentIndex < images.length
        ? images[currentIndex]
        : null;
    const continuationCoverSrc = React.useMemo(
        () => normalizeReaderAssetSrc(activeTransitionTarget?.cover ?? null),
        [activeTransitionTarget],
    );
    const completionRecommendations = React.useMemo(
        () => isCompletionPage
            ? getEndOfReadingRecommendations(manga, libraryMangas.map((candidate) => {
                const resolvedPageCount = resolvedPageCounts[candidate.id];
                if (
                    (typeof candidate.pages === 'number' && candidate.pages > 0)
                    || typeof resolvedPageCount !== 'number'
                    || resolvedPageCount <= 0
                ) {
                    return candidate;
                }

                return {
                    ...candidate,
                    pages: resolvedPageCount,
                };
            }), 3, {
                excludeStartedWithoutPageCount: true,
                hiddenTagIds,
                showHiddenContent,
            })
            : [],
        [hiddenTagIds, isCompletionPage, libraryMangas, manga, resolvedPageCounts, showHiddenContent],
    );
    const completionSourceUrl = React.useMemo(
        () => manga ? getMangaSourceUrl(manga) || null : null,
        [manga],
    );
    const mangasMissingPageCount = React.useMemo(
        () => libraryMangas.filter((candidate) => (
            candidate.path
            && typeof candidate.currentPage === 'number'
            && Number.isFinite(candidate.currentPage)
            && candidate.currentPage > 0
            && !(typeof candidate.pages === 'number' && candidate.pages > 0)
            && typeof resolvedPageCounts[candidate.id] !== 'number'
        )),
        [libraryMangas, resolvedPageCounts],
    );
    const pageCounterLabel = isCompletionPage
        ? 'Fin'
        : isTransitionPage
        ? (transitionDirection === 'previous' ? 'Précédent' : 'Suite')
        : images.length > 0
            ? `${currentIndex + 1} / ${images.length}`
            : '0 / 0';

    const totalPages = images.length;
    const currentPage = totalPages > 0 ? currentIndex + 1 : 0;
    const readingProgress = totalPages > 0
        ? Math.max(0, Math.min(100, (currentPage / totalPages) * 100))
        : 0;
    const isLastPage = totalPages > 0 && currentPage >= totalPages;
    const progressAriaText = isCompletionPage
        ? 'Lecture terminée'
        : isTransitionPage
        ? (transitionDirection === 'previous'
            ? 'Début du chapitre, précédent disponible'
            : 'Chapitre termine, suite disponible')
        : `Page ${currentPage} sur ${totalPages}`;
    const canGoPrev = images.length > 0 && !continuationLoading && (
        isCompletionPage
        || isTransitionPage
        || currentIndex > 0
        || Boolean(previousTarget)
    );
    const canGoNext = images.length > 0 && !continuationLoading && !isCompletionPage && (
        isTransitionPage
        || currentIndex < images.length - 1
        || Boolean(nextTarget)
        || currentIndex >= images.length - 1
    );

    const scrollToTopImmediate = React.useCallback(() => {
        try {
            if (imgRef.current) {
                imgRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
                return;
            }

            if (containerRef.current) {
                containerRef.current.scrollTop = 0;
                return;
            }

            try {
                window.scrollTo({ top: 0, left: 0 });
            } catch (error) {
                // ignore
            }
        } catch (error) {
            // ignore
        }
    }, [containerRef, imgRef]);

    const handleBack = React.useCallback(() => {
        if (locationState?.scraperBrowserReturn) {
            navigate(
                {
                    pathname: locationState?.from?.pathname ?? '/',
                    search: locationState?.from?.search ?? '',
                },
                {
                    replace: true,
                    state: {
                        scraperBrowserReturn: locationState.scraperBrowserReturn,
                    },
                }
            );
            return;
        }

        const historyIndex = window.history.state && typeof window.history.state.idx === 'number'
            ? window.history.state.idx
            : null;
        if (historyIndex !== null && historyIndex > 0) {
            navigate(-1);
            return;
        }

        const fallbackSearch = new URLSearchParams(locationState?.from?.search ?? '');
        const currentQuery = new URLSearchParams(locationSearch);
        const focusMangaId = manga?.id ?? locationState?.mangaId ?? currentQuery.get('id');
        if (focusMangaId && !fallbackSearch.get('focus')) {
            fallbackSearch.set('focus', String(focusMangaId));
        }

        navigate(
            {
                pathname: locationState?.from?.pathname ?? '/',
                search: fallbackSearch.toString() ? `?${fallbackSearch.toString()}` : '',
            },
            { replace: true }
        );
    }, [locationSearch, locationState, manga?.id, navigate]);

    const getLibraryReturnLocation = React.useCallback((focusMangaId?: string | null) => {
        const fromSearch = locationState?.from?.pathname === '/'
            ? locationState.from.search ?? ''
            : '';
        const librarySearch = clearScraperRouteState(fromSearch);
        const fallbackSearch = new URLSearchParams(librarySearch.startsWith('?')
            ? librarySearch.slice(1)
            : librarySearch);

        if (focusMangaId && !fallbackSearch.get('focus')) {
            fallbackSearch.set('focus', String(focusMangaId));
        }

        return {
            pathname: '/',
            search: fallbackSearch.toString() ? `?${fallbackSearch.toString()}` : '',
        };
    }, [locationState]);

    const returnToLibrary = React.useCallback(() => {
        const currentQuery = new URLSearchParams(locationSearch);
        const focusMangaId = manga?.id ?? locationState?.mangaId ?? currentQuery.get('id');

        if (focusMangaId) {
            writeMangaManagerViewState({ focusMangaId: String(focusMangaId) });
        }

        navigate(getLibraryReturnLocation(focusMangaId), { replace: true });
    }, [getLibraryReturnLocation, locationSearch, locationState?.mangaId, manga?.id, navigate]);

    const openMangaSource = React.useCallback(async () => {
        if (!completionSourceUrl) {
            return;
        }

        const scraperId = String(
            manga?.scraperId
            || locationState?.scraperReader?.scraperId
            || locationState?.scraperBrowserReturn?.scraperId
            || ''
        ).trim();

        try {
            if (scraperId && window.api && typeof window.api.getScrapers === 'function') {
                try {
                    const scrapers: ScraperRecord[] = await window.api.getScrapers();
                    const sourceScraper = Array.isArray(scrapers)
                        ? scrapers.find((scraper) => scraper.id === scraperId) ?? null
                        : null;

                    if (sourceScraper) {
                        const baseSearch = locationState?.from?.pathname === '/'
                            ? locationState.from.search ?? ''
                            : '';

                        navigate(
                            {
                                pathname: '/',
                                search: writeScraperRouteState(baseSearch, {
                                    scraperId: sourceScraper.id,
                                    mode: 'manga',
                                    searchActive: false,
                                    searchQuery: '',
                                    searchPage: 1,
                                    authorActive: false,
                                    authorQuery: '',
                                    authorPage: 1,
                                    mangaQuery: '',
                                    mangaUrl: completionSourceUrl,
                                }),
                            },
                            {
                                state: {
                                    scraperBrowserHistorySource: {
                                        kind: 'manga',
                                    },
                                },
                            },
                        );
                        return;
                    }
                } catch (error) {
                    console.warn('Reader: failed to resolve source scraper, falling back to external URL', error);
                }
            }

            if (window.api && typeof window.api.openExternalUrl === 'function') {
                await window.api.openExternalUrl(completionSourceUrl);
                return;
            }

            window.open(completionSourceUrl, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Reader: failed to open manga source', error);
            alert('Impossible d\'ouvrir la source.');
        }
    }, [completionSourceUrl, locationState, manga?.scraperId, navigate]);

    const resolveLocalMangaPageCount = React.useCallback(async (targetManga: Manga): Promise<number | null> => {
        if (typeof targetManga.pages === 'number' && targetManga.pages > 0) {
            return targetManga.pages;
        }

        if (targetManga.path && window.api && typeof window.api.countPages === 'function') {
            try {
                const pageCount = await window.api.countPages(targetManga.path);
                if (typeof pageCount === 'number' && pageCount > 0) {
                    return pageCount;
                }
            } catch (error) {
                console.warn('Reader: failed to count pages for library manga', error);
            }
        }

        return null;
    }, []);

    const openLibraryManga = React.useCallback(async (targetManga: Manga) => {
        const savedPage = typeof targetManga.currentPage === 'number' && targetManga.currentPage > 0
            ? targetManga.currentPage
            : 1;
        const totalPages = await resolveLocalMangaPageCount(targetManga);
        const targetPage = totalPages !== null && savedPage >= totalPages
            ? 1
            : savedPage;
        const libraryReturnLocation = getLibraryReturnLocation(targetManga.id);

        writeMangaManagerViewState({ focusMangaId: targetManga.id });
        navigate(
            `/reader?id=${encodeURIComponent(targetManga.id)}&page=${encodeURIComponent(String(targetPage))}`,
            {
                state: {
                    from: libraryReturnLocation,
                    mangaId: targetManga.id,
                },
            },
        );
    }, [getLibraryReturnLocation, navigate, resolveLocalMangaPageCount]);

    const goTo = React.useCallback((index: number) => {
        scrollToTopImmediate();
        setTransitionDirection(null);
        setIsCompletionPage(false);
        setContinuationError(null);
        setCurrentIndex(() => {
            if (images.length === 0) {
                return 0;
            }

            return Math.max(0, Math.min(images.length - 1, index));
        });
    }, [images.length, scrollToTopImmediate, setCurrentIndex]);

    const continueToAdjacentChapter = React.useCallback(async (direction: 'previous' | 'next') => {
        const target = direction === 'previous' ? previousTarget : nextTarget;
        if (!target || continuationLoading) {
            return;
        }

        setContinuationLoading(true);
        setContinuationError(null);
        setIsCompletionPage(false);

        try {
            const targetPageForLocalManga = async (adjacentManga: Manga): Promise<number> => {
                if (direction === 'next') {
                    return 1;
                }

                return (await resolveLocalMangaPageCount(adjacentManga)) ?? 1;
            };

            if (target.kind === 'library' && target.adjacentManga) {
                const targetPage = await targetPageForLocalManga(target.adjacentManga);
                navigate(
                    `/reader?id=${encodeURIComponent(target.adjacentManga.id)}&page=${encodeURIComponent(String(targetPage))}`,
                    {
                        replace: true,
                        state: {
                            from: locationState?.from,
                            mangaId: target.adjacentManga.id,
                        },
                    },
                );
                return;
            }

            if (
                target.kind !== 'scraper'
                || !target.adjacentChapter
                || !target.detailsResult
                || !target.scraperId
            ) {
                throw new Error(direction === 'previous'
                    ? 'Aucun chapitre précédent disponible.'
                    : 'Aucun chapitre suivant disponible.');
            }

            if (
                !window.api
                || typeof window.api.getScrapers !== 'function'
                || typeof window.api.fetchScraperDocument !== 'function'
            ) {
                throw new Error('Les APIs du scrapper sont indisponibles.');
            }

            const scrapers: ScraperRecord[] = await window.api.getScrapers();
            const scraper = Array.isArray(scrapers)
                ? scrapers.find((candidate) => candidate.id === target.scraperId) || null
                : null;

            if (!scraper) {
                throw new Error('Le scrapper source est introuvable.');
            }

            const pagesFeature = getScraperFeature(scraper, 'pages');
            const pagesConfig = getScraperPagesFeatureConfig(pagesFeature);
            if (!pagesConfig) {
                throw new Error('La configuration Pages du scrapper est introuvable.');
            }

            const pageUrls = await resolveScraperPageUrls(
                scraper,
                target.detailsResult,
                pagesConfig,
                async (request) => window.api.fetchScraperDocument(request),
                {
                    chapter: target.adjacentChapter,
                },
            );

            const targetPage = direction === 'previous' ? pageUrls.length : 1;
            const sourceUrl = target.detailsResult.finalUrl || target.detailsResult.requestedUrl;
            const readerMangaId = createScraperMangaId(
                scraper.id,
                sourceUrl,
                target.adjacentChapter.url,
            );

            navigate(
                `/reader?id=${encodeURIComponent(readerMangaId)}&page=${encodeURIComponent(String(targetPage))}`,
                {
                    replace: true,
                    state: {
                        from: locationState?.from,
                        mangaId: readerMangaId,
                        scraperBrowserReturn: locationState?.scraperBrowserReturn,
                        scraperReader: {
                            id: readerMangaId,
                            scraperId: scraper.id,
                            title: target.title,
                            sourceUrl,
                            cover: target.adjacentChapter.image || target.detailsResult.cover,
                            pageUrls,
                            chapter: target.adjacentChapter,
                            bookmarkExcludedFields,
                            ignoreSavedProgress: true,
                        },
                    },
                },
            );
        } catch (error) {
            setContinuationError(error instanceof Error
                ? error.message
                : direction === 'previous'
                    ? 'Impossible d\'ouvrir le chapitre précédent.'
                    : 'Impossible d\'ouvrir le chapitre suivant.'
            );
        } finally {
            setContinuationLoading(false);
        }
    }, [bookmarkExcludedFields, continuationLoading, locationState, navigate, nextTarget, previousTarget, resolveLocalMangaPageCount]);

    const next = React.useCallback(() => {
        if (continuationLoading) {
            return;
        }

        if (isCompletionPage) {
            return;
        }

        if (isTransitionPage) {
            if (transitionDirection === 'next') {
                void continueToAdjacentChapter('next');
                return;
            }

            scrollToTopImmediate();
            setTransitionDirection(null);
            setContinuationError(null);
            return;
        }

        if (images.length > 0 && currentIndex >= images.length - 1) {
            scrollToTopImmediate();
            if (nextTarget) {
                setTransitionDirection('next');
                setIsCompletionPage(false);
                setContinuationError(null);
                return;
            }

            setTransitionDirection(null);
            setIsCompletionPage(true);
            setContinuationError(null);
            return;
        }

        goTo(currentIndex + 1);
    }, [continuationLoading, continueToAdjacentChapter, currentIndex, goTo, images.length, isCompletionPage, isTransitionPage, nextTarget, scrollToTopImmediate, transitionDirection]);

    const prev = React.useCallback(() => {
        if (isCompletionPage) {
            scrollToTopImmediate();
            setIsCompletionPage(false);
            setTransitionDirection(null);
            setContinuationError(null);
            return;
        }

        if (isTransitionPage) {
            if (transitionDirection === 'previous') {
                void continueToAdjacentChapter('previous');
                return;
            }

            scrollToTopImmediate();
            setTransitionDirection(null);
            setContinuationError(null);
            return;
        }

        if (currentIndex === 0 && previousTarget) {
            scrollToTopImmediate();
            setTransitionDirection('previous');
            setContinuationError(null);
            return;
        }

        goTo(currentIndex - 1);
    }, [continueToAdjacentChapter, currentIndex, goTo, isCompletionPage, isTransitionPage, previousTarget, scrollToTopImmediate, transitionDirection]);

    const showCopyFeedback = React.useCallback((type: 'success' | 'error', message: string) => {
        setCopyFeedback({ type, message });
    }, []);

    const copyCurrentImage = React.useCallback(async () => {
        if (isTransitionPage || isCompletionPage) {
            showCopyFeedback('error', 'Aucune image');
            return;
        }

        const currentImage = images[currentIndex];
        if (!currentImage) {
            showCopyFeedback('error', 'Aucune image');
            return;
        }

        let electronError: string | null = null;

        try {
            if (window.api && typeof window.api.copyImageToClipboard === 'function') {
                const result = await window.api.copyImageToClipboard(currentImage);
                if (result && result.ok === true) {
                    showCopyFeedback('success', 'Image copiee');
                    return;
                }

                electronError = result && result.error
                    ? String(result.error)
                    : 'Impossible de copier l\'image';
            }
        } catch (error: any) {
            electronError = error && error.message ? error.message : 'Echec de copie';
        }

        try {
            await copyImageViaBrowserClipboard(currentImage, imgRef.current);
            showCopyFeedback('success', 'Image copiee');
        } catch (error: any) {
            const fallbackError = error && error.message ? error.message : null;
            showCopyFeedback('error', fallbackError || electronError || 'Echec de copie');
        }
    }, [currentIndex, images, imgRef, isCompletionPage, isTransitionPage, showCopyFeedback]);

    React.useEffect(() => {
        setTransitionDirection(null);
        setIsCompletionPage(false);
        setContinuationLoading(false);
        setContinuationError(null);
    }, [locationSearch]);

    React.useEffect(() => {
        if (transitionDirection === 'previous' && !previousTarget) {
            setTransitionDirection(null);
            return;
        }

        if (transitionDirection === 'next' && !nextTarget) {
            setTransitionDirection(null);
        }
    }, [nextTarget, previousTarget, transitionDirection]);

    React.useEffect(() => {
        if (isCompletionPage && nextTarget) {
            setIsCompletionPage(false);
        }
    }, [isCompletionPage, nextTarget]);

    React.useEffect(() => {
        if (!isCompletionPage || mangasMissingPageCount.length === 0) {
            return;
        }

        if (!window.api || typeof window.api.countPages !== 'function') {
            return;
        }

        let cancelled = false;

        const resolvePageCounts = async () => {
            const entries = await Promise.all(
                mangasMissingPageCount.map(async (candidate): Promise<[string, number] | null> => {
                    try {
                        const pageCount = await window.api.countPages(candidate.path);
                        if (typeof pageCount === 'number' && pageCount > 0) {
                            return [candidate.id, pageCount];
                        }
                    } catch (error) {
                        console.warn('Reader: failed to count recommendation pages', candidate.id, error);
                    }

                    return null;
                }),
            );

            if (cancelled) {
                return;
            }

            setResolvedPageCounts((currentCounts) => {
                const nextCounts = { ...currentCounts };
                let hasChanges = false;

                entries.forEach((entry) => {
                    if (!entry) {
                        return;
                    }

                    const [mangaId, pageCount] = entry;
                    if (nextCounts[mangaId] !== pageCount) {
                        nextCounts[mangaId] = pageCount;
                        hasChanges = true;
                    }
                });

                return hasChanges ? nextCounts : currentCounts;
            });
        };

        void resolvePageCounts();

        return () => {
            cancelled = true;
        };
    }, [isCompletionPage, mangasMissingPageCount]);

    React.useEffect(() => {
        if (!copyFeedback) {
            return;
        }

        const timer = window.setTimeout(() => {
            setCopyFeedback(null);
        }, 2200);

        return () => window.clearTimeout(timer);
    }, [copyFeedback]);

    React.useEffect(() => {
        if (isTransitionPage || isCompletionPage) {
            return;
        }

        const img = imgRef.current;
        if (!img) {
            return;
        }

        const onClick = (event: MouseEvent) => {
            if (event.button === 0) {
                next();
            } else if (event.button === 2) {
                prev();
            }
        };

        const preventContextMenu = (event: MouseEvent) => event.preventDefault();

        img.addEventListener('click', onClick);
        img.addEventListener('contextmenu', preventContextMenu);
        return () => {
            img.removeEventListener('click', onClick);
            img.removeEventListener('contextmenu', preventContextMenu);
        };
    }, [imgRef, isCompletionPage, isTransitionPage, next, prev]);

    return {
        ocrAvailable,
        previousTarget,
        nextTarget,
        activeTransitionTarget,
        transitionDirection,
        continuationLoading,
        continuationError,
        isTransitionPage,
        isCompletionPage,
        currentImageSrc,
        completionRecommendations,
        completionSourceUrl,
        continuationCoverSrc,
        pageCounterLabel,
        totalPages,
        currentPage,
        readingProgress,
        isLastPage,
        progressAriaText,
        canGoPrev,
        canGoNext,
        copyFeedback,
        handleBack,
        returnToLibrary,
        openMangaSource,
        openLibraryManga,
        continueToAdjacentChapter,
        next,
        prev,
        copyCurrentImage,
    };
};

export default useReaderNavigation;
