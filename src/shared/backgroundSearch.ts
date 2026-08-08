import type { ScraperLatestResultLimitMode, ScraperRecord } from "./scraper";

export const BACKGROUND_SEARCH_SCHEMA_VERSION = 1;

export type BackgroundSearchKind =
  | "multiSearch"
  | "mangaCorrespondence"
  | "authorCorrespondence"
  | "scraperAuthor"
  | "latestSources"
  | "latestAuthors"
  | "authorFavoriteRefresh";

export type BackgroundSearchStatus =
  | "queued"
  | "running"
  | "completed"
  | "error"
  | "cancelled"
  | "interrupted"
  | "expired";

export type BackgroundSearchStorageMode = "memory" | "temporaryFile";

export type BackgroundSearchProgress = {
  completedUnits: number;
  currentLabel?: string;
  excludedResultCount?: number;
  resultCount: number;
  totalUnits?: number;
};

export type BackgroundSearchJobMetadata = {
  id: string;
  schemaVersion: number;
  kind: BackgroundSearchKind;
  title: string;
  primaryTerm: string;
  status: BackgroundSearchStatus;
  storageMode: BackgroundSearchStorageMode;
  retentionHours: number;
  createdAt: string;
  openedAt?: string | null;
  startedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  updatedAt: string;
  revision: number;
  progress: BackgroundSearchProgress;
  error?: string;
  inputAvailable: boolean;
  resultAvailable: boolean;
};

export type BackgroundSearchJob<TInput = unknown, TResult = unknown> = {
  metadata: BackgroundSearchJobMetadata;
  input: TInput;
  result?: TResult;
};

export type BackgroundSearchQueueSummary = {
  jobs: BackgroundSearchJobMetadata[];
  counts: {
    total: number;
    active: number;
    queued: number;
    running: number;
    completed: number;
    error: number;
    cancelled: number;
  };
};

export type CreateBackgroundSearchRequest<TInput = unknown> = {
  kind: BackgroundSearchKind;
  title: string;
  primaryTerm: string;
  storageMode: BackgroundSearchStorageMode;
  retentionHours: number;
  input: TInput;
};

export type UpdateBackgroundSearchRequest<TResult = unknown> = {
  jobId: string;
  progress: BackgroundSearchProgress;
  result?: TResult;
};

export type CompleteBackgroundSearchRequest<TResult = unknown> = {
  jobId: string;
  progress: BackgroundSearchProgress;
  result: TResult;
};

export type SaveBackgroundSearchResultRequest<TResult = unknown> = {
  jobId: string;
  result: TResult;
  resultCount?: number;
};

export type ContinueBackgroundSearchRequest<TInput = unknown> = {
  jobId: string;
  input: TInput;
};

export type ReplayBackgroundSearchRequest<TInput = unknown> = {
  jobId: string;
  input: TInput;
};

export type MultiSearchBackgroundInput = {
  query: string;
  scrapers: ScraperRecord[];
  maxPages: number | null;
  paceMode: "fast" | "careful";
  includedLanguageCodes: string[];
  scrapeDetailsWithCards: boolean;
  viewMode: "merged" | "byScraper";
  selectedLanguageCodes?: string[];
  selectedContentTypes?: string[];
  depthMode?: "quick" | "extended" | "advanced";
  advancedPages?: number | "maximum";
};

export type MangaCorrespondenceRequest = "sameManga" | "otherChapters";
export type MangaCorrespondenceStrategy = "balanced" | "titleFirst" | "authorFirst";
export type MangaCorrespondenceDiscoveryKind = "title" | "author";
export type MangaCorrespondenceDiscoveryStatus = "active" | "invalidated";
export type MangaCorrespondenceDiscoveryOrigin = "reference" | "card" | "details" | "authorPage" | "manual";

export type MangaCorrespondenceDiscoveryDecision = {
  key: string;
  status: MangaCorrespondenceDiscoveryStatus;
};

export type MangaCorrespondenceResultDecision = {
  key: string;
  status: MangaCorrespondenceDiscoveryStatus;
  title: string;
  analyzedTitle: string;
  alternativeTitles: string[];
  authors: string[];
  scraperId: string;
  scraperName: string;
  sourceUrl?: string;
  origin: "match" | "potential";
};

