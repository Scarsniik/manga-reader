export type SavedReadingListReaderTarget<TReaderLocationState = unknown> = {
  kind: "reader";
  mangaId: string;
  page?: number;
  title?: string;
  locationState?: TReaderLocationState;
};

export type SavedReadingListScraperDetailsTarget = {
  kind: "scraper.details";
  scraperId: string;
  sourceUrl: string;
  title?: string;
};

export type SavedReadingListSourceTarget<TReaderLocationState = unknown> =
  | SavedReadingListReaderTarget<TReaderLocationState>
  | SavedReadingListScraperDetailsTarget;

export type SavedReadingListItemMetadata = {
  title: string;
  cover?: string | null;
  coverCandidates?: string[];
  authors?: string[];
  seriesTitle?: string;
  tags?: string[];
  languageCodes?: string[];
};

export type SavedReadingListItem<TReaderLocationState = unknown> = {
  id: string;
  metadata: SavedReadingListItemMetadata;
  sourceTarget: SavedReadingListSourceTarget<TReaderLocationState>;
};

export type SavedReadingList<TReaderLocationState = unknown> = {
  id: string;
  name: string;
  items: SavedReadingListItem<TReaderLocationState>[];
  createdAt: string;
};

export type SaveReadingListRequest<TReaderLocationState = unknown> = {
  name: string;
  items: SavedReadingListItem<TReaderLocationState>[];
  savedListId?: string;
};

const normalizeNameCandidate = (value: unknown): string => (
  typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : ""
);

const findMajorityValue = (
  items: SavedReadingListItem[],
  getValues: (item: SavedReadingListItem) => string[],
): string | null => {
  const valuesByKey = new Map<string, { count: number; value: string }>();

  items.forEach((item) => {
    const itemValues = new Map<string, string>();
    getValues(item).forEach((candidate) => {
      const value = normalizeNameCandidate(candidate);
      if (value) {
        itemValues.set(value.toLocaleLowerCase(), value);
      }
    });

    itemValues.forEach((value, key) => {
      const current = valuesByKey.get(key);
      valuesByKey.set(key, {
        count: (current?.count ?? 0) + 1,
        value: current?.value ?? value,
      });
    });
  });

  const majorityThreshold = items.length / 2;
  const majority = Array.from(valuesByKey.values())
    .filter(({ count }) => count > majorityThreshold)
    .sort((left, right) => right.count - left.count)[0];
  return majority?.value ?? null;
};

export const getDefaultReadingListName = (
  items: SavedReadingListItem[],
  inferredSeriesName?: string | null,
): string => {
  const normalizedInferredSeriesName = normalizeNameCandidate(inferredSeriesName);
  if (normalizedInferredSeriesName) {
    return normalizedInferredSeriesName;
  }

  const seriesName = findMajorityValue(items, (item) => (
    item.metadata.seriesTitle ? [item.metadata.seriesTitle] : []
  ));
  if (seriesName) {
    return seriesName;
  }

  return findMajorityValue(items, (item) => item.metadata.authors ?? [])
    ?? "Liste de lecture";
};
