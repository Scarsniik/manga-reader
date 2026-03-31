import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './style.scss';
import { Manga } from '@/renderer/types';
import ReaderHeader from './ReaderHeader';
import ImageViewer from './ImageViewer';
import OcrPanel from './OcrPanel';
import { getOcrApi, mockOcrRecognize } from '@/renderer/utils/mockOcr';
import useParams from '@/renderer/hooks/useParams';

type ReaderLocationState = {
    from?: {
        pathname: string;
        search?: string;
    };
    mangaId?: string;
} | null;

type ReaderOcrBox = {
    id: string;
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    vertical?: boolean;
    lines?: string[];
    manual?: boolean;
};

type ReaderOcrLoadResult = {
    boxes: ReaderOcrBox[];
    fromCache: boolean;
    computedAt: string | null;
    forceRefreshUsed: boolean;
    source?: string | null;
};

type ManualSelection = {
    x: number;
    y: number;
    w: number;
    h: number;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
                return;
            }

            reject(new Error('Impossible de preparer l\'image'));
        }, type);
    });
};

const drawImageToPngBlob = async (
    source: CanvasImageSource,
    width: number,
    height: number
): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas indisponible');
    }

    context.drawImage(source, 0, 0, width, height);
    return canvasToBlob(canvas, 'image/png');
};

const copyImageViaBrowserClipboard = async (
    imageSrc: string,
    imageElement: HTMLImageElement | null
): Promise<void> => {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Redemarre l\'app pour activer la copie');
    }

    try {
        const response = await fetch(imageSrc);
        if (!response.ok) {
            throw new Error(`Chargement impossible (${response.status})`);
        }

        const fetchedBlob = await response.blob();
        let clipboardBlob = fetchedBlob;
        if (fetchedBlob.type.toLowerCase() !== 'image/png') {
            if (typeof createImageBitmap === 'function') {
                const bitmap = await createImageBitmap(fetchedBlob);
                try {
                    clipboardBlob = await drawImageToPngBlob(bitmap, bitmap.width, bitmap.height);
                } finally {
                    if (typeof bitmap.close === 'function') {
                        bitmap.close();
                    }
                }
            } else {
                throw new Error('Conversion image indisponible');
            }
        }

        await navigator.clipboard.write([
            new ClipboardItem({
                [clipboardBlob.type || 'image/png']: clipboardBlob,
            }),
        ]);
        return;
    } catch (error) {
        if (
            imageElement
            && imageElement.complete
            && imageElement.naturalWidth > 0
            && imageElement.naturalHeight > 0
        ) {
            const clipboardBlob = await drawImageToPngBlob(
                imageElement,
                imageElement.naturalWidth,
                imageElement.naturalHeight
            );
            await navigator.clipboard.write([
                new ClipboardItem({
                    [clipboardBlob.type || 'image/png']: clipboardBlob,
                }),
            ]);
            return;
        }

        throw error;
    }
};

const DEFAULT_READER_PRELOAD_PAGE_COUNT = 2;
const MAX_READER_PRELOAD_PAGE_COUNT = 10;
const BASE_OCR_PAGE_MEMORY_CACHE = 6;

const normalizeReaderPreloadPageCount = (value: unknown): number => {
    const parsed = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim().length > 0 ? Number(value) : Number.NaN);

    if (!Number.isFinite(parsed)) {
        return DEFAULT_READER_PRELOAD_PAGE_COUNT;
    }

    return Math.max(0, Math.min(MAX_READER_PRELOAD_PAGE_COUNT, Math.floor(parsed)));
};

const filterVisibleOcrBoxes = (boxes: ReaderOcrBox[]): ReaderOcrBox[] => (
    boxes.filter((box) => typeof box.text === 'string' && box.text.trim().length > 0)
);

const splitReaderOcrBoxes = (boxes: ReaderOcrBox[]) => ({
    detected: boxes.filter((box) => !box.manual),
    manual: boxes.filter((box) => !!box.manual),
});

const blobToDataUrl = (blob: Blob): Promise<string> => (
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }

            reject(new Error('Conversion image indisponible'));
        };
        reader.onerror = () => reject(reader.error || new Error('Conversion image indisponible'));
        reader.readAsDataURL(blob);
    })
);

const cropImageSelectionToDataUrl = async (
    imageElement: HTMLImageElement,
    selection: ManualSelection
): Promise<string> => {
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;
    if (!naturalWidth || !naturalHeight) {
        throw new Error('Image non chargee');
    }

    const sourceX = Math.max(0, Math.min(naturalWidth - 1, Math.floor(selection.x * naturalWidth)));
    const sourceY = Math.max(0, Math.min(naturalHeight - 1, Math.floor(selection.y * naturalHeight)));
    const sourceWidth = Math.max(1, Math.min(naturalWidth - sourceX, Math.ceil(selection.w * naturalWidth)));
    const sourceHeight = Math.max(1, Math.min(naturalHeight - sourceY, Math.ceil(selection.h * naturalHeight)));

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas indisponible');
    }

    context.drawImage(
        imageElement,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
    );

    const blob = await canvasToBlob(canvas, 'image/png');
    return blobToDataUrl(blob);
};

