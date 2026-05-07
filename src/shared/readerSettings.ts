export const DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT = 2;
export const MAX_READER_OCR_PRELOAD_PAGE_COUNT = 10;
export const DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES = true;
export const DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS = false;
export const DEFAULT_READER_OCR_NAVIGATION_OFFSET = 6;
export const MIN_READER_OCR_NAVIGATION_OFFSET = 0;
export const MAX_READER_OCR_NAVIGATION_OFFSET = 25;
export const DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE = 1;
export const MIN_READER_OCR_NAVIGATION_DEAD_ZONE = 0;
export const MAX_READER_OCR_NAVIGATION_DEAD_ZONE = 10;
export const DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION = true;
export const DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK = true;
export const DEFAULT_READER_IMAGE_PRELOAD_PAGE_COUNT = 2;
export const MAX_READER_IMAGE_PRELOAD_PAGE_COUNT = 10;
export const DEFAULT_READER_IMAGE_MAX_WIDTH = 1100;
export const MIN_READER_IMAGE_MAX_WIDTH = 480;
export const MAX_READER_IMAGE_MAX_WIDTH = 2400;
export const DEFAULT_READER_SCROLL_STRENGTH = 60;
export const MIN_READER_SCROLL_STRENGTH = 10;
export const MAX_READER_SCROLL_STRENGTH = 200;
export const DEFAULT_READER_SCROLL_HOLD_SPEED = 280;
export const MIN_READER_SCROLL_HOLD_SPEED = 50;
export const MAX_READER_SCROLL_HOLD_SPEED = 500;
export const DEFAULT_READER_SCROLL_START_BOOST = 90;
export const MIN_READER_SCROLL_START_BOOST = 0;
export const MAX_READER_SCROLL_START_BOOST = 250;

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

const normalizeBooleanSetting = (value: unknown, fallback: boolean): boolean => (
    typeof value === "boolean" ? value : fallback
);

export const normalizeReaderOcrPreloadPageCount = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_PRELOAD_PAGE_COUNT,
        0,
        MAX_READER_OCR_PRELOAD_PAGE_COUNT,
    )
);

export const normalizeReaderOcrAutoAnalyzeBubbles = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES)
);

export const normalizeReaderOcrPreloadTokenDetails = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS)
);

export const normalizeReaderOcrNavigationOffset = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_NAVIGATION_OFFSET,
        MIN_READER_OCR_NAVIGATION_OFFSET,
        MAX_READER_OCR_NAVIGATION_OFFSET,
    )
);

export const normalizeReaderOcrNavigationDeadZone = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
        MIN_READER_OCR_NAVIGATION_DEAD_ZONE,
        MAX_READER_OCR_NAVIGATION_DEAD_ZONE,
    )
);

export const normalizeReaderOcrNavigationStrictDirection = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION)
);

export const normalizeReaderOcrNavigationLooseFallback = (value: unknown): boolean => (
    normalizeBooleanSetting(value, DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK)
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

export const normalizeReaderScrollHoldSpeed = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_HOLD_SPEED,
        MIN_READER_SCROLL_HOLD_SPEED,
        MAX_READER_SCROLL_HOLD_SPEED,
    )
);

export const normalizeReaderScrollStartBoost = (value: unknown): number => (
    normalizeIntegerSetting(
        value,
        DEFAULT_READER_SCROLL_START_BOOST,
        MIN_READER_SCROLL_START_BOOST,
        MAX_READER_SCROLL_START_BOOST,
    )
);
