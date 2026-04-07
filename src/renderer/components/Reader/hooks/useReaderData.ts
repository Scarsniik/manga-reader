import React from 'react';
import { Manga } from '@/renderer/types';
import {
    ScraperBookmarkMetadataField,
    ScraperReaderProgressRecord,
} from '@/shared/scraper';
import { ReaderLocationState } from '../types';
import { isScraperReaderManga } from '../utils';

type Args = {
    locationSearch: string;
    locationState: ReaderLocationState;
    preloadPageCount: number | null;
};

const useReaderData = ({
    locationSearch,
    locationState,
    preloadPageCount,
}: Args) => {
    const [images, setImages] = React.useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = React.useState<number>(0);
    const [manga, setManga] = React.useState<Manga | null>(null);
    const [libraryMangas, setLibraryMangas] = React.useState<Manga[]>([]);
    const [bookmarkExcludedFields, setBookmarkExcludedFields] = React.useState<ScraperBookmarkMetadataField[]>([]);
    const [debugList, setDebugList] = React.useState<string[] | null>(null);
    const [debugError, setDebugError] = React.useState<string | null>(null);
    const [coverData, setCoverData] = React.useState<string | null>(null);
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const openedCompletedRef = React.useRef<boolean>(false);
    const preloadedImagesRef = React.useRef<Map<string, HTMLImageElement>>(new Map());
    const query = React.useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);

    React.useEffect(() => {
        const init = async () => {
            const id = query.get('id');
            const pageParam = query.get('page');
            let startPage = 1;
            if (pageParam) {
                const parsedPage = parseInt(pageParam, 10);
                if (!Number.isNaN(parsedPage) && parsedPage > 0) {
                    startPage = parsedPage;
                }
            }

            console.debug('Reader:init params', { id, pageParam, startPage });

            const scraperReaderState = locationState?.scraperReader;
            if (
                scraperReaderState
                && id
                && String(scraperReaderState.id) === String(id)
                && Array.isArray(scraperReaderState.pageUrls)
                && scraperReaderState.pageUrls.length > 0
            ) {
                const ignoreSavedProgress = Boolean(scraperReaderState.ignoreSavedProgress);
                let savedProgress: ScraperReaderProgressRecord | null = null;
                if (window.api && typeof window.api.getScraperReaderProgress === 'function') {
                    try {
                        savedProgress = await window.api.getScraperReaderProgress(scraperReaderState.id);
                    } catch (error) {
                        console.warn('Reader: failed to load scraper reader progress', error);
                    }
                }

                const remoteManga: Manga = {
                    id: scraperReaderState.id,
                    title: scraperReaderState.title,
                    path: '',
                    thumbnailPath: scraperReaderState.cover || null,
                    createdAt: new Date().toISOString(),
                    currentPage: !ignoreSavedProgress && typeof savedProgress?.currentPage === 'number'
                        ? savedProgress.currentPage
                        : null,
                    pages: scraperReaderState.pageUrls.length,
                    authorIds: [],
                    tagIds: [],
                    sourceKind: 'scraper',
                    scraperId: scraperReaderState.scraperId,
                    sourceUrl: scraperReaderState.sourceUrl,
                    chapters: scraperReaderState.chapter?.label,
                };

                setLibraryMangas([]);
                setManga(remoteManga);
                setBookmarkExcludedFields(Array.isArray(scraperReaderState.bookmarkExcludedFields)
                    ? scraperReaderState.bookmarkExcludedFields
                    : []);
                openedCompletedRef.current = !ignoreSavedProgress
                    && scraperReaderState.pageUrls.length > 0
                    && typeof remoteManga.currentPage === 'number'
                    && remoteManga.currentPage >= scraperReaderState.pageUrls.length;
                setImages(scraperReaderState.pageUrls);
                const initialPage = !ignoreSavedProgress
                    && typeof savedProgress?.currentPage === 'number'
                    && savedProgress.currentPage > 0
                    ? savedProgress.currentPage
                    : startPage;
                const nextIndex = Math.max(0, Math.min(scraperReaderState.pageUrls.length - 1, initialPage - 1));
                setCurrentIndex(nextIndex);
                return;
            }

            if (!window.api || typeof window.api.getMangas !== 'function') {
                console.error('window.api.getMangas is not available');
                setLibraryMangas([]);
                return;
            }

            const mangas: Manga[] = await window.api.getMangas();
            setLibraryMangas(Array.isArray(mangas) ? mangas : []);
            console.debug('Reader: fetched mangas', mangas);
            const found = id ? mangas.find((candidate) => String(candidate.id) === String(id)) || null : null;
            console.debug('Reader: found manga', found);
            setManga(found);
            setBookmarkExcludedFields([]);
            openedCompletedRef.current = false;

            if (found && found.path) {
                if (!window.api || typeof window.api.listPages !== 'function') {
                    console.error('window.api.listPages is not available');
                    setImages([]);
                    return;
                }

                try {
                    const pageImages: string[] = await window.api.listPages(found.path);
                    console.debug('Reader: listPages returned', pageImages && pageImages.length);
                    setImages(pageImages || []);
                    const totalPages = (pageImages || []).length;
                    openedCompletedRef.current = totalPages > 0
                        && typeof found.currentPage === 'number'
                        && found.currentPage >= totalPages;
                    const nextIndex = Math.max(0, Math.min(totalPages - 1, startPage - 1));
                    setCurrentIndex(nextIndex);
                } catch (error) {
                    console.error('Reader: listPages threw', error);
                    openedCompletedRef.current = false;
                    setImages([]);
                }
            } else {
                openedCompletedRef.current = false;
                setImages([]);
            }
        };

        void init();
    }, [locationSearch, locationState, query]);

    React.useEffect(() => {
        try {
            if (imgRef.current) {
                imgRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
            } else if (containerRef.current) {
                containerRef.current.scrollTop = 0;
            }
        } catch (error) {
            // ignore
        }
    }, [currentIndex]);

    React.useEffect(() => {
        if (!manga) {
            return;
        }

        const pageNum = images.length > 0 ? currentIndex + 1 : 1;
        try {
            const url = new URL(window.location.href);
            const params = url.searchParams;
            const currentParam = params.get('page');
            if (currentParam !== String(pageNum)) {
                params.set('page', String(pageNum));
                const newUrl = `${url.pathname}?${params.toString()}`;
                try {
                    window.history.replaceState({}, '', newUrl);
                } catch (error) {
                    // ignore
                }
            }
        } catch (error) {
            // ignore
        }
    }, [currentIndex, images, manga]);

    React.useEffect(() => {
        if (preloadPageCount === null || images.length === 0 || preloadPageCount <= 0) {
            preloadedImagesRef.current.clear();
            return;
        }

        const targetSources = new Set<string>();
        const startIndex = Math.max(0, currentIndex - preloadPageCount);
        const endIndex = Math.min(images.length - 1, currentIndex + preloadPageCount);

        for (let index = startIndex; index <= endIndex; index += 1) {
            if (index === currentIndex) {
                continue;
            }

            const source = images[index];
            if (source) {
                targetSources.add(source);
            }
        }

        const preloadedImages = preloadedImagesRef.current;
        const staleSources: string[] = [];

        for (const source of preloadedImages.keys()) {
            if (!targetSources.has(source)) {
                staleSources.push(source);
            }
        }

        staleSources.forEach((source) => preloadedImages.delete(source));

        targetSources.forEach((source) => {
            if (preloadedImages.has(source)) {
                return;
            }

            const image = new window.Image();
            image.decoding = 'async';
            image.loading = 'eager';
            image.src = source;

            if (typeof image.decode === 'function') {
                void image.decode().catch(() => undefined);
            }

            preloadedImages.set(source, image);
        });
    }, [currentIndex, images, preloadPageCount]);

    React.useEffect(() => {
        return () => {
            preloadedImagesRef.current.clear();
        };
    }, []);

    React.useEffect(() => {
        if (manga) {
            const page1 = images.length > 0 ? currentIndex + 1 : null;
            if (manga.currentPage !== page1) {
                setManga({ ...manga, currentPage: page1 });
            }
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled) {
                return;
            }

            try {
                if (!manga || !manga.id) {
                    return;
                }

                const visiblePage = images.length > 0 ? currentIndex + 1 : null;
                const totalPages = images.length > 0 ? images.length : null;
                let persistedPage = visiblePage;

                if (openedCompletedRef.current && visiblePage !== null && totalPages !== null) {
                    if (visiblePage === 1 || visiblePage >= totalPages) {
                        persistedPage = totalPages;
                    }
                }

                if (isScraperReaderManga(manga)) {
                    if (!window.api || typeof window.api.saveScraperReaderProgress !== 'function') {
                        return;
                    }

                    await window.api.saveScraperReaderProgress({
                        id: manga.id,
                        scraperId: String(manga.scraperId || ''),
                        title: manga.title,
                        sourceUrl: String(manga.sourceUrl || ''),
                        currentPage: persistedPage,
                        totalPages,
                    });
                    return;
                }

                if (!window.api || typeof window.api.updateManga !== 'function') {
                    return;
                }

                await window.api.updateManga({ id: manga.id, currentPage: persistedPage });
                try {
                    window.dispatchEvent(new CustomEvent('mangas-updated'));
                } catch (error) {
                    // noop
                }
            } catch (error) {
                console.warn('Failed to persist currentPage', error);
            }
        }, 500);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [currentIndex, images, manga]);

    const runDebugListPages = React.useCallback(async () => {
        setDebugError(null);
        setDebugList(null);
        setCoverData(null);

        try {
            if (!manga || !manga.path) {
                setDebugError('No manga path available');
                return;
            }

            if (!window.api || typeof window.api.listPages !== 'function') {
                setDebugError('window.api.listPages not available');
                return;
            }

            const result: string[] = await window.api.listPages(manga.path);
            setDebugList(result || []);

            if (window.api && typeof window.api.getCoverData === 'function') {
                try {
                    const data = await window.api.getCoverData(manga.path);
                    if (data) {
                        setCoverData(data as string);
                    }
                } catch (error) {
                    console.warn('getCoverData failed', error);
                }
            }
        } catch (error: any) {
            console.error('runDebugListPages', error);
            setDebugError(String(error && error.message ? error.message : error));
        }
    }, [manga]);

    return {
        query,
        images,
        setImages,
        currentIndex,
        setCurrentIndex,
        manga,
        setManga,
        libraryMangas,
        bookmarkExcludedFields,
        setBookmarkExcludedFields,
        imgRef,
        containerRef,
        debugList,
        debugError,
        coverData,
        runDebugListPages,
    };
};

export default useReaderData;
