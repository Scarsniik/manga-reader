import type {
  MultiSearchLanguageFilterModes,
  MultiSearchMergePhase,
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchReadingStatusFilter,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchReadingStatusFilterContext } from "@/renderer/components/MultiSearch/multiSearchReadingStatusFilters";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import type { ScraperViewHistoryRecord } from "@/shared/scraper";
import type {
  VisualImageFingerprint,
  VisualImageFingerprintInput,
} from "@/shared/visualImageFingerprint";
import type {
  ScraperCardPotentialMatchInput,
  ScraperCardPotentialMatchResult,
} from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import type { MangaMergeOptions } from "@/renderer/utils/mangaMatching/titleProfiles";
import type { ScraperTitleAnalysisConfig } from "@/shared/scraper";

export type MultiSearchMergeWorkerRequest = (
  | {
    type: "reset";
    sources: MultiSearchSourceResult[];
  }
  | {
    type: "append";
    sources: MultiSearchSourceResult[];
  }
  | {
    type: "clear";
  }
) & {
  requestId: number;
  refreshKey: number;
  options: MultiSearchMergeOptions;
};

export type MultiSearchMergeWorkerProgressResponse = {
  type: "progress";
  requestId: number;
  refreshKey: number;
  phase: Exclude<MultiSearchMergePhase, "idle" | "queued">;
  processedSourceCount: number;
  totalSourceCount: number;
  sourceCount: number;
  mergedGroupCount: number;
};

export type MultiSearchMergeWorkerMergedResponse = {
  type: "merged";
  requestId: number;
  refreshKey: number;
  mergedResults: MultiSearchMergedResult[];
  sourceCount: number;
  durationMs: number;
};

export type MultiSearchMergeWorkerResponse =
  | MultiSearchMergeWorkerProgressResponse
  | MultiSearchMergeWorkerMergedResponse;

export type BackendMultiSearchMergeCommand = {
  type: "request";
  sessionId: string;
  request: MultiSearchMergeWorkerRequest;
} | {
  type: "dispose";
  sessionId: string;
} | {
  type: "visualRequest";
  sessionId: string;
  request: BackendVisualMultiSearchRequest;
} | {
  type: "listRequest";
  sessionId: string;
  request: BackendMultiSearchListRequest;
} | {
  type: "potentialMatchRequest";
  sessionId: string;
  request: BackendPotentialMatchRequest;
};

export type BackendMultiSearchMergeResponse = {
  sessionId: string;
  response:
    | MultiSearchMergeWorkerResponse
    | BackendVisualMultiSearchResponse
    | BackendMultiSearchListResponse
    | BackendPotentialMatchResponse;
};

export type BackendPotentialMatchCandidates = {
  readingCandidates: ScraperPotentialMangaMatch[];
  bookmarkCandidates: ScraperPotentialMangaMatch[];
  readingListCandidates: ScraperPotentialMangaMatch[];
  titleAnalysisConfigs: Array<[string, ScraperTitleAnalysisConfig]>;
  mergeOptions: MangaMergeOptions;
};

export type BackendPotentialMatchRequest = {
  type: "potentialMatches";
  requestId: number;
  dataRevision: number;
  inputs: ScraperCardPotentialMatchInput[];
  candidates?: BackendPotentialMatchCandidates;
};

export type BackendPotentialMatchResponse = {
  type: "potentialMatchesProcessed";
  requestId: number;
  dataRevision: number;
  matches: Array<[string, ScraperCardPotentialMatchResult]>;
  durationMs: number;
  error?: string;
};

export type BackendMultiSearchListFilters = {
  languageFilterModes: MultiSearchLanguageFilterModes;
  readingStatusFilters: MultiSearchReadingStatusFilter[];
  textFilter: string;
  readingStatusContext: MultiSearchReadingStatusFilterContext;
  display?: {
    originalOnly: boolean;
    tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
    hideBlacklistedCards: boolean;
    viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
    newViewHistoryIds: Set<string>;
    showUnseenFirst: boolean;
    showUnseenOnly: boolean;
    splitResultIds?: Set<string>;
  };
};

export type BackendMultiSearchListRequest = {
  type: "listProcess";
  requestId: number;
  dataRevision: number;
  results?: MultiSearchMergedResult[];
  runs?: MultiSearchScraperRun[];
  filters: BackendMultiSearchListFilters;
};

export type BackendMultiSearchListResultReference = Omit<MultiSearchMergedResult, "sources"> & {
  sourceKeys: string[];
};

export type BackendMultiSearchListRunReference = {
  scraperId: string;
  sourceKeys: string[];
};

export type BackendMultiSearchListResponse = {
  type: "listProcessed";
  requestId: number;
  dataRevision: number;
  results: BackendMultiSearchListResultReference[];
  runs: BackendMultiSearchListRunReference[];
  durationMs: number;
  blacklistedResultCount: number;
  splitResultCount: number;
  languageResultCount: number;
  originalResultCount: number;
};

export type BackendVisualMultiSearchRequest = {
  type: "visualCandidates";
  requestId: number;
  results: MultiSearchMergedResult[];
  options: MultiSearchMergeOptions;
} | {
  type: "visualMerge";
  requestId: number;
  results: MultiSearchMergedResult[];
  options: MultiSearchMergeOptions;
  fingerprints: Array<[string, VisualImageFingerprint]>;
};

export type BackendVisualMultiSearchResponse = {
  type: "visualCandidates";
  requestId: number;
  inputs: VisualImageFingerprintInput[];
} | {
  type: "visualMerge";
  requestId: number;
  mergedResults: MultiSearchMergedResult[];
};
