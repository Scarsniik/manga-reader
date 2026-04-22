import type { ChildProcessWithoutNullStreams } from "child_process";

export type RawOcrBlock = {
  box?: [number, number, number, number] | number[];
  vertical?: boolean;
  font_size?: number;
  angle?: number | null;
  prob?: number | null;
  language?: string | null;
  aspect_ratio?: number | null;
  mask_score?: number | null;
  lines?: string[];
  lines_coords?: Array<Array<[number, number]>>;
};

export type RawOcrResult = {
  version?: string;
  img_width?: number;
  img_height?: number;
  blocks?: RawOcrBlock[];
  profile?: OcrWorkerPageProfile | null;
};

export type NormalizedBox = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  vertical?: boolean;
  lines?: string[];
  manual?: boolean;
};

export type NormalizedPageBlock = {
  id: string;
  text: string;
  bboxPx: { x1: number; y1: number; x2: number; y2: number };
  bbox: { x: number; y: number; w: number; h: number };
  vertical: boolean;
  fontSize?: number;
  angle?: number | null;
  detectorConfidence?: number | null;
  language?: string | null;
  aspectRatio?: number | null;
  maskScore?: number | null;
  lines: Array<{ text: string; polygon?: Array<[number, number]> }>;
  confidence?: number | null;
  filteredOut?: boolean;
  filterReason?: string | null;
};

export type NormalizedOcrResult = {
  engine: "mokuro";
  width: number;
  height: number;
  boxes: NormalizedBox[];
  fromCache?: boolean;
  debug?: {
    cacheKey: string;
    computedAt: string;
    forceRefreshUsed: boolean;
    fromCache: boolean;
    source?: "manga-file" | "app-cache" | "backend";
  };
  page?: {
    version: string;
    engine: "mokuro";
    source: {
      imagePath: string;
      width: number;
      height: number;
    };
    fromCache: boolean;
    blocks: NormalizedPageBlock[];
  };
};

export type OcrLanguageDetectionStatus = "not_run" | "likely_japanese" | "likely_non_japanese" | "uncertain";

export type OcrLanguageDetectionSample = {
  pageIndex: number;
  imagePath: string;
  localUrl: string;
  previewText: string;
  japaneseChars: number;
  latinChars: number;
  meaningfulChars: number;
  ratioJapanese: number | null;
};

export type OcrLanguageDetection = {
  status: OcrLanguageDetectionStatus;
  score: number | null;
  sampledPages: number[];
  sampledAt?: string;
  appliedLanguageTag?: boolean;
  source?: "metadata" | "ocr-samples" | "reader-page";
  sampleDetails?: OcrLanguageDetectionSample[];
};

export type MangaOcrPageEntry = {
  schemaVersion?: string;
  status: "pending" | "done" | "error";
  pageIndex: number;
  pageNumber: number;
  fileName: string;
  imagePath: string;
  sourceSize?: number;
  sourceMtimeMs?: number;
  width?: number;
  height?: number;
  boxes?: NormalizedBox[];
  blocks?: NormalizedPageBlock[];
  manualBoxes?: NormalizedBox[];
  computedAt?: string;
  errorMessage?: string;
  passProfile?: OcrPassProfile;
};

export type MangaOcrFile = {
  version: string;
  engine: "mokuro";
  manga: {
    id: string;
    title: string;
    rootPath: string;
  };
  languageDetection: OcrLanguageDetection;
  progress: {
    totalPages: number;
    completedPages: number;
    failedPages: number;
    lastProcessedPage?: number;
    mode?: "on_demand" | "full_manga";
    updatedAt?: string;
  };
  pages: Record<string, MangaOcrPageEntry>;
};

export type OcrQueueJobStatus = "queued" | "detecting_language" | "running" | "paused" | "completed" | "error" | "cancelled";
export type OcrQueueJobMode = "on_demand" | "full_manga";
export type OcrQueueJobPriority = "background" | "user_requested" | "user_waiting";
export type MangaVocabularyMode = "unique" | "all";

export type JpdbParseToken = [number | number[] | null, number, number, unknown];

export type JpdbParseResult = {
  tokens?: JpdbParseToken[];
  vocabulary?: unknown[];
};

export type OcrQueueJob = {
  id: string;
  mangaId: string;
  mangaTitle: string;
  mangaPath: string;
  status: OcrQueueJobStatus;
  mode: OcrQueueJobMode;
  overwrite: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  currentPage?: number;
  currentPagePath?: string;
  message?: string | null;
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  languageDetection?: OcrLanguageDetection | null;
  priority: OcrQueueJobPriority;
  heavyPass?: boolean;
};

export type OcrPassProfile = "standard" | "heavy";

export type OcrNumericRecord = Record<string, number>;