const orderManualCropBoxesForReading = (
    boxes: ReaderOcrBox[],
): ReaderOcrBox[] => {
    if (boxes.length <= 1) {
        return [...boxes];
    }

    const verticalCount = boxes.filter((box) => !!box.vertical).length;
    const treatAsVertical = verticalCount >= Math.ceil(boxes.length / 2);

    if (treatAsVertical) {
        const averageWidth = boxes.reduce((sum, box) => sum + box.bbox.w, 0) / boxes.length;
        const sameColumnThreshold = Math.max(averageWidth * 0.75, 0.03);

        return [...boxes].sort((left, right) => {
            if (Math.abs(left.bbox.x - right.bbox.x) > sameColumnThreshold) {
                return right.bbox.x - left.bbox.x;
            }
            return left.bbox.y - right.bbox.y;
        });
    }

    const averageHeight = boxes.reduce((sum, box) => sum + box.bbox.h, 0) / boxes.length;
    const sameRowThreshold = Math.max(averageHeight * 0.75, 0.03);

    return [...boxes].sort((left, right) => {
        if (Math.abs(left.bbox.y - right.bbox.y) > sameRowThreshold) {
            return left.bbox.y - right.bbox.y;
        }
        return left.bbox.x - right.bbox.x;
    });
};

const createMergedManualSelection = (
    boxes: ReaderOcrBox[],
    selection: ManualSelection,
    selectionKey: string
): ReaderOcrBox => {
    const orderedBoxes = orderManualCropBoxesForReading(boxes);
    const lineChunks = orderedBoxes.flatMap((box) => {
        if (Array.isArray(box.lines) && box.lines.length > 0) {
            return box.lines.map((line) => String(line).trim()).filter(Boolean);
        }
        return [String(box.text || '').trim()].filter(Boolean);
    });

    const mergedText = lineChunks.join('').trim();
    const mergedVertical = orderedBoxes.filter((box) => !!box.vertical).length >= Math.ceil(orderedBoxes.length / 2);

    return {
        id: `${selectionKey}-merged`,
        text: mergedText,
        bbox: {
            x: selection.x,
            y: selection.y,
            w: selection.w,
            h: selection.h,
        },
        vertical: mergedVertical,
        lines: lineChunks,
        manual: true,
    };
};

const getNormalizedOverlapArea = (
    left: { x: number; y: number; w: number; h: number },
    right: { x: number; y: number; w: number; h: number }
): number => {
    const x1 = Math.max(left.x, right.x);
    const y1 = Math.max(left.y, right.y);
    const x2 = Math.min(left.x + left.w, right.x + right.w);
    const y2 = Math.min(left.y + left.h, right.y + right.h);

    if (x2 <= x1 || y2 <= y1) {
        return 0;
    }

    return (x2 - x1) * (y2 - y1);
};

const getManualSelectionPageBoxCandidates = (
    boxes: ReaderOcrBox[],
    selection: ManualSelection
): ReaderOcrBox[] => {
    const selectionArea = Math.max(selection.w * selection.h, 0.000001);

    return boxes.filter((box) => {
        const overlapArea = getNormalizedOverlapArea(box.bbox, selection);
        if (overlapArea <= 0) {
            return false;
        }

        const boxArea = Math.max(box.bbox.w * box.bbox.h, 0.000001);
        const overlapOnBox = overlapArea / boxArea;
        const overlapOnSelection = overlapArea / selectionArea;
        return overlapOnBox >= 0.35 || overlapOnSelection >= 0.12;
    });
};

const scoreManualSelectionCandidate = (box: ReaderOcrBox | null): number => {
    if (!box || !box.text) {
        return -1000;
    }

    const compactText = box.text.replace(/\s+/g, '');
    const lineCount = Array.isArray(box.lines) ? box.lines.filter(Boolean).length : 0;
    return compactText.length + (lineCount * 6);
};

const getMaxOcrPageMemoryCache = (preloadPageCount: number | null): number => (
    Math.max(BASE_OCR_PAGE_MEMORY_CACHE, ((preloadPageCount ?? 0) * 2) + 1)
);

const getOrderedOcrPreRenderSources = (
    images: string[],
    currentIndex: number,
    preloadPageCount: number | null
): string[] => {
    if (images.length === 0) {
        return [];
    }

    const additionalPages = Math.max(0, preloadPageCount ?? 0);
    const endIndex = Math.min(images.length - 1, currentIndex + additionalPages);
    const startIndex = Math.max(0, currentIndex - additionalPages);
    const sources: string[] = [];

    for (let index = currentIndex; index <= endIndex; index += 1) {
        const source = images[index];
        if (source) {
            sources.push(source);
        }
    }

    for (let index = currentIndex - 1; index >= startIndex; index -= 1) {
        const source = images[index];
        if (source) {
            sources.push(source);
        }
    }

    return sources;
};

const getOcrSourceLabel = (source?: string | null) => (
    source === 'manga-file'
        ? 'fichier OCR du manga'
        : source === 'app-cache'
            ? 'cache disque'
            : source === 'reader-memory'
                ? 'cache memoire du reader'
                : 'calcul backend'
);

// We'll read location once and derive query params from it