export type MangaCorrespondenceReference = {
  scraperId: string;
  sourceUrl: string;
  rawTitle: string;
  title: string;
  alternativeTitles: string[];
  authors: string[];
  authorUrls: string[];
  chapter?: string;
};

export type MangaCorrespondenceBackgroundInput = {
  reference: MangaCorrespondenceReference;
  request: MangaCorrespondenceRequest;
  strategy: MangaCorrespondenceStrategy;
  scraperFilterValues: string[];
  scrapers: ScraperRecord[];
  maxPages: number | null;
  paceMode: "fast" | "careful";
  scrapingConcurrency: number;
  scrapeDetailsWithCards: boolean;
  enableRomajiPhoneticMerge: boolean;
  purpose?: "correspondence" | "authorDiscovery";
  continuation?: {
    passNumber: number;
    seedCandidateKeys?: string[];
  };
  replay?: {
    revision: number;
    discoveryDecisions: MangaCorrespondenceDiscoveryDecision[];
    resultDecisions?: MangaCorrespondenceResultDecision[];
  };
};

export type MangaCorrespondenceTraceStepKind =
  | "titleSearch"
  | "titleDiscovered"
  | "authorDiscovered"
  | "authorSearch"
  | "manualAcceptance"
  | "passStarted";

export type MangaCorrespondenceTraceStep = {
  id: string;
  parentId?: string;
  kind: MangaCorrespondenceTraceStepKind;
  label: string;
  term: string;
  detail?: string;
  resultCount?: number;
  createdAt: string;
};

export type AuthorCorrespondenceReferenceSource = {
  scraperId: string;
  authorUrl: string;
  name: string;
  templateContext?: Record<string, string | undefined> | null;
};

export type AuthorCorrespondenceBackgroundInput = {
  referenceName: string;
  names: string[];
  referenceSources: AuthorCorrespondenceReferenceSource[];
  scraperFilterValues: string[];
  scrapers: ScraperRecord[];
  maxPages: number | null;
  authorPageCount?: number;
  paceMode: "fast" | "careful";
  scrapingConcurrency: number;
  scrapeDetailsWithCards: boolean;
  mangaSeed?: {
    reference: MangaCorrespondenceReference;
    enableRomajiPhoneticMerge: boolean;
  };
};

export type ListingBackgroundSource = {
  id: string;
  name: string;
  scraper: ScraperRecord;
  query: string;
  favoriteId?: string;
  favoriteUpdatedAt?: string;
  favoriteSourceName?: string;
  mode?: "homepage" | "search" | "author" | "tag";
  templateContext?: Record<string, string | undefined> | null;
  contextualAuthorNames?: string[];
  resultLimit?: number;
  resultTag?: {
    name: string;
    url: string;
  };
};

export type ListingBackgroundInput = {
  sources: ListingBackgroundSource[];
  favoriteId?: string;
  favoriteUpdatedAt?: string;
  maxPages: number | null;
  resultLimit?: number;
  tagResultLimit?: number;
  resultLimitMode?: ScraperLatestResultLimitMode;
  paceMode: "fast" | "careful";
  concurrency?: number;
  excludeBlacklistedTagCards?: boolean;
  tagBlacklistByScraper?: Record<string, Array<{
    value: string;
    label?: string;
    addedAt?: string;
  }>>;
  includedLanguageCodes: string[];
  scrapeDetailsWithCards: boolean;
  selectedFavoriteIds?: string[];
  selectedScraperIds?: string[];
  selectedTagFavoriteIds?: string[];
  searchMode?: "quick" | "continuous" | "deep";
  quickConsecutiveSeenStopThreshold?: number;
  languageRejectLimit?: number;
  performanceReportsEnabled?: boolean;
  useAuthorFavoriteCache?: boolean;
  authorFavoriteCacheMaxAgeHours?: number;
};

export type BackgroundSearchChangeEvent = {
  jobId: string;
  revision: number;
  status: BackgroundSearchStatus;
  progress: BackgroundSearchProgress;
  resultChanged?: boolean;
};