export type OcrWorkerPageProfilePass = {
  name?: string;
  kind?: string;
  duration_ms?: number;
  blocks_detected?: number;
  candidate_count?: number;
  accepted_candidates?: number;
  added_candidates?: number;
  replaced_candidates?: number;
  replaced_blocks?: number;
  skipped_candidates?: number;
  final_blocks?: number;
};

export type OcrWorkerPageProfile = {
  version?: string;
  duration_ms?: number;
  text_detector?: {
    calls?: number;
    total_ms?: number;
  };
  mocr?: {
    calls?: number;
    total_ms?: number;
  };
  line_variants?: {
    chunks_total?: number;
    variant_triggered_chunks?: number;
    variant_skipped_chunks?: number;
    selected_total?: OcrNumericRecord;
    selected_when_triggered?: OcrNumericRecord;
    candidate_evaluations?: OcrNumericRecord;
    improved_selections?: number;
    score_gain_total?: number;
  };
  truncated_refine?: {
    calls?: number;
    accepted?: number;
  };
  passes?: OcrWorkerPageProfilePass[];
  final_blocks?: {
    count?: number;
    by_origin?: OcrNumericRecord;
  };
};

export type MangaOcrProfilePageEntry = {
  pageIndex: number;
  pageNumber: number;
  imagePath: string;
  source: "backend" | "app-cache" | "manga-file";
  computedAt: string;
  status?: "done" | "error";
  errorMessage?: string;
  profile?: OcrWorkerPageProfile | null;
};

export type MangaOcrProfileSummaryPass = {
  kind: string;
  name: string;
  runs: number;
  durationMs: number;
  blocksDetected: number;
  candidateCount: number;
  acceptedCandidates: number;
  addedCandidates: number;
  replacedCandidates: number;
  replacedBlocks: number;
  skippedCandidates: number;
  finalBlocks: number;
};

export type MangaOcrProfileSummary = {
  backendPages: number;
  appCachePages: number;
  mangaFilePages: number;
  profiledPages: number;
  totalDurationMs: number;
  totalMocrCalls: number;
  totalMocrMs: number;
  totalTextDetectorCalls: number;
  totalTextDetectorMs: number;
  lineSelectedTotal: OcrNumericRecord;
  lineSelectedWhenTriggered: OcrNumericRecord;
  lineCandidateEvaluations: OcrNumericRecord;
  finalBlockOrigins: OcrNumericRecord;
  truncatedRefineCalls: number;
  truncatedRefineAccepted: number;
  passes: Record<string, MangaOcrProfileSummaryPass>;
};

export type MangaOcrProfileFile = {
  version: string;
  manga: {
    id: string;
    title: string;
    rootPath: string;
  };
  session: {
    id: string;
    mode: OcrQueueJobMode;
    overwrite: boolean;
    heavyPass: boolean;
    status: OcrQueueJobStatus;
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    totalPages: number;
    pages: Record<string, MangaOcrProfilePageEntry>;
    summary: MangaOcrProfileSummary;
  };
};

export type MangaVocabularyFile = {
  version: string;
  manga: {
    id: string;
    title: string;
    rootPath: string;
  };
  source: {
    mode: MangaVocabularyMode;
    extractedAt: string;
    ocrFilePath: string;
    ocrUpdatedAt?: string;
    phraseCount: number;
    processedPages: number;
    failedPages: number;
  };
  counts: {
    allTokens: number;
    uniqueTokens: number;
    outputTokens: number;
  };
  tokens: string[];
};

export type MangaVocabularyStatus = {
  exists: boolean;
  filePath: string;
  mode: MangaVocabularyMode | null;
  extractedAt?: string;
  allTokens: number;
  uniqueTokens: number;
  outputTokens: number;
};

export type OcrMangaStatus = {
  exists: boolean;
  filePath: string;
  progress: MangaOcrFile["progress"];
  languageDetection: OcrLanguageDetection;
  activeJob: OcrQueueJobSnapshot | null;
  completedPages: number;
  totalPages: number;
  vocabulary: MangaVocabularyStatus;
};

export type OcrQueueJobSnapshot = Omit<OcrQueueJob, "pauseRequested" | "cancelRequested">;

export type WorkerResponse = {
  id?: string;
  ok?: boolean;
  error?: string;
  traceback?: string;
  python?: string;
  candidatePaths?: string[];
  result?: any;
};

export type PendingRequest = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

export type OcrWorkerState = {
  process: ChildProcessWithoutNullStreams;
  pending: Map<string, PendingRequest>;
  stderrLines: string[];
};

export type OcrRuntimeAssets = {
  root: string;
  workerScriptPath?: string;
  pythonExecutable?: string;
  pythonHome?: string;
  pythonLib?: string;
  pythonSitePackages?: string;
  modelDir?: string;
  cacheRoot?: string;
  repoRoot?: string;
  pathEntries: string[];
};
