import {
  buildScraperViewHistoryCardId,
  type DownloadScraperMangaResult,
  type ScraperAccessValidationResult,
  type ScraperBookmarkMetadataField,
  type ScraperBookmarkRecord,
  type ScraperChapterItem,
  type ScraperDetailsDerivedValueResult,
  type ScraperDownloadJob,
  type ScraperFeatureValidationCheck,
  type ScraperFeatureValidationResult,
  type ScraperGlobalConfig,
  type ScraperRequestConfig,
  type ScraperRequestField,
  type ScraperReaderProgressRecord,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
  normalizeScraperViewHistorySourceUrl,
} from "../../scraper";

export const DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS = 10000;
export const MAX_SCRAPER_DOWNLOAD_PAGES = 4000;

export type InternalScraperDownloadJob = ScraperDownloadJob & {
  pageUrls: string[];
  defaultTagIds: string[];
  defaultLanguage?: string;
  autoAssignSeriesOnChapterDownload: boolean;
  seriesTitle: string;
  thumbnailUrl?: string;
  sourceChapterUrl?: string;
  sourceChapterLabel?: string;
  replaceMangaId?: string;
  cancelRequested?: boolean;
  abortController?: AbortController | null;
};

export type NormalizedScraperDownloadRequest = {
  title: string;
  pageUrls: string[];
  refererUrl?: string;
  scraperId?: string;
  scraperName?: string;
  sourceUrl?: string;
  sourceChapterUrl?: string;
  sourceChapterLabel?: string;
  replaceMangaId?: string;
  defaultTagIds: string[];
  defaultLanguage?: string;
  autoAssignSeriesOnChapterDownload: boolean;
  seriesTitle: string;
  chapterLabel: string;
  thumbnailUrl?: string;
};

export type CompletedScraperDownload = {
  result: DownloadScraperMangaResult;
  notifySeriesUpdated: boolean;
  libraryManga: any;
};

export const sanitizeAccessValidation = (
  validation: Partial<ScraperAccessValidationResult> | null | undefined,
): ScraperAccessValidationResult | null => {
  if (!validation) {
    return null;
  }

  return {
    ok: Boolean(validation.ok),
    kind: validation.kind === "api" ? "api" : "site",
    normalizedUrl: String(validation.normalizedUrl ?? ""),
    checkedAt: String(validation.checkedAt ?? ""),
    status: typeof validation.status === "number" ? validation.status : undefined,
    finalUrl: typeof validation.finalUrl === "string" ? validation.finalUrl : undefined,
    contentType: typeof validation.contentType === "string" ? validation.contentType : undefined,
  };
};

const sanitizeFeatureValidationCheck = (
  check: Partial<ScraperFeatureValidationCheck>,
): ScraperFeatureValidationCheck | null => {
  const allowedKeys = [
    "title",
    "cover",
    "description",
    "authors",
    "authorUrl",
    "tags",
    "status",
    "pageCount",
    "thumbnails",
    "thumbnailsNextPage",
    "chapters",
    "pages",
  ];
  if (!allowedKeys.includes(String(check.key))) {
    return null;
  }

  return {
    key: check.key as ScraperFeatureValidationCheck["key"],
    selector: String(check.selector ?? ""),
    required: Boolean(check.required),
    matchedCount: typeof check.matchedCount === "number" ? check.matchedCount : 0,
    sample: typeof check.sample === "string" ? check.sample : undefined,
    samples: Array.isArray(check.samples)
      ? check.samples.filter((value): value is string => typeof value === "string")
      : undefined,
    issueCode: check.issueCode === "invalid_selector" || check.issueCode === "no_match"
      ? check.issueCode
      : undefined,
  };
};

const sanitizeChapterItem = (
  chapter: Partial<ScraperChapterItem> | null | undefined,
): ScraperChapterItem | null => {
  if (!chapter) {
    return null;
  }

  const url = String(chapter.url ?? "").trim();
  const label = String(chapter.label ?? "").trim();
  const image = String(chapter.image ?? "").trim();

  if (!url || !label) {
    return null;
  }

  return {
    url,
    label,
    image: image || undefined,
  };
};

