export const DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT = 50;

export const normalizeScraperLatestDeepPageLimit = (value: unknown): number => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT;
  }

  return Math.max(1, Math.floor(parsed));
};
