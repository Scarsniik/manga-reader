import { formatShortcutBinding } from "@/renderer/utils/shortcutBindings";

export const uniqueQuickReviewText = (
  values: Array<string | null | undefined>,
): string[] => Array.from(new Set(
  values.map((value) => String(value ?? "").trim()).filter(Boolean),
));

export const normalizeQuickReviewTextSlots = (
  values: Array<string | null | undefined>,
): string[] => values.map((value) => String(value ?? "").trim());

export const getQuickReviewShortcutLabel = (bindings: string[]): string => bindings
  .filter(Boolean)
  .map(formatShortcutBinding)
  .join(" / ");