const sanitizeDerivedValueResult = (
  derivedValue: Partial<ScraperDetailsDerivedValueResult>,
): ScraperDetailsDerivedValueResult | null => {
  const allowedSourceTypes = ["requested_url", "final_url", "field", "selector", "html"];
  const allowedFieldKeys = ["title", "cover", "description", "authors", "tags", "status", "pageCount"];
  const allowedIssueCodes = ["missing_source", "invalid_selector", "invalid_pattern", "no_match"];

  const key = String(derivedValue.key ?? "").trim();
  if (!key) {
    return null;
  }

  return {
    key,
    sourceType: allowedSourceTypes.includes(String(derivedValue.sourceType))
      ? derivedValue.sourceType as ScraperDetailsDerivedValueResult["sourceType"]
      : "field",
    sourceField: allowedFieldKeys.includes(String(derivedValue.sourceField))
      ? derivedValue.sourceField as ScraperDetailsDerivedValueResult["sourceField"]
      : undefined,
    selector: typeof derivedValue.selector === "string" ? derivedValue.selector : undefined,
    pattern: typeof derivedValue.pattern === "string" ? derivedValue.pattern : undefined,
    sourceSample: typeof derivedValue.sourceSample === "string" ? derivedValue.sourceSample : undefined,
    value: typeof derivedValue.value === "string" ? derivedValue.value : undefined,
    issueCode: allowedIssueCodes.includes(String(derivedValue.issueCode))
      ? derivedValue.issueCode as ScraperDetailsDerivedValueResult["issueCode"]
      : undefined,
  };
};

export const sanitizeFeatureValidation = (
  validation: Partial<ScraperFeatureValidationResult> | null | undefined,
): ScraperFeatureValidationResult | null => {
  if (!validation) {
    return null;
  }

  const checks = Array.isArray(validation.checks)
    ? validation.checks
      .map((check) => sanitizeFeatureValidationCheck(check))
      .filter((check): check is ScraperFeatureValidationCheck => Boolean(check))
    : [];
  const derivedValues = Array.isArray(validation.derivedValues)
    ? validation.derivedValues
      .map((derivedValue) => sanitizeDerivedValueResult(derivedValue))
      .filter((derivedValue): derivedValue is ScraperDetailsDerivedValueResult => Boolean(derivedValue))
    : [];

  return {
    ok: Boolean(validation.ok),
    checkedAt: String(validation.checkedAt ?? ""),
    requestedUrl: typeof validation.requestedUrl === "string" ? validation.requestedUrl : undefined,
    finalUrl: typeof validation.finalUrl === "string" ? validation.finalUrl : undefined,
    status: typeof validation.status === "number" ? validation.status : undefined,
    contentType: typeof validation.contentType === "string" ? validation.contentType : undefined,
    failureCode: validation.failureCode === "http_error" || validation.failureCode === "request_failed"
      ? validation.failureCode
      : undefined,
    checks,
    derivedValues,
    chapters: Array.isArray(validation.chapters)
      ? validation.chapters
        .map((chapter) => sanitizeChapterItem(chapter))
        .filter((chapter): chapter is ScraperChapterItem => Boolean(chapter))
      : undefined,
  };
};

export const sanitizeStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const SCRAPER_BOOKMARK_METADATA_FIELDS: ScraperBookmarkMetadataField[] = [
  "cover",
  "summary",
  "description",
  "authors",
  "tags",
  "mangaStatus",
  "pageCount",
];

export const sanitizeBookmarkMetadataFieldList = (
  value: unknown,
): ScraperBookmarkMetadataField[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value.filter((entry): entry is ScraperBookmarkMetadataField => (
        SCRAPER_BOOKMARK_METADATA_FIELDS.includes(String(entry ?? "").trim() as ScraperBookmarkMetadataField)
      )),
    ))
    : []
);

