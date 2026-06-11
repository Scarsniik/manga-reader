export type ScraperTagBlacklistEntry = {
  value: string;
  label?: string;
  addedAt?: string;
};

export type ScraperTagBlacklistByScraper = Record<string, ScraperTagBlacklistEntry[]>;

export type ScraperBlacklistedTagMatch = {
  tag: string;
  tagUrl?: string;
  entry: ScraperTagBlacklistEntry;
};

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

export const normalizeScraperTagBlacklistValue = (value: unknown): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).toString().toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
};

const getEntryMatchValues = (entry: ScraperTagBlacklistEntry): string[] => (
  [entry.value, entry.label]
    .map(normalizeScraperTagBlacklistValue)
    .filter(Boolean)
);

export const getScraperTagBlacklistEntries = (
  blacklist: ScraperTagBlacklistByScraper | null | undefined,
  scraperId: string,
): ScraperTagBlacklistEntry[] => {
  const entries = blacklist?.[scraperId];
  return Array.isArray(entries) ? entries : [];
};

export const buildScraperTagBlacklistEntry = (
  value: string,
  label?: string,
): ScraperTagBlacklistEntry => ({
  value: normalizeText(value),
  label: normalizeText(label) || normalizeText(value),
  addedAt: new Date().toISOString(),
});

export const findScraperTagBlacklistEntry = (
  entries: ScraperTagBlacklistEntry[],
  tag: string | null | undefined,
  tagUrl?: string | null,
): ScraperTagBlacklistEntry | null => {
  const tagValues = [tag, tagUrl]
    .map(normalizeScraperTagBlacklistValue)
    .filter(Boolean);

  if (!tagValues.length) {
    return null;
  }

  return entries.find((entry) => {
    const entryValues = getEntryMatchValues(entry);
    return entryValues.some((entryValue) => tagValues.includes(entryValue));
  }) ?? null;
};

export const getBlacklistedScraperTags = (
  entries: ScraperTagBlacklistEntry[],
  tags: readonly string[] | null | undefined,
  tagUrls?: readonly string[] | null,
): ScraperBlacklistedTagMatch[] => {
  const tagValues = Array.isArray(tags) ? tags : [];
  const tagUrlValues = Array.isArray(tagUrls) ? tagUrls : [];
  if ((!tagValues.length && !tagUrlValues.length) || !entries.length) {
    return [];
  }

  return Array.from({ length: Math.max(tagValues.length, tagUrlValues.length) })
    .reduce<ScraperBlacklistedTagMatch[]>((matches, _item, index) => {
      const tagUrl = tagUrlValues[index];
      const tag = tagValues[index] || tagUrl || "";
      if (!tag && !tagUrl) {
        return matches;
      }

      const entry = findScraperTagBlacklistEntry(entries, tag, tagUrl);
      if (!entry) {
        return matches;
      }

      matches.push({
        tag,
        tagUrl,
        entry,
      });
      return matches;
    }, []);
};

export const removeScraperTagBlacklistEntry = (
  entries: ScraperTagBlacklistEntry[],
  tag: string,
  tagUrl?: string,
): ScraperTagBlacklistEntry[] => {
  const tagValues = [tag, tagUrl]
    .map(normalizeScraperTagBlacklistValue)
    .filter(Boolean);

  if (!tagValues.length) {
    return entries;
  }

  return entries.filter((entry) => (
    !getEntryMatchValues(entry).some((entryValue) => tagValues.includes(entryValue))
  ));
};
