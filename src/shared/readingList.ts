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
  authors?: string[];
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
  items: SavedReadingListItem<TReaderLocationState>[];
  createdAt: string;
};

export type SaveReadingListRequest<TReaderLocationState = unknown> = {
  items: SavedReadingListItem<TReaderLocationState>[];
  savedListId?: string;
};
