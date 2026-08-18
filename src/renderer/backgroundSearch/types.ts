import type { MultiSearchScraperRun, MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import type { ScraperLatestCheckpointRecord, ScraperRecord } from "@/shared/scraper";
import type {
  AuthorCorrespondenceReferenceSource,
  MangaCorrespondenceDiscoveryKind,
  MangaCorrespondenceDiscoveryOrigin,
  MangaCorrespondenceDiscoveryStatus,
  MangaCorrespondenceRequest,
  MangaCorrespondenceResultDecision,
  MangaCorrespondenceTraceStep,
} from "@/shared/backgroundSearch";

export type MangaCorrespondenceDiscovery = {
  key: string;
  kind: MangaCorrespondenceDiscoveryKind;
  value: string;
  normalizedValue: string;
  scraperId: string;
  scraperName: string;
  origin: MangaCorrespondenceDiscoveryOrigin;
  sourceUrl?: string;
  authorPageUrl?: string;
  authorTemplateContext?: Record<string, string | undefined>;
  parentStepIds: string[];
  evidenceCount: number;
  status: MangaCorrespondenceDiscoveryStatus;
  propagationConfidence?: "reference" | "directTitle" | "fuzzyTitle" | "manual";
  automaticInvalidation?: {
    code: "unproductiveTitle";
    message: string;
    invalidatedAt: string;
  };
  foundAt: string;
};

export type MangaCorrespondenceEngineCheckpointTask = {
  kind: MangaCorrespondenceDiscoveryKind;
  term: string;
  parentId?: string;
  initialGeneratedVariant?: boolean;
  protectedSeed?: boolean;
  directOnly?: boolean;
  directTargets?: Array<{
    scraperId: string;
    url: string;
    templateContext?: Record<string, string | undefined> | null;
  }>;
};

export type MangaCorrespondenceEngineCheckpoint = {
  version: 1;
  inputFingerprint: string;
  pendingTasks: MangaCorrespondenceEngineCheckpointTask[];
  processedTaskKeys: string[];
  processedDirectTargetKeys?: string[];
};

export type BackgroundListingRun = {
  key: string;
  name: string;
  scraper: ScraperRecord;
  query: string;
  status: "waiting" | "loading" | "done" | "error" | "cancelled";
  results: MultiSearchSourceResult[];
  pendingResults?: MultiSearchSourceResult[];
  pendingCandidates?: MultiSearchSourceResult[];
  cacheResults?: MultiSearchSourceResult[];
  fromCache?: boolean;
  loadedPages: number;
  checkedPages?: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  checkpoint?: ScraperLatestCheckpointRecord | null;
  checkpointUsed?: boolean;
  sourceExhausted?: boolean;
  quickConsecutiveSeenResultCount?: number;
  safetyLimitReached?: boolean;
  excludedByLanguageCount?: number;
  includedByLanguageCount?: number;
  languageRejectLimitReached?: boolean;
  excludedByBlacklistedTagCount?: number;
  error?: string;
};

export type MultiSearchBackgroundResult = {
  runs: MultiSearchScraperRun[];
  executionFingerprint?: string;
};

export type ListingBackgroundResult = {
  runs: BackgroundListingRun[];
  executionFingerprint?: string;
};

export type MangaCorrespondenceMatch = {
  key: string;
  source: MultiSearchSourceResult;
  analyzedTitle: string;
  alternativeTitles: string[];
  authors: string[];
  chapter?: string;
  chapterOverride?: MangaCorrespondenceChapterOverride;
  matchedTerm: string;
  discoveredByStepIds: string[];
  acceptedManually?: boolean;
};

export type MangaCorrespondenceChapterOverride = {
  value: string | null;
  scope: "match" | "group";
  updatedAt: string;
};

export type MangaCorrespondenceRejectionReason =
  | "titleMismatch"
  | "chapterMismatch"
  | "derivative"
  | "invalidatedResult";

export type MangaCorrespondenceRejectedDecision = "pending" | "accepted" | "dismissed";

export type MangaCorrespondenceRejectedCandidate = {
  key: string;
  source: MultiSearchSourceResult;
  analyzedTitle: string;
  alternativeTitles: string[];
  authors: string[];
  suggestedChapter?: string;
  chapterConfidence: "high" | "medium" | "low";
  matchedTerm?: string;
  rejectionReason: MangaCorrespondenceRejectionReason;
  score: number;
  scoreReasons: string[];
  discoveredByStepIds: string[];
  decision: MangaCorrespondenceRejectedDecision;
  acceptedChapter?: string;
  chapterOverride?: MangaCorrespondenceChapterOverride;
  useAsSearchSeed: boolean;
  searchSeedUsedInPass?: number;
};

export type MangaCorrespondenceBackgroundResult = {
  request: MangaCorrespondenceRequest;
  matches: MangaCorrespondenceMatch[];
  rejectedCandidates: MangaCorrespondenceRejectedCandidate[];
  rejectedCandidateCount: number;
  passNumber: number;
  trace: MangaCorrespondenceTraceStep[];
  searchedTitles: string[];
  searchedAuthors: string[];
  discoveries?: MangaCorrespondenceDiscovery[];
  resultDecisions?: MangaCorrespondenceResultDecision[];
  warnings?: MangaCorrespondenceWarning[];
  checkpoint?: MangaCorrespondenceEngineCheckpoint;
};

export type MangaCorrespondenceWarning = {
  key: string;
  code:
    | "unproductivePages"
    | "authorExpansion"
    | "automaticTitleInvalidation"
    | "taskExpansion";
  message: string;
  createdAt: string;
  term?: string;
  scraperId?: string;
  scraperName?: string;
  evidence?: Record<string, number | string | boolean>;
};

export type AuthorCorrespondenceMatch = {
  key: string;
  scraperId: string;
  scraperName: string;
  authorName: string;
  authorUrl: string;
  templateContext?: Record<string, string | undefined> | null;
  matchedName: string;
  discoveryMethods: Array<"reference" | "search" | "authorModule">;
  previewSources: MultiSearchSourceResult[];
};

export type AuthorCorrespondenceBackgroundResult = {
  referenceName: string;
  matches: AuthorCorrespondenceMatch[];
  searchedNames: string[];
  discoveries?: MangaCorrespondenceDiscovery[];
  mangaDiscovery?: {
    referenceTitle: string;
    names: string[];
    referenceSources: AuthorCorrespondenceReferenceSource[];
    result?: MangaCorrespondenceBackgroundResult;
  };
  advancedSearch?: {
    completedBatchCount: number;
    lastBatchMangaCount: number;
    processedMangaCount: number;
    discoveredMangaSourceCount: number;
    discoveredAuthorPageCount: number;
    remainingCandidateCount: number;
  };
  checkpoint?: {
    version: 1;
    inputFingerprint: string;
    completedUnitKeys: string[];
    candidates: Array<Omit<AuthorCorrespondenceMatch, "previewSources">>;
  };
};

export type BackgroundSearchExecutionResult =
  | MultiSearchBackgroundResult
  | ListingBackgroundResult
  | AuthorCorrespondenceBackgroundResult
  | MangaCorrespondenceBackgroundResult;
