import type { ScraperLatestResultLimitMode, ScraperRecord } from "./scraper";
import type { MangaCorrespondenceSafetySettings } from "./mangaCorrespondenceSafetySettings";

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

export type BackgroundSearchRelationAutomationStatus =
  | "waiting"
  | "manualReady"
  | "pending"
  | "processing"
  | "completed"
  | "blocked"
  | "error";

export type BackgroundSearchRelation = {
  kind: "authorExpansion";
  parentJobId: string;
  autoImportOnCompletion: boolean;
  blockAutomaticImportOnSafetyWarning: boolean;
  automationStatus: BackgroundSearchRelationAutomationStatus;
  importedCacheRevision?: number;
  automationError?: string;
};

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
  prefilled?: boolean;
  relation?: BackgroundSearchRelation;
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

export type CreateBackgroundSearchRequest<TInput = unknown, TResult = unknown> = {
  kind: BackgroundSearchKind;
  title: string;
  primaryTerm: string;
  storageMode: BackgroundSearchStorageMode;
  retentionHours: number;
  input: TInput;
  initialResult?: TResult;
  initialProgress?: BackgroundSearchProgress;
  relation?: Omit<BackgroundSearchRelation, "automationStatus">;
};

export type UpdateBackgroundSearchRelationRequest = {
  jobId: string;
  automationStatus: BackgroundSearchRelationAutomationStatus;
  importedCacheRevision?: number;
  automationError?: string;
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
  originalOnly?: boolean;
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
export type MangaCorrespondenceDiscoveryOrigin =
  | "reference"
  | "card"
  | "details"
  | "authorPage"
  | "manual"
  | "linkedAuthorSearch";

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
  thumbnailUrl?: string;
  thumbnailCandidates?: string[];
  summary?: string;
  pageCount?: string;
  languageCodes?: string[];
};

export type MangaCorrespondenceBackgroundInput = {
  reference: MangaCorrespondenceReference;
  authorPropagationReferenceNames?: string[];
  request: MangaCorrespondenceRequest;
  strategy: MangaCorrespondenceStrategy;
  scraperFilterValues: string[];
  scrapers: ScraperRecord[];
  maxPages: number | null;
  paceMode: "fast" | "careful";
  scrapingConcurrency: number;
  scrapeDetailsWithCards: boolean;
  enableRomajiPhoneticMerge: boolean;
  safety?: MangaCorrespondenceSafetySettings;
  linkedAuthorImports?: LinkedAuthorCorpusImport[];
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

export type LinkedAuthorCorpusImport = {
  authorJobId: string;
  sourceCacheRevision: number;
  importedCacheRevision: number;
  importedAt: string;
  names: string[];
  referenceSources: AuthorCorrespondenceReferenceSource[];
  autoRefreshOnCompletion?: boolean;
  blockAutomaticImportOnSafetyWarning?: boolean;
};

export const DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE = 3;
export const MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT = 20;

export type AuthorCorrespondenceAdvancedSearchRequest = {
  enabled: boolean;
  batchSize: number;
  requestedBatchCount: number;
  requestedProcessedMangaCount?: number;
  continueFromResult?: boolean;
  invalidatedAuthorMatchKeys?: string[];
  enableRomajiPhoneticMerge?: boolean;
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
  advancedSearch?: AuthorCorrespondenceAdvancedSearchRequest;
  correspondenceSafety?: MangaCorrespondenceSafetySettings;
  mangaReferences?: MangaCorrespondenceReference[];
  mangaSeed?: {
    reference: MangaCorrespondenceReference;
    enableRomajiPhoneticMerge: boolean;
  };
  replay?: {
    revision: number;
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
  originalOnly?: boolean;
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