const sanitizeRequestField = (value: unknown): ScraperRequestField | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const key = String(raw.key ?? "").trim();
  const fieldValue = typeof raw.value === "string"
    ? raw.value
    : raw.value == null
      ? ""
      : String(raw.value);

  if (!key && fieldValue.trim().length === 0) {
    return null;
  }

  return {
    key,
    value: fieldValue,
  };
};

export const sanitizeRequestConfig = (
  requestConfig: Partial<ScraperRequestConfig> | null | undefined,
): ScraperRequestConfig | undefined => {
  if (!requestConfig) {
    return undefined;
  }

  const method = requestConfig.method === "POST" ? "POST" : "GET";
  const bodyMode = requestConfig.bodyMode === "raw" ? "raw" : "form";
  const bodyFields = Array.isArray(requestConfig.bodyFields)
    ? requestConfig.bodyFields
      .map((field) => sanitizeRequestField(field))
      .filter((field): field is ScraperRequestField => Boolean(field))
    : [];
  const body = typeof requestConfig.body === "string" ? requestConfig.body : undefined;
  const contentType = String(requestConfig.contentType ?? "").trim() || undefined;

  if (
    method === "GET"
    && bodyMode === "form"
    && bodyFields.length === 0
    && !body
    && !contentType
  ) {
    return undefined;
  }

  return {
    method,
    bodyMode,
    bodyFields,
    body,
    contentType,
  };
};

export const buildScraperFetchInit = (
  requestConfig: ScraperRequestConfig | undefined,
  defaultAccept: string,
): {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
} => {
  const method = requestConfig?.method === "POST" ? "POST" : "GET";
  const headers: Record<string, string> = {
    "User-Agent": "Manga Helper Scraper Validation/1.0",
    Accept: defaultAccept,
  };

  if (method !== "POST") {
    return {
      method,
      headers,
    };
  }

  if (requestConfig?.bodyMode === "raw") {
    if (requestConfig.contentType) {
      headers["Content-Type"] = requestConfig.contentType;
    }

    return {
      method,
      headers,
      body: requestConfig.body ?? "",
    };
  }

  const body = new URLSearchParams();
  (requestConfig?.bodyFields ?? [])
    .filter((field) => field.key.trim().length > 0)
    .forEach((field) => {
      body.append(field.key, field.value);
    });

  headers["Content-Type"] = requestConfig?.contentType || "application/x-www-form-urlencoded;charset=UTF-8";

  return {
    method,
    headers,
    body: body.toString(),
  };
};

export const sanitizeGlobalConfig = (
  globalConfig: Partial<ScraperGlobalConfig> | null | undefined,
): ScraperGlobalConfig => {
  const defaultLanguage = String(globalConfig?.defaultLanguage ?? "").trim().toLowerCase();
  const homeSearchQuery = String(globalConfig?.homeSearch?.query ?? "").trim();

  return {
    defaultTagIds: sanitizeStringList(globalConfig?.defaultTagIds),
    defaultLanguage: defaultLanguage || undefined,
    homeSearch: {
      enabled: Boolean(globalConfig?.homeSearch?.enabled),
      query: homeSearchQuery,
    },
    bookmark: {
      excludedFields: sanitizeBookmarkMetadataFieldList(globalConfig?.bookmark?.excludedFields),
    },
    chapterDownloads: {
      autoAssignSeries: Boolean(globalConfig?.chapterDownloads?.autoAssignSeries),
    },
  };
};

export const normalizeScraperBookmarkUrl = (value: unknown): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

