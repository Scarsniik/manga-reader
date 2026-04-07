import React from 'react';
import { Manga } from '@/renderer/types';
import { getOcrApi, mockOcrRecognize } from '@/renderer/utils/mockOcr';
import {
    ManualSelection,
    OcrNavigationDirection,
    ReaderOcrBox,
    ReaderOcrLoadResult,
} from '../types';
import {
    createMergedManualSelection,
    cropImageSelectionToDataUrl,
    filterVisibleOcrBoxes,
    findDirectionalOcrBox,
    getManualSelectionPageBoxCandidates,
    getMaxOcrPageMemoryCache,
    getOcrSourceLabel,
    getOrderedOcrPreRenderSources,
    scoreManualSelectionCandidate,
    splitReaderOcrBoxes,
} from '../utils';

type Args = {
    activeOcrEnabled: boolean;
    currentImageSrc: string | null;
    currentIndex: number;
    images: string[];
    manga: Manga | null;
    preloadPageCount: number | null;
    imgRef: React.RefObject<HTMLImageElement | null>;
};

const useReaderOcr = ({
    activeOcrEnabled,
    currentImageSrc,
    currentIndex,
    images,
    manga,
    preloadPageCount,
    imgRef,
}: Args) => {
    const [showBoxes, setShowBoxes] = React.useState<boolean>(true);
    const [detectedBoxes, setDetectedBoxes] = React.useState<ReaderOcrBox[]>([]);
    const [manualBoxes, setManualBoxes] = React.useState<ReaderOcrBox[]>([]);
    const [selectedBoxes, setSelectedBoxes] = React.useState<string[]>([]);
    const [tokenCycleRequest, setTokenCycleRequest] = React.useState<{
        selectionKey: string | null;
        nonce: number;
    }>({
        selectionKey: null,
        nonce: 0,
    });
    const [manualSelectionEnabled, setManualSelectionEnabled] = React.useState<boolean>(false);
    const [manualSelectionLoading, setManualSelectionLoading] = React.useState<boolean>(false);
    const [ocrLoading, setOcrLoading] = React.useState<boolean>(false);
    const [ocrError, setOcrError] = React.useState<string | null>(null);
    const [ocrStatusNote, setOcrStatusNote] = React.useState<string | null>(null);
    const ocrPageCacheRef = React.useRef<Map<string, ReaderOcrBox[]>>(new Map());
    const ocrInFlightRef = React.useRef<Map<string, Promise<ReaderOcrLoadResult>>>(new Map());
    const ocrRequestTokenRef = React.useRef<number>(0);

    const allOcrBoxes = React.useMemo(
        () => [...detectedBoxes, ...manualBoxes],
        [detectedBoxes, manualBoxes],
    );

    const rememberOcrBoxesForPage = React.useCallback((src: string, boxes: ReaderOcrBox[]) => {
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

    const clearOcrBoxesForPage = React.useCallback((src?: string | null) => {
        if (!src) {
            return;
        }

        ocrPageCacheRef.current.delete(src);
    }, []);

    const applyCurrentPageOcrBoxes = React.useCallback((boxes: ReaderOcrBox[]) => {
        const splitBoxes = splitReaderOcrBoxes(boxes);
        setDetectedBoxes(splitBoxes.detected);
        setManualBoxes(splitBoxes.manual);
    }, []);

    const updateSelectedBoxes = React.useCallback((id: string | null, additive?: boolean) => {
        if (!id) {
            setSelectedBoxes([]);
            return;
        }

        setSelectedBoxes((previousSelection) => {
            const nextSelection = new Set(previousSelection);
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

    const loadOcrBoxesForPage = React.useCallback(async (
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

    const handleManualSelectionComplete = React.useCallback(async (selection: ManualSelection) => {
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
        } catch (error: any) {
            setOcrError(String(error && error.message ? error.message : error));
        } finally {
            setManualSelectionLoading(false);
        }
    }, [
        applyCurrentPageOcrBoxes,
        currentIndex,
        detectedBoxes,
        images,
        imgRef,
        manualBoxes,
        manga,
        rememberOcrBoxesForPage,
    ]);

    const handleRemoveManualBox = React.useCallback(async (boxId: string) => {
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
            setSelectedBoxes((previousSelection) => previousSelection.filter((id) => id !== boxId));
            setOcrStatusNote('Selection manuelle retiree');
        } catch (error: any) {
            setOcrError(String(error && error.message ? error.message : error));
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

    const focusOcrBox = React.useCallback((boxId: string) => {
        const imageElement = imgRef.current;
        if (!imageElement) {
            return;
        }

        const targetBox = [...detectedBoxes, ...manualBoxes].find((box) => box.id === boxId);
        if (!targetBox) {
            return;
        }

        const imageRect = imageElement.getBoundingClientRect();
        if (!imageRect.width || !imageRect.height) {
            imageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const bubbleCenterY = imageRect.top + ((targetBox.bbox.y + (targetBox.bbox.h / 2)) * imageRect.height);
        const absoluteBubbleCenterY = window.scrollY + bubbleCenterY;
        const targetScrollTop = Math.max(0, absoluteBubbleCenterY - (window.innerHeight * 0.45));

        window.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
        });
    }, [detectedBoxes, imgRef, manualBoxes]);

    const navigateOcrBox = React.useCallback((direction: OcrNavigationDirection): boolean => {
        if (!activeOcrEnabled || allOcrBoxes.length === 0) {
            return false;
        }

        const currentSelectedId = selectedBoxes.length > 0
            ? selectedBoxes[selectedBoxes.length - 1]
            : null;
        const currentBox = currentSelectedId
            ? allOcrBoxes.find((box) => box.id === currentSelectedId) ?? null
            : null;
        const nextBox = currentBox
            ? findDirectionalOcrBox(allOcrBoxes, currentBox, direction)
            : allOcrBoxes[0];

        if (!nextBox) {
            return false;
        }

        setSelectedBoxes((previousSelection) => (
            previousSelection.length === 1 && previousSelection[0] === nextBox.id
                ? previousSelection
                : [nextBox.id]
        ));
        focusOcrBox(nextBox.id);
        return true;
    }, [activeOcrEnabled, allOcrBoxes, focusOcrBox, selectedBoxes]);

    const requestTokenCycle = React.useCallback(() => {
        if (selectedBoxes.length === 0) {
            return;
        }

        const selectionKey = selectedBoxes.join('|');
        setTokenCycleRequest((current) => ({
            selectionKey,
            nonce: current.selectionKey === selectionKey ? current.nonce + 1 : 1,
        }));
    }, [selectedBoxes]);

    const refreshOcr = React.useCallback(async () => {
        setOcrError(null);
        setOcrLoading(true);
        const requestToken = ocrRequestTokenRef.current + 1;
        ocrRequestTokenRef.current = requestToken;

        try {
            if (images.length === 0) {
                throw new Error('No image to OCR');
            }

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
        } catch (error: any) {
            if (requestToken !== ocrRequestTokenRef.current) {
                return;
            }

            applyCurrentPageOcrBoxes([]);
            setOcrError(String(error && error.message ? error.message : error));
            setOcrStatusNote(null);
        } finally {
            if (requestToken !== ocrRequestTokenRef.current) {
                return;
            }

            setOcrLoading(false);
        }
    }, [applyCurrentPageOcrBoxes, clearOcrBoxesForPage, currentIndex, images, loadOcrBoxesForPage]);

    const clearOcr = React.useCallback(() => {
        clearOcrBoxesForPage(images[currentIndex]);
        applyCurrentPageOcrBoxes([]);
        setSelectedBoxes([]);
        setOcrError(null);
        setOcrStatusNote(null);
        setManualSelectionEnabled(false);
    }, [applyCurrentPageOcrBoxes, clearOcrBoxesForPage, currentIndex, images]);

    const toggleManualSelection = React.useCallback(() => {
        if (manualSelectionLoading) {
            return;
        }

        setManualSelectionEnabled((value) => !value);
    }, [manualSelectionLoading]);

    React.useEffect(() => {
        if (!activeOcrEnabled) {
            applyCurrentPageOcrBoxes([]);
            setSelectedBoxes([]);
            setOcrError(null);
            setOcrLoading(false);
            setOcrStatusNote(null);
            setManualSelectionEnabled(false);
            setManualSelectionLoading(false);
            return;
        }

        const src = currentImageSrc;
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
            } catch (error: any) {
                if (cancelled || requestToken !== ocrRequestTokenRef.current) {
                    return;
                }

                applyCurrentPageOcrBoxes([]);
                setOcrError(String(error && error.message ? error.message : error));
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
    }, [activeOcrEnabled, applyCurrentPageOcrBoxes, currentImageSrc, currentIndex, loadOcrBoxesForPage]);

    React.useEffect(() => {
        if (!activeOcrEnabled || preloadPageCount === null || images.length === 0) {
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
    }, [activeOcrEnabled, currentIndex, images, loadOcrBoxesForPage, preloadPageCount]);

    return {
        showBoxes,
        setShowBoxes,
        detectedBoxes,
        manualBoxes,
        allOcrBoxes,
        selectedBoxes,
        tokenCycleRequest,
        manualSelectionEnabled,
        manualSelectionLoading,
        ocrLoading,
        ocrError,
        ocrStatusNote,
        updateSelectedBoxes,
        handleManualSelectionComplete,
        handleRemoveManualBox,
        focusOcrBox,
        navigateOcrBox,
        requestTokenCycle,
        refreshOcr,
        clearOcr,
        toggleManualSelection,
    };
};

export default useReaderOcr;