const Reader: React.FC = () => {
    const [images, setImages] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [manga, setManga] = useState<Manga | null>(null);
    const [ocrEnabled, setOcrEnabled] = useState<boolean>(false);
    const [copyFeedback, setCopyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showBoxes, setShowBoxes] = useState<boolean>(true);
    const [detectedBoxes, setDetectedBoxes] = useState<ReaderOcrBox[]>([]);
    const [manualBoxes, setManualBoxes] = useState<ReaderOcrBox[]>([]);
    const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
    const [manualSelectionEnabled, setManualSelectionEnabled] = useState<boolean>(false);
    const [manualSelectionLoading, setManualSelectionLoading] = useState<boolean>(false);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const openedCompletedRef = useRef<boolean>(false);
    const preloadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const ocrPageCacheRef = useRef<Map<string, ReaderOcrBox[]>>(new Map());
    const ocrInFlightRef = useRef<Map<string, Promise<ReaderOcrLoadResult>>>(new Map());
    const ocrRequestTokenRef = useRef<number>(0);
    const location = useLocation();
    const navigate = useNavigate();
    const { params, loading: settingsLoading } = useParams();
    const query = new URLSearchParams(location.search);
    const locationState = location.state as ReaderLocationState;
    const preloadPageCount = settingsLoading
        ? null
        : normalizeReaderPreloadPageCount(params?.readerPreloadPageCount);

    const handleBack = useCallback(() => {
        const historyIndex = window.history.state && typeof window.history.state.idx === 'number'
            ? window.history.state.idx
            : null;
        if (historyIndex !== null && historyIndex > 0) {
            navigate(-1);
            return;
        }

        const fallbackSearch = new URLSearchParams(locationState?.from?.search ?? '');
        const focusMangaId = manga?.id ?? locationState?.mangaId ?? query.get('id');
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
    }, [locationState, manga?.id, navigate, query]);

    useEffect(() => {
        const init = async () => {
            // params: id (manga id) and page (1-based)
            const id = query.get('id');
            const pageParam = query.get('page');
            let startPage = 1;
            if (pageParam) {
                const p = parseInt(pageParam, 10);
                if (!isNaN(p) && p > 0) startPage = p;
            }

            console.debug('Reader:init params', { id, pageParam, startPage });

            // get mangas list from backend and find the one with this id
            if (!window.api || typeof window.api.getMangas !== 'function') {
                console.error('window.api.getMangas is not available');
                return;
            }

            const mangas: Manga[] = await window.api.getMangas();
            console.debug('Reader: fetched mangas', mangas);
            const found = id ? mangas.find(m => String(m.id) === String(id)) || null : null;
            console.debug('Reader: found manga', found);
            setManga(found);
            openedCompletedRef.current = false;

            // If manga found and has a path, list pages
            if (found && found.path) {
                if (!window.api || typeof window.api.listPages !== 'function') {
                    console.error('window.api.listPages is not available');
                    setImages([]);
                    return;
                }
                try {
                    const imgs: string[] = await window.api.listPages(found.path);
                    console.debug('Reader: listPages returned', imgs && imgs.length);
                    setImages(imgs || []);
                    const totalPages = (imgs || []).length;
                    openedCompletedRef.current = totalPages > 0
                        && typeof found.currentPage === 'number'
                        && found.currentPage >= totalPages;
                    // clamp start page
                    const idx = Math.max(0, Math.min(totalPages - 1, startPage - 1));
                    setCurrentIndex(idx);
                } catch (err) {
                    console.error('Reader: listPages threw', err);
                    openedCompletedRef.current = false;
                    setImages([]);
                }
            } else {
                openedCompletedRef.current = false;
                setImages([]);
            }
        };

        init();
        // Run when location.search changes
    }, [location.search]);

    // Navigation helpers
    // Ensure view is scrolled to top immediately before changing page
    const scrollToTopImmediate = () => {
        try {
            // If the image element is rendered, scroll it into view at the top
            if (imgRef.current) {
                imgRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
                return;
            }
            // Otherwise, reset container scroll
            if (containerRef.current) {
                containerRef.current.scrollTop = 0;
                return;
            }
            // Fallback to window scroll
            try { window.scrollTo({ top: 0, left: 0 }); } catch (e) { /* ignore */ }
        } catch (err) {
            // ignore
        }
    };

    const goTo = (index: number) => {
        // scroll to top before changing the page so the new page starts at top
        scrollToTopImmediate();
        setCurrentIndex(prev => {
            const next = Math.max(0, Math.min(images.length - 1, index));
            return next;
        });
    };

    const next = () => goTo(currentIndex + 1);
    const prev = () => goTo(currentIndex - 1);

    const showCopyFeedback = useCallback((type: 'success' | 'error', message: string) => {
        setCopyFeedback({ type, message });
    }, []);

    const copyCurrentImage = useCallback(async () => {
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
        } catch (err: any) {
            electronError = err && err.message ? err.message : 'Echec de copie';
        }

        try {
            await copyImageViaBrowserClipboard(currentImage, imgRef.current);
            showCopyFeedback('success', 'Image copiee');
        } catch (err: any) {
            const fallbackError = err && err.message ? err.message : null;
            showCopyFeedback('error', fallbackError || electronError || 'Echec de copie');
        }
    }, [currentIndex, images, showCopyFeedback]);

    // When page changes, ensure the image is scrolled to the top of the container/view
    useEffect(() => {
        try {
            if (imgRef.current) {
                imgRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
            } else if (containerRef.current) {
                containerRef.current.scrollTop = 0;
            }
        } catch (err) {
            // ignore
        }
    }, [currentIndex]);

    useEffect(() => {
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

        for (const source of staleSources) {
            preloadedImages.delete(source);
        }

        for (const source of targetSources) {
            if (preloadedImages.has(source)) {
                continue;
            }

            const image = new window.Image();
            image.decoding = 'async';
            image.loading = 'eager';
            image.src = source;

            if (typeof image.decode === 'function') {
                void image.decode().catch(() => undefined);
            }

            preloadedImages.set(source, image);
        }
    }, [currentIndex, images, preloadPageCount]);

    useEffect(() => {
        return () => {
            preloadedImagesRef.current.clear();
        };
    }, []);

    // Persist current page into the manga object (optional) and notify backend.
    useEffect(() => {
        // update local manga.currentPage
        if (manga) {
            const page1 = images && images.length > 0 ? currentIndex + 1 : null;
            // only update state if different to avoid re-renders
            if (manga.currentPage !== page1) {
                setManga({ ...manga, currentPage: page1 });
            }
        }

        // debounce backend updates to avoid spamming updates during quick navigation
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                if (!manga || !manga.id) return;
                if (!window.api || typeof window.api.updateManga !== 'function') return;
                const visiblePage = images && images.length > 0 ? currentIndex + 1 : null;
                const totalPages = images && images.length > 0 ? images.length : null;
                let persistedPage = visiblePage;

                // If the manga was already completed when opened, closing on page 1 or the last
                // page should keep it marked as completed. Any middle page exits the completed state.
                if (openedCompletedRef.current && visiblePage !== null && totalPages !== null) {
                    if (visiblePage === 1 || visiblePage >= totalPages) {
                        persistedPage = totalPages;
                    }
                }

                const payload: Partial<any> = { id: manga.id, currentPage: persistedPage };
                await window.api.updateManga(payload);
                try { window.dispatchEvent(new CustomEvent('mangas-updated')); } catch (e) { /* noop */ }
            } catch (err) {
                console.warn('Failed to persist currentPage', err);
            }
        }, 500);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    // Keep the page query param in sync with currentIndex so the URL reflects the visible page.
    useEffect(() => {
        try {
            if (!manga) return;
            const pageNum = images && images.length > 0 ? currentIndex + 1 : 1;
            const url = new URL(window.location.href);
            const params = url.searchParams;
            const currentParam = params.get('page');
            if (currentParam !== String(pageNum)) {
                params.set('page', String(pageNum));
                // Use replaceState so we don't add history entries when flipping pages
                const newUrl = url.pathname + '?' + params.toString();
                try { window.history.replaceState({}, '', newUrl); } catch (err) { /* ignore */ }
            }
        } catch (err) {
            // ignore
        }
    }, [currentIndex, images, manga]);

    useEffect(() => {
        if (!copyFeedback) return;

        const timer = window.setTimeout(() => {
            setCopyFeedback(null);
        }, 2200);

        return () => window.clearTimeout(timer);
    }, [copyFeedback]);

    // Keyboard controls
    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            if (target.isContentEditable) return true;
            const tagName = target.tagName.toLowerCase();
            return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        };

        const onKey = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target)) {
                return;
            }

            const key = e.key.toLowerCase();
            const selectedText = window.getSelection ? window.getSelection()?.toString() : '';
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'c' && !selectedText) {
                try { e.preventDefault(); } catch {}
                void copyCurrentImage();
                return;
            }
            // Page navigation
            if (key === 'arrowright' || key === 'd') {
                next();
            } else if (key === 'arrowleft' || key === 'a' || key === 'q') {
                prev();
            }
            // Vertical scroll: z -> up, s -> down
            else if (key === 'z') {
                try { e.preventDefault(); } catch {}
                const amount = (window.innerHeight) * 0.6;
                window.scrollBy({ top: -amount, behavior: 'smooth' });
            } else if (key === 's') {
                try { e.preventDefault(); } catch {}
                const amount = (window.innerHeight) * 0.6;
                window.scrollBy({ top: amount, behavior: 'smooth' });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [copyCurrentImage, currentIndex, images]);

    // Mouse click on image: left -> next, right -> prev
    useEffect(() => {
        const img = imgRef.current;
        if (!img) return;
        const onClick = (e: MouseEvent) => {
            // left click
            if (e instanceof MouseEvent) {
                if (e.button === 0) next();
                else if (e.button === 2) prev();
            }
        };
        img.addEventListener('click', onClick);
        img.addEventListener('contextmenu', (ev) => ev.preventDefault());
        return () => {
            img.removeEventListener('click', onClick);
        };
    }, [images, currentIndex]);

    // Debug helpers when no images
    const [debugList, setDebugList] = useState<string[] | null>(null);
    const [debugError, setDebugError] = useState<string | null>(null);
    const [coverData, setCoverData] = useState<string | null>(null);
    const [ocrLoading, setOcrLoading] = useState<boolean>(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const [ocrStatusNote, setOcrStatusNote] = useState<string | null>(null);
    const totalPages = images.length;
    const currentPage = totalPages > 0 ? currentIndex + 1 : 0;
    const readingProgress = totalPages > 0
        ? Math.max(0, Math.min(100, (currentPage / totalPages) * 100))
        : 0;
    const isLastPage = totalPages > 0 && currentPage >= totalPages;

    const runDebugListPages = async () => {
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
            const res: string[] = await window.api.listPages(manga.path);
            setDebugList(res || []);
            // try getCoverData as fallback display
            if (window.api && typeof window.api.getCoverData === 'function') {
                try {
                    const data = await window.api.getCoverData(manga.path);
                    if (data) setCoverData(data as string);
                } catch (err) {
                    console.warn('getCoverData failed', err);
                }
            }
        } catch (err: any) {
            console.error('runDebugListPages', err);
            setDebugError(String(err && err.message ? err.message : err));
        }
    };

    const rememberOcrBoxesForPage = useCallback((src: string, boxes: ReaderOcrBox[]) => {
        const cache = ocrPageCacheRef.current;
        if (cache.has(src)) {
            cache.delete(src);
        }
        cache.set(src, boxes);

        while (cache.size > getMaxOcrPageMemoryCache(preloadPageCount)) {
            const oldestKey = cache.keys().next().value;
            if (!oldestKey) {
                break;
            }
            cache.delete(oldestKey);
        }
    }, [preloadPageCount]);

    const clearOcrBoxesForPage = useCallback((src?: string | null) => {
        if (!src) {
            return;
        }
        ocrPageCacheRef.current.delete(src);
    }, []);

    const applyCurrentPageOcrBoxes = useCallback((boxes: ReaderOcrBox[]) => {
        const splitBoxes = splitReaderOcrBoxes(boxes);
        setDetectedBoxes(splitBoxes.detected);
        setManualBoxes(splitBoxes.manual);
    }, []);

    const updateSelectedBoxes = useCallback((id: string | null, additive?: boolean) => {
        if (!id) {
            setSelectedBoxes([]);
            return;
        }

        setSelectedBoxes((prev) => {
            const nextSelection = new Set(prev);
            if (additive) {
                if (nextSelection.has(id)) {
                    nextSelection.delete(id);
                } else {
                    nextSelection.add(id);
                }
                return Array.from(nextSelection);
            }
            return [id];
        });
    }, []);

    const loadOcrBoxesForPage = useCallback(async (
        src: string,
        pageIndex: number,
        useMemoryCache: boolean = true,
        options?: { forceRefresh?: boolean }
    ): Promise<ReaderOcrLoadResult> => {
        const forceRefresh = !!options?.forceRefresh;

        if (!forceRefresh && useMemoryCache) {
            const cachedBoxes = ocrPageCacheRef.current.get(src);
            if (cachedBoxes) {
                return {
                    boxes: cachedBoxes,
                    fromCache: false,
                    computedAt: null,
                    forceRefreshUsed: false,
                    source: 'reader-memory',
                };
            }
        }

        const inFlightKey = forceRefresh ? `${src}::force-refresh` : src;
        const inFlightRequest = ocrInFlightRef.current.get(inFlightKey);
        if (inFlightRequest) {
            return inFlightRequest;
        }

        const requestPromise = (async () => {
            const hasElectronOcrApi = !!(window.api && typeof window.api.ocrRecognize === 'function');
            const api = getOcrApi();
            const ocrOptions = hasElectronOcrApi ? {
                ...(forceRefresh ? { forceRefresh: true } : {}),
                ...(manga ? {
                    mangaId: manga.id,
                    mangaPath: manga.path,
                    mangaTitle: manga.title,
                    pageIndex,
                } : {}),
            } : undefined;
            const ocrResult = await api(src, ocrOptions);

            let { boxes } = ocrResult || {};
            if (!hasElectronOcrApi && (!Array.isArray(boxes) || boxes.length === 0)) {
                const fallback = await mockOcrRecognize(src);
                boxes = fallback.boxes || [];
            }

            const nextBoxes = filterVisibleOcrBoxes(Array.isArray(boxes) ? boxes as ReaderOcrBox[] : []);
            rememberOcrBoxesForPage(src, nextBoxes);
            return {
                boxes: nextBoxes,
                fromCache: !!ocrResult?.fromCache,
                computedAt: typeof ocrResult?.debug?.computedAt === 'string' ? ocrResult.debug.computedAt : null,
                forceRefreshUsed: !!ocrResult?.debug?.forceRefreshUsed,
                source: typeof ocrResult?.debug?.source === 'string' ? ocrResult.debug.source : null,
            };
        })();

        ocrInFlightRef.current.set(inFlightKey, requestPromise);

        try {
            return await requestPromise;
        } finally {
            if (ocrInFlightRef.current.get(inFlightKey) === requestPromise) {
                ocrInFlightRef.current.delete(inFlightKey);
            }
        }
    }, [manga, rememberOcrBoxesForPage]);

    const handleManualSelectionComplete = useCallback(async (selection: ManualSelection) => {
        const src = images[currentIndex];
        const imageElement = imgRef.current;
        if (!src || !imageElement) {
            setOcrError('Image indisponible pour la selection manuelle');
            return;
        }

        setManualSelectionLoading(true);
        setOcrError(null);

        try {
            const selectionKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const pageCandidates = getManualSelectionPageBoxCandidates(detectedBoxes, selection);
            const pageMergedBox = pageCandidates.length > 0
                ? createMergedManualSelection(pageCandidates, selection, `${selectionKey}-page`)
                : null;

            const cropDataUrl = await cropImageSelectionToDataUrl(imageElement, selection);
            const hasElectronOcrApi = !!(window.api && typeof window.api.ocrRecognize === 'function');
            const api = getOcrApi();
            const ocrResult = await api(
                cropDataUrl,
                hasElectronOcrApi ? { forceRefresh: true, manualCropMode: true } : undefined
            );

            let cropBoxes = Array.isArray(ocrResult?.boxes) ? ocrResult.boxes as ReaderOcrBox[] : [];
            if (!hasElectronOcrApi && cropBoxes.length === 0) {
                const fallback = await mockOcrRecognize(cropDataUrl);
                cropBoxes = Array.isArray(fallback?.boxes) ? fallback.boxes as ReaderOcrBox[] : [];
            }

            let visibleCropBoxes = filterVisibleOcrBoxes(cropBoxes);
            if (hasElectronOcrApi && visibleCropBoxes.length === 0) {
                const fallbackResult = await api(cropDataUrl, { forceRefresh: true });
                const fallbackBoxes = Array.isArray(fallbackResult?.boxes) ? fallbackResult.boxes as ReaderOcrBox[] : [];
                visibleCropBoxes = filterVisibleOcrBoxes(fallbackBoxes);
            }

            const cropMergedBox = visibleCropBoxes.length > 0
                ? createMergedManualSelection(visibleCropBoxes, selection, `${selectionKey}-crop`)
                : null;

            const chosenManualBox = (() => {
                if (pageMergedBox && cropMergedBox) {
                    const pageScore = scoreManualSelectionCandidate(pageMergedBox);
                    const cropScore = scoreManualSelectionCandidate(cropMergedBox);

                    if (pageScore >= cropScore + 2) {
                        return pageMergedBox;
                    }

                    if (
                        pageMergedBox.text.length > cropMergedBox.text.length
                        && cropMergedBox.text.length > 0
                        && pageMergedBox.text.includes(cropMergedBox.text)
                    ) {
                        return pageMergedBox;
                    }

                    return cropMergedBox;
                }

                return pageMergedBox || cropMergedBox;
            })();

            if (!chosenManualBox) {
                setOcrStatusNote('Selection manuelle: aucun texte detecte');
                return;
            }
            let nextBoxes = [...detectedBoxes, ...manualBoxes, chosenManualBox];

            if (
                manga
                && window.api
                && typeof window.api.ocrAddManualSelections === 'function'
            ) {
                const storedResult = await window.api.ocrAddManualSelections({
                    mangaId: manga.id,
                    imagePath: src,
                    pageIndex: currentIndex,
                    boxes: [chosenManualBox],
                });

                nextBoxes = filterVisibleOcrBoxes(
                    Array.isArray(storedResult?.boxes)
                        ? storedResult.boxes as ReaderOcrBox[]
                        : nextBoxes
                );
            }

            rememberOcrBoxesForPage(src, nextBoxes);
            applyCurrentPageOcrBoxes(nextBoxes);
            setSelectedBoxes([chosenManualBox.id]);
            setOcrStatusNote('Selection manuelle ajoutee');
            setManualSelectionEnabled(false);
        } catch (err: any) {
            setOcrError(String(err && err.message ? err.message : err));
        } finally {
            setManualSelectionLoading(false);
        }
    }, [
        applyCurrentPageOcrBoxes,
        currentIndex,
        detectedBoxes,
        images,
        manualBoxes,
        manga,
        rememberOcrBoxesForPage,
    ]);

    const handleRemoveManualBox = useCallback(async (boxId: string) => {
        const src = images[currentIndex];
        if (!src) {
            return;
        }

        setManualSelectionLoading(true);
        setOcrError(null);

        try {
            let nextBoxes = [...detectedBoxes, ...manualBoxes.filter((box) => box.id !== boxId)];

            if (
                manga
                && window.api
                && typeof window.api.ocrDeleteManualSelection === 'function'
            ) {
                const storedResult = await window.api.ocrDeleteManualSelection({
                    mangaId: manga.id,
                    imagePath: src,
                    pageIndex: currentIndex,
                    boxId,
                });

                nextBoxes = filterVisibleOcrBoxes(
                    Array.isArray(storedResult?.boxes)
                        ? storedResult.boxes as ReaderOcrBox[]
                        : nextBoxes
                );
            }

            rememberOcrBoxesForPage(src, nextBoxes);
            applyCurrentPageOcrBoxes(nextBoxes);
            setSelectedBoxes((prev) => prev.filter((id) => id !== boxId));
            setOcrStatusNote('Selection manuelle retiree');
        } catch (err: any) {
            setOcrError(String(err && err.message ? err.message : err));
        } finally {
            setManualSelectionLoading(false);
        }
    }, [
        applyCurrentPageOcrBoxes,
        currentIndex,
        detectedBoxes,
        images,
        manualBoxes,
        manga,
        rememberOcrBoxesForPage,
    ]);

    useEffect(() => {
        if (!ocrEnabled) {
            applyCurrentPageOcrBoxes([]);
            setSelectedBoxes([]);
            setOcrError(null);
            setOcrLoading(false);
            setOcrStatusNote(null);
            setManualSelectionEnabled(false);
            setManualSelectionLoading(false);
            return;
        }

        const src = images[currentIndex];
        if (!src) {
            applyCurrentPageOcrBoxes([]);
            setSelectedBoxes([]);
            setOcrError(null);
            setOcrLoading(false);
            setOcrStatusNote(null);
            setManualSelectionEnabled(false);
            setManualSelectionLoading(false);
            return;
        }

        const cachedBoxes = ocrPageCacheRef.current.get(src);
        setSelectedBoxes([]);
        setManualSelectionEnabled(false);
        setManualSelectionLoading(false);

        if (cachedBoxes) {
            applyCurrentPageOcrBoxes(cachedBoxes);
            setOcrError(null);
            setOcrLoading(false);
            setOcrStatusNote('Source: cache memoire du reader');
            return;
        }

        const requestToken = ocrRequestTokenRef.current + 1;
        ocrRequestTokenRef.current = requestToken;

        setDetectedBoxes([]);
        setOcrError(null);
        setOcrLoading(true);

        let cancelled = false;

        (async () => {
            try {
                const result = await loadOcrBoxesForPage(src, currentIndex, false);
                if (cancelled || requestToken !== ocrRequestTokenRef.current) {
                    return;
                }
                applyCurrentPageOcrBoxes(result.boxes);
                const sourceLabel = getOcrSourceLabel(result.source);
                setOcrStatusNote(result.fromCache
                    ? `Source: ${sourceLabel}, calcul initial ${result.computedAt ?? 'inconnu'}`
                    : `Source: ${sourceLabel}${result.forceRefreshUsed ? ' force' : ''}, termine ${result.computedAt ?? 'a l\'instant'}`
                );
            } catch (err: any) {
                if (cancelled || requestToken !== ocrRequestTokenRef.current) {
                    return;
                }
                applyCurrentPageOcrBoxes([]);
                setOcrError(String(err && err.message ? err.message : err));
                setOcrStatusNote(null);
            } finally {
                if (cancelled || requestToken !== ocrRequestTokenRef.current) {
                    return;
                }
                setOcrLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [applyCurrentPageOcrBoxes, currentIndex, images, loadOcrBoxesForPage, ocrEnabled]);

    useEffect(() => {
        if (!ocrEnabled || preloadPageCount === null || images.length === 0) {
            return;
        }

        const orderedSources = getOrderedOcrPreRenderSources(images, currentIndex, preloadPageCount);
        if (orderedSources.length === 0) {
            return;
        }

        let cancelled = false;

        (async () => {
            for (const source of orderedSources) {
                if (cancelled) {
                    return;
                }

                if (ocrPageCacheRef.current.has(source)) {
                    continue;
                }

                try {
                    const pageIndex = images.indexOf(source);
                    if (pageIndex < 0) {
                        continue;
                    }
                    await loadOcrBoxesForPage(source, pageIndex, true);
                } catch (error) {
                    if (cancelled) {
                        return;
                    }

                    console.warn('Reader: OCR pre-render failed', { source, error });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [ocrEnabled, currentIndex, images, loadOcrBoxesForPage, preloadPageCount]);

    const allOcrBoxes = [...detectedBoxes, ...manualBoxes];
    const selectedBoxData = selectedBoxes.length > 0 ? allOcrBoxes.find(b => b.id === selectedBoxes[0]) || null : null;
    const vocabItems = selectedBoxData ? selectedBoxData.text.split(/\s+/).filter(Boolean).slice(0, 3) : [];

    return (
        <div className="reader">
            <ReaderHeader
                manga={manga}
                imagesLength={images.length}
                currentIndex={currentIndex}
                ocrEnabled={ocrEnabled}
                canCopyImage={images.length > 0}
                copyFeedback={copyFeedback}
                onBack={handleBack}
                onCopyImage={() => {
                    void copyCurrentImage();
                }}
                onToggleOcr={() => setOcrEnabled(v => !v)}
            />

            <div className={"reader-body" + (ocrEnabled ? ' ocr-on' : '')} ref={containerRef}>
                <div className="reader-view">
                    <div className="reader-stage">
                        {totalPages > 0 && (
                            <div
                                className="reader-progress"
                                role="progressbar"
                                aria-label="Progression de lecture"
                                aria-valuemin={1}
                                aria-valuemax={totalPages}
                                aria-valuenow={currentPage}
                                aria-valuetext={`Page ${currentPage} sur ${totalPages}`}
                                title={`Page ${currentPage} sur ${totalPages}`}
                            >
                                <span className="reader-progress-track">
                                    <span
                                        className={"reader-progress-fill" + (isLastPage ? ' completed' : '')}
                                        style={{ height: `${readingProgress}%` }}
                                    />
                                </span>
                            </div>
                        )}

                        <div className="reader-stage-content">
                            {images.length > 0 ? (
                                <ImageViewer
                                    src={images[currentIndex]}
                                    imgRef={imgRef as any}
                                    ocrEnabled={ocrEnabled}
                                    showBoxes={showBoxes}
                                    detectedBoxes={allOcrBoxes}
                                    selectedBoxes={selectedBoxes}
                                    onSelectBox={updateSelectedBoxes}
                                    manualSelectionEnabled={manualSelectionEnabled}
                                    manualSelectionLoading={manualSelectionLoading}
                                    onManualSelectionComplete={(selection) => {
                                        void handleManualSelectionComplete(selection);
                                    }}
                                />
                            ) : (
                                <div className="reader-empty">
                                    <p>Aucune image à afficher.</p>
                                    <div className="reader-debug">
                                        <div><strong>Manga path:</strong> {manga && manga.path ? <code>{manga.path}</code> : <em>n/a</em>}</div>
                                        <div><strong>APIs:</strong>
                                            <span> getMangas: {window.api && typeof window.api.getMangas === 'function' ? 'OK' : 'NO'}</span>
                                            <span> listPages: {window.api && typeof window.api.listPages === 'function' ? 'OK' : 'NO'}</span>
                                            <span> getCoverData: {window.api && typeof window.api.getCoverData === 'function' ? 'OK' : 'NO'}</span>
                                        </div>
                                        <div style={{ marginTop: 8 }}>
                                            <button onClick={runDebugListPages} disabled={!manga || !manga.path}>Tester listPages</button>
                                        </div>
                                        {debugError && <div className="debug-error">Erreur: {debugError}</div>}
                                        {debugList && (
                                            <div className="debug-list">
                                                <div><strong>Pages trouvées ({debugList.length}):</strong></div>
                                                <ul>
                                                    {debugList.map((d, i) => (
                                                        <li key={i}><code style={{ fontSize: 12 }}>{d}</code></li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {coverData && (
                                            <div className="debug-cover">
                                                <div><strong>Cover data:</strong></div>
                                                <img src={coverData} alt="cover debug" style={{ maxWidth: 200, maxHeight: 200 }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {ocrEnabled && (
                    <OcrPanel
                        ocrEnabled={ocrEnabled}
                        detectedBoxes={detectedBoxes}
                        manualBoxes={manualBoxes}
                        selectedBoxes={selectedBoxes}
                        onSimulate={async () => {
                            setOcrError(null);
                            setOcrLoading(true);
                            const requestToken = ocrRequestTokenRef.current + 1;
                            ocrRequestTokenRef.current = requestToken;
                            try {
                                if (!images || images.length === 0) throw new Error('No image to OCR');
                                const src = images[currentIndex];
                                clearOcrBoxesForPage(src);
                                const result = await loadOcrBoxesForPage(src, currentIndex, false, { forceRefresh: true });
                                if (requestToken !== ocrRequestTokenRef.current) {
                                    return;
                                }
                                applyCurrentPageOcrBoxes(result.boxes);
                                setSelectedBoxes([]);
                                const sourceLabel = getOcrSourceLabel(result.source);
                                setOcrStatusNote(result.fromCache
                                    ? `Source: ${sourceLabel}, calcul initial ${result.computedAt ?? 'inconnu'}`
                                    : `Source: ${sourceLabel}${result.forceRefreshUsed ? ' force' : ''}, termine ${result.computedAt ?? 'a l\'instant'}`
                                );
                            } catch (err: any) {
                                if (requestToken !== ocrRequestTokenRef.current) {
                                    return;
                                }
                                applyCurrentPageOcrBoxes([]);
                                setOcrError(String(err && err.message ? err.message : err));
                                setOcrStatusNote(null);
                            } finally {
                                if (requestToken !== ocrRequestTokenRef.current) {
                                    return;
                                }
                                setOcrLoading(false);
                            }
                        }}
                        onClear={() => {
                            clearOcrBoxesForPage(images[currentIndex]);
                            applyCurrentPageOcrBoxes([]);
                            setSelectedBoxes([]);
                            setOcrError(null);
                            setOcrStatusNote(null);
                            setManualSelectionEnabled(false);
                        }}
                        onSelectBox={updateSelectedBoxes}
                        manualSelectionEnabled={manualSelectionEnabled}
                        manualSelectionLoading={manualSelectionLoading}
                        onToggleManualSelection={() => {
                            if (manualSelectionLoading) {
                                return;
                            }
                            setManualSelectionEnabled((value) => !value);
                        }}
                        onRemoveManualBox={(boxId) => {
                            void handleRemoveManualBox(boxId);
                        }}
                        selectedBoxData={selectedBoxData}
                        vocabItems={vocabItems}
                        loading={ocrLoading}
                        error={ocrError}
                        statusNote={ocrStatusNote}
                        showBoxes={showBoxes}
                        onToggleShowBoxes={(next: boolean) => setShowBoxes(next)}
                    />
                )}
            </div>

            <div className="reader-controls">
                <button onClick={prev} disabled={currentIndex === 0}>
                    Précédent
                </button>
                <button onClick={next} disabled={currentIndex >= images.length - 1}>
                    Suivant
                </button>
            </div>
        </div>
    );
};

export default Reader;
