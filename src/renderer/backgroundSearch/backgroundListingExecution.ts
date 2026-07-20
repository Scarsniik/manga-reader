export const resolveBackgroundListingConcurrency = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.floor(Number(fallback) || 1));
};
