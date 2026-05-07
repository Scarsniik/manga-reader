import { Manga } from '@/renderer/types';
import { ScraperRuntimeChapterResult } from '@/renderer/utils/scraperRuntime';
import {
    ManualSelection,
    OcrNavigationDirection,
    ReaderOcrBox,
} from './types';

type OcrDirectionalCandidateMetrics = {
    primaryDistance: number;
    primaryBacktrackDistance: number;
    effectivePrimaryDistance: number;
    secondaryDistance: number;
    secondaryOverlap: number;
};

export type ReaderOcrNavigationOptions = {
    alignmentOffsetRatio: number;
    deadZoneRatio: number;
    strictDirection: boolean;
    looseFallback: boolean;
};

const BASE_OCR_PAGE_MEMORY_CACHE = 6;

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

export const copyImageViaBrowserClipboard = async (
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

export const normalizeBooleanSetting = (value: unknown, fallback: boolean): boolean => (
    typeof value === 'boolean' ? value : fallback
);

export const filterVisibleOcrBoxes = (boxes: ReaderOcrBox[]): ReaderOcrBox[] => (
    boxes.filter((box) => typeof box.text === 'string' && box.text.trim().length > 0)
);

export const splitReaderOcrBoxes = (boxes: ReaderOcrBox[]) => ({
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

export const cropImageSelectionToDataUrl = async (
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

export const orderManualCropBoxesForReading = (
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

export const createMergedManualSelection = (
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

export const getNormalizedOverlapArea = (
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

export const getManualSelectionPageBoxCandidates = (
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

export const scoreManualSelectionCandidate = (box: ReaderOcrBox | null): number => {
    if (!box || !box.text) {
        return -1000;
    }

    const compactText = box.text.replace(/\s+/g, '');
    const lineCount = Array.isArray(box.lines) ? box.lines.filter(Boolean).length : 0;
    return compactText.length + (lineCount * 6);
};

export const getMaxOcrPageMemoryCache = (preloadPageCount: number | null): number => (
    Math.max(BASE_OCR_PAGE_MEMORY_CACHE, ((preloadPageCount ?? 0) * 2) + 1)
);

export const getOrderedOcrPreRenderSources = (
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

export const getOcrSourceLabel = (source?: string | null) => (
    source === 'manga-file'
        ? 'fichier OCR du manga'
        : source === 'app-cache'
            ? 'cache disque'
            : source === 'reader-memory'
                ? 'cache memoire du reader'
                : 'calcul backend'
);

export const normalizeReaderAssetSrc = (value?: string | null): string | null => {
    const src = String(value ?? '').trim();
    if (!src) {
        return null;
    }

    if (
        src.startsWith('http://')
        || src.startsWith('https://')
        || src.startsWith('data:')
        || src.startsWith('blob:')
        || src.startsWith('local://')
        || src.startsWith('scraper-thumb://')
    ) {
        return src;
    }

    if (src.startsWith('file://')) {
        return src.replace(/^file:\/\//, 'local://');
    }

    if (src.match(/^[A-Za-z]:\\/)) {
        return `local:///${src.replace(/\\/g, '/')}`;
    }

    if (src.startsWith('/')) {
        return `local://${src}`;
    }

    return `local://${src.replace(/\\/g, '/')}`;
};

export const isSameScraperChapter = (
    left?: ScraperRuntimeChapterResult | null,
    right?: ScraperRuntimeChapterResult | null,
): boolean => {
    if (!left || !right) {
        return false;
    }

    return left.url === right.url || left.label === right.label;
};

const getOcrBoxCenter = (box: ReaderOcrBox) => ({
    x: box.bbox.x + (box.bbox.w / 2),
    y: box.bbox.y + (box.bbox.h / 2),
});

const getAxisOverlap = (
    startA: number,
    endA: number,
    startB: number,
    endB: number,
    axisOffset: number = 0,
): number => (
    Math.max(0, Math.min(endA + axisOffset, endB) - Math.max(startA - axisOffset, startB))
);

const getDirectionalOcrCandidateMetrics = (
    currentBox: ReaderOcrBox,
    candidateBox: ReaderOcrBox,
    direction: OcrNavigationDirection,
    options: ReaderOcrNavigationOptions,
): OcrDirectionalCandidateMetrics | null => {
    const currentCenter = getOcrBoxCenter(currentBox);
    const candidateCenter = getOcrBoxCenter(candidateBox);
    const axisOffset = Math.max(0, Math.min(0.5, options.alignmentOffsetRatio));
    const deadZone = Math.max(0, Math.min(0.5, options.deadZoneRatio));
    const epsilon = 0.0001;

    let primaryDistance = 0;
    let primaryBacktrackDistance = 0;
    let secondaryDistance = 0;
    let secondaryOverlap = 0;

    const resolvePrimaryDistance = (rawPrimaryDistance: number) => {
        if (options.strictDirection) {
            if (rawPrimaryDistance <= deadZone + epsilon) {
                return false;
            }

            primaryDistance = rawPrimaryDistance;
            primaryBacktrackDistance = 0;
            return true;
        }

        if (rawPrimaryDistance < -axisOffset - epsilon) {
            return false;
        }

        if (rawPrimaryDistance > 0 && rawPrimaryDistance <= deadZone + epsilon) {
            return false;
        }

        primaryDistance = Math.max(0, rawPrimaryDistance);
        primaryBacktrackDistance = Math.max(0, -rawPrimaryDistance);
        return true;
    };

    if (direction === 'left') {
        const rawPrimaryDistance = currentCenter.x - candidateCenter.x;
        if (!resolvePrimaryDistance(rawPrimaryDistance)) {
            return null;
        }
        secondaryDistance = Math.abs(candidateCenter.y - currentCenter.y);
        secondaryOverlap = getAxisOverlap(
            currentBox.bbox.y,
            currentBox.bbox.y + currentBox.bbox.h,
            candidateBox.bbox.y,
            candidateBox.bbox.y + candidateBox.bbox.h,
            axisOffset,
        );
    } else if (direction === 'right') {
        const rawPrimaryDistance = candidateCenter.x - currentCenter.x;
        if (!resolvePrimaryDistance(rawPrimaryDistance)) {
            return null;
        }
        secondaryDistance = Math.abs(candidateCenter.y - currentCenter.y);
        secondaryOverlap = getAxisOverlap(
            currentBox.bbox.y,
            currentBox.bbox.y + currentBox.bbox.h,
            candidateBox.bbox.y,
            candidateBox.bbox.y + candidateBox.bbox.h,
            axisOffset,
        );
    } else if (direction === 'up') {
        const rawPrimaryDistance = currentCenter.y - candidateCenter.y;
        if (!resolvePrimaryDistance(rawPrimaryDistance)) {
            return null;
        }
        secondaryDistance = Math.abs(candidateCenter.x - currentCenter.x);
        secondaryOverlap = getAxisOverlap(
            currentBox.bbox.x,
            currentBox.bbox.x + currentBox.bbox.w,
            candidateBox.bbox.x,
            candidateBox.bbox.x + candidateBox.bbox.w,
            axisOffset,
        );
    } else {
        const rawPrimaryDistance = candidateCenter.y - currentCenter.y;
        if (!resolvePrimaryDistance(rawPrimaryDistance)) {
            return null;
        }
        secondaryDistance = Math.abs(candidateCenter.x - currentCenter.x);
        secondaryOverlap = getAxisOverlap(
            currentBox.bbox.x,
            currentBox.bbox.x + currentBox.bbox.w,
            candidateBox.bbox.x,
            candidateBox.bbox.x + candidateBox.bbox.w,
            axisOffset,
        );
    }

    return {
        primaryDistance,
        primaryBacktrackDistance,
        effectivePrimaryDistance: primaryDistance + (primaryBacktrackDistance * 1.5),
        secondaryDistance,
        secondaryOverlap,
    };
};

const isBetterAlignedOcrCandidate = (
    metrics: OcrDirectionalCandidateMetrics,
    bestMetrics: OcrDirectionalCandidateMetrics,
    epsilon: number,
): boolean => {
    if (metrics.effectivePrimaryDistance < bestMetrics.effectivePrimaryDistance - epsilon) {
        return true;
    }
    if (metrics.effectivePrimaryDistance > bestMetrics.effectivePrimaryDistance + epsilon) {
        return false;
    }

    if (metrics.primaryBacktrackDistance < bestMetrics.primaryBacktrackDistance - epsilon) {
        return true;
    }
    if (metrics.primaryBacktrackDistance > bestMetrics.primaryBacktrackDistance + epsilon) {
        return false;
    }

    if (metrics.secondaryDistance < bestMetrics.secondaryDistance - epsilon) {
        return true;
    }
    if (metrics.secondaryDistance > bestMetrics.secondaryDistance + epsilon) {
        return false;
    }

    return metrics.secondaryOverlap > bestMetrics.secondaryOverlap + epsilon;
};

const isBetterLooseOcrCandidate = (
    metrics: OcrDirectionalCandidateMetrics,
    bestMetrics: OcrDirectionalCandidateMetrics,
    epsilon: number,
): boolean => {
    if (metrics.secondaryDistance < bestMetrics.secondaryDistance - epsilon) {
        return true;
    }
    if (metrics.secondaryDistance > bestMetrics.secondaryDistance + epsilon) {
        return false;
    }

    if (metrics.effectivePrimaryDistance < bestMetrics.effectivePrimaryDistance - epsilon) {
        return true;
    }
    if (metrics.effectivePrimaryDistance > bestMetrics.effectivePrimaryDistance + epsilon) {
        return false;
    }

    if (metrics.primaryBacktrackDistance < bestMetrics.primaryBacktrackDistance - epsilon) {
        return true;
    }
    if (metrics.primaryBacktrackDistance > bestMetrics.primaryBacktrackDistance + epsilon) {
        return false;
    }

    return metrics.secondaryOverlap > bestMetrics.secondaryOverlap + epsilon;
};

const findDirectionalOcrBoxCandidate = (
    boxes: ReaderOcrBox[],
    currentBox: ReaderOcrBox,
    direction: OcrNavigationDirection,
    options: ReaderOcrNavigationOptions,
    requireSecondaryOverlap: boolean,
): ReaderOcrBox | null => {
    let bestCandidate: ReaderOcrBox | null = null;
    let bestMetrics: OcrDirectionalCandidateMetrics | null = null;
    const epsilon = 0.0001;

    boxes.forEach((candidateBox) => {
        if (candidateBox.id === currentBox.id) {
            return;
        }

        const metrics = getDirectionalOcrCandidateMetrics(currentBox, candidateBox, direction, options);
        if (metrics === null || (requireSecondaryOverlap && metrics.secondaryOverlap <= epsilon)) {
            return;
        }

        if (!bestMetrics) {
            bestMetrics = metrics;
            bestCandidate = candidateBox;
            return;
        }

        const isBetterCandidate = requireSecondaryOverlap
            ? isBetterAlignedOcrCandidate(metrics, bestMetrics, epsilon)
            : isBetterLooseOcrCandidate(metrics, bestMetrics, epsilon);

        if (isBetterCandidate) {
            bestMetrics = metrics;
            bestCandidate = candidateBox;
        }
    });

    return bestCandidate;
};

export const findDirectionalOcrBox = (
    boxes: ReaderOcrBox[],
    currentBox: ReaderOcrBox,
    direction: OcrNavigationDirection,
    options: ReaderOcrNavigationOptions = {
        alignmentOffsetRatio: 0,
        deadZoneRatio: 0,
        strictDirection: true,
        looseFallback: true,
    },
): ReaderOcrBox | null => {
    const alignedCandidate = findDirectionalOcrBoxCandidate(boxes, currentBox, direction, options, true);
    if (alignedCandidate || !options.looseFallback) {
        return alignedCandidate;
    }

    return findDirectionalOcrBoxCandidate(boxes, currentBox, direction, options, false);
};

export const isRemoteScraperManga = (manga: Manga | null): boolean => (
    manga?.sourceKind === 'scraper' && !manga?.path
);

export const isScraperReaderManga = (manga: Manga | null): boolean => (
    isRemoteScraperManga(manga) && String(manga?.id || '').startsWith('scraper-')
);