export const sanitizeScraperBookmarkRecord = (
  record: Partial<ScraperBookmarkRecord>,
): ScraperBookmarkRecord | null => {
  const scraperId = String(record.scraperId ?? "").trim();
  const sourceUrl = normalizeScraperBookmarkUrl(record.sourceUrl);
  const title = String(record.title ?? "").trim() || sourceUrl;
  const createdAt = String(record.createdAt ?? "").trim();
  const updatedAt = String(record.updatedAt ?? "").trim();

  if (!scraperId || !sourceUrl) {
    return null;
  }

  const cover = String(record.cover ?? "").trim();
  const summary = String(record.summary ?? "").trim();
  const description = String(record.description ?? "").trim();
  const mangaStatus = String(record.mangaStatus ?? "").trim();
  const pageCount = String(record.pageCount ?? "").trim();

  return {
    scraperId,
    sourceUrl,
    title,
    cover: cover || undefined,
    summary: summary || undefined,
    description: description || undefined,
    authors: sanitizeStringList(record.authors),
    tags: sanitizeStringList(record.tags),
    mangaStatus: mangaStatus || undefined,
    pageCount: pageCount || undefined,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
};

export const sanitizeScraperReaderProgressRecord = (
  record: Partial<ScraperReaderProgressRecord>,
): ScraperReaderProgressRecord | null => {
  const id = String(record.id ?? "").trim();
  const scraperId = String(record.scraperId ?? "").trim();
  const title = String(record.title ?? "").trim();
  const sourceUrl = String(record.sourceUrl ?? "").trim();
  const updatedAt = String(record.updatedAt ?? "").trim();

  if (!id || !scraperId || !title || !sourceUrl) {
    return null;
  }

  return {
    id,
    scraperId,
    title,
    sourceUrl,
    currentPage: typeof record.currentPage === "number" && Number.isFinite(record.currentPage)
      ? Math.max(1, Math.floor(record.currentPage))
      : null,
    totalPages: typeof record.totalPages === "number" && Number.isFinite(record.totalPages)
      ? Math.max(1, Math.floor(record.totalPages))
      : null,
    updatedAt: updatedAt || new Date().toISOString(),
  };
};

const normalizeScraperViewHistoryTitle = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const normalizeScraperViewHistoryIsoDate = (
  value: unknown,
  fallback: string,
): string => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return fallback;
  }

  const timestamp = Date.parse(rawValue);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
};

export const sanitizeScraperViewHistoryCardIdentity = (
  identity: Partial<ScraperViewHistoryCardIdentity>,
): ScraperViewHistoryCardIdentity | null => {
  const scraperId = normalizeScraperViewHistoryTitle(identity.scraperId);
  const sourceUrl = normalizeScraperViewHistorySourceUrl(identity.sourceUrl);
  const title = normalizeScraperViewHistoryTitle(identity.title);
  const thumbnailUrl = normalizeScraperViewHistorySourceUrl(identity.thumbnailUrl);

  if (!scraperId || (!sourceUrl && !title)) {
    return null;
  }

  return {
    scraperId,
    sourceUrl: sourceUrl || undefined,
    title: title || sourceUrl,
    thumbnailUrl: thumbnailUrl || undefined,
  };
};

export const sanitizeScraperViewHistoryRecord = (
  record: Partial<ScraperViewHistoryRecord & ScraperViewHistoryCardIdentity>,
): ScraperViewHistoryRecord | null => {
  const scraperId = normalizeScraperViewHistoryTitle(record.scraperId);
  if (!scraperId) {
    return null;
  }

  const sourceUrl = normalizeScraperViewHistorySourceUrl(record.sourceUrl);
  const title = normalizeScraperViewHistoryTitle(record.title);
  const thumbnailUrl = normalizeScraperViewHistorySourceUrl(record.thumbnailUrl);
  const now = new Date().toISOString();
  const computedId = buildScraperViewHistoryCardId({
    scraperId,
    sourceUrl,
    title,
    thumbnailUrl,
  });
  const storedId = String(record.id ?? "").trim();
  const id = /^svh_[a-z0-9]+$/i.test(storedId) ? storedId : computedId;
  const firstSeenFallback = normalizeScraperViewHistoryIsoDate((record as { lastSeenAt?: unknown }).lastSeenAt, now);
  const firstSeenAt = normalizeScraperViewHistoryIsoDate(record.firstSeenAt, firstSeenFallback);
  const readAt = String(record.readAt ?? "").trim()
    ? normalizeScraperViewHistoryIsoDate(record.readAt, "")
    : "";

  if (!id) {
    return null;
  }

  return {
    id,
    scraperId,
    sourceUrl: sourceUrl || undefined,
    firstSeenAt,
    readAt: readAt || undefined,
  };
};
