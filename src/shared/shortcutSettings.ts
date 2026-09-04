export const DEFAULT_SHORTCUT_LONG_PRESS_DELAY_MS = 450;
export const MIN_SHORTCUT_LONG_PRESS_DELAY_MS = 200;
export const MAX_SHORTCUT_LONG_PRESS_DELAY_MS = 1_500;

export const normalizeShortcutLongPressDelay = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_SHORTCUT_LONG_PRESS_DELAY_MS;
  return Math.min(
    MAX_SHORTCUT_LONG_PRESS_DELAY_MS,
    Math.max(MIN_SHORTCUT_LONG_PRESS_DELAY_MS, Math.floor(numericValue)),
  );
};
