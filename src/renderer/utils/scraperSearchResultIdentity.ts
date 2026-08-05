import type { ScraperSearchResultItem } from "@/shared/scraper";

export type ScraperSearchResultIdentityFallback = "none" | "title";

export const normalizeScraperSearchResultUrl = (
  value: string | null | undefined,
): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

export const buildScraperSearchResultIdentity = (
  scraperId: string,
  result: Pick<ScraperSearchResultItem, "detailUrl" | "title">,
  fallback: ScraperSearchResultIdentityFallback = "title",
): string => {
  const normalizedUrl = normalizeScraperSearchResultUrl(result.detailUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  if (fallback === "none") return "";
  return `title:${scraperId}:${result.title.normalize("NFKC").trim().toLocaleLowerCase()}`;
};

export const filterNewItemsByIdentity = <Item>(
  existingItems: Item[],
  incomingItems: Item[],
  getIdentity: (item: Item) => string,
): Item[] => {
  const seen = new Set(existingItems.map(getIdentity).filter(Boolean));
  return incomingItems.filter((item) => {
    const identity = getIdentity(item);
    if (!identity) return true;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

export const appendUniqueItemsByIdentity = <Item>(
  existingItems: Item[],
  incomingItems: Item[],
  getIdentity: (item: Item) => string,
): Item[] => [
  ...existingItems,
  ...filterNewItemsByIdentity(existingItems, incomingItems, getIdentity),
];
