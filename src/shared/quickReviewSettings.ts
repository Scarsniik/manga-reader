export const DEFAULT_QUICK_REVIEW_PREFETCH_COUNT = 2;
export const MIN_QUICK_REVIEW_PREFETCH_COUNT = 0;
export const MAX_QUICK_REVIEW_PREFETCH_COUNT = 20;
export const DEFAULT_QUICK_REVIEW_THUMBNAIL_SIZE = 112;
export const MIN_QUICK_REVIEW_THUMBNAIL_SIZE = 64;
export const MAX_QUICK_REVIEW_THUMBNAIL_SIZE = 240;
export const DEFAULT_QUICK_REVIEW_THUMBNAIL_MAX_COLUMNS = 2;
export const MIN_QUICK_REVIEW_THUMBNAIL_MAX_COLUMNS = 1;
export const MAX_QUICK_REVIEW_THUMBNAIL_MAX_COLUMNS = 6;
export const DEFAULT_QUICK_REVIEW_KEYBOARD_SCROLL_SPEED = 800;
export const MIN_QUICK_REVIEW_KEYBOARD_SCROLL_SPEED = 100;
export const MAX_QUICK_REVIEW_KEYBOARD_SCROLL_SPEED = 4000;

export const DEFAULT_QUICK_REVIEW_DISPLAY_SETTINGS = {
  quickReviewShowCover: true,
  quickReviewShowFacts: true,
  quickReviewShowDescription: true,
  quickReviewShowAuthors: true,
  quickReviewShowTags: true,
  quickReviewShowSourceWorks: true,
  quickReviewShowAvailableSources: true,
  quickReviewShowPotentialMatches: true,
  quickReviewShowThumbnails: true,
} as const;

export type QuickReviewDisplaySettings = {
  [Key in keyof typeof DEFAULT_QUICK_REVIEW_DISPLAY_SETTINGS]: boolean;
};

export const normalizeQuickReviewPrefetchCount = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_QUICK_REVIEW_PREFETCH_COUNT;
  return Math.min(
    MAX_QUICK_REVIEW_PREFETCH_COUNT,
    Math.max(MIN_QUICK_REVIEW_PREFETCH_COUNT, Math.floor(numericValue)),
  );
};

const normalizeInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(numericValue)));
};

export const normalizeQuickReviewThumbnailSize = (value: unknown): number => normalizeInteger(
  value,
  DEFAULT_QUICK_REVIEW_THUMBNAIL_SIZE,
  MIN_QUICK_REVIEW_THUMBNAIL_SIZE,
  MAX_QUICK_REVIEW_THUMBNAIL_SIZE,
);

export const normalizeQuickReviewThumbnailMaxColumns = (value: unknown): number => normalizeInteger(
  value,
  DEFAULT_QUICK_REVIEW_THUMBNAIL_MAX_COLUMNS,
  MIN_QUICK_REVIEW_THUMBNAIL_MAX_COLUMNS,
  MAX_QUICK_REVIEW_THUMBNAIL_MAX_COLUMNS,
);

export const normalizeQuickReviewKeyboardScrollSpeed = (value: unknown): number => normalizeInteger(
  value,
  DEFAULT_QUICK_REVIEW_KEYBOARD_SCROLL_SPEED,
  MIN_QUICK_REVIEW_KEYBOARD_SCROLL_SPEED,
  MAX_QUICK_REVIEW_KEYBOARD_SCROLL_SPEED,
);

export const normalizeQuickReviewDisplaySettings = (
  values: Record<string, unknown> | null | undefined,
): QuickReviewDisplaySettings => Object.fromEntries(
  Object.keys(DEFAULT_QUICK_REVIEW_DISPLAY_SETTINGS).map((key) => [key, values?.[key] !== false]),
) as QuickReviewDisplaySettings;
