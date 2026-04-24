export const DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT = 2;
export const MAX_READER_OCR_PRELOAD_PAGE_COUNT = 10;
export const DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT = 2;
export const MAX_READER_IMAGE_PRELOAD_PAGE_COUNT = 10;
export const DEFAULT_READER_IMAGE_MAX_WIDTH = 1100;
export const MIN_READER_IMAGE_MAX_WIDTH = 480;
export const MAX_READER_IMAGE_MAX_WIDTH = 2400;
export const DEFAULT_READER_SCROLL_STRENGTH = 60;
export const MIN_READER_SCROLL_STRENGTH = 10;
export const MAX_READER_SCROLL_STRENGTH = 200;

const parseNumericSetting = (value: unknown): number => {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        return Number(value);
    }

    return Number.NaN;
};

const normalizeIntegerSetting = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number => {
    const parsed = parseNumericSetting(value);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

export const normalizeReaderOcrPreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_OCR_PRELOAD_PAGE_COUNT,
    )
);

export const normalizeReaderImagePreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_IMAGE_PRELOAD_PAGE_COUNT,
    )
);

export const normalizeReaderImageMaxWidth = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_IMAGE_MAX_WIDTH,
        MIN_READER_IMAGE_MAX_WIDTH,
        MAX_READER_IMAGE_MAX_WIDTH,
    )
);

export const normalizeReaderScrollStrength = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_STRENGTH,
        MIN_READER_SCROLL_STRENGTH,
        MAX_READER_SCROLL_STRENGTH,
    )
);
