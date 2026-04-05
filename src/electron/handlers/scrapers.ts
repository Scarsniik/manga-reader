import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { app, IpcMainInvokeEvent } from 'electron';
import {
  DownloadScraperMangaRequest,
  DownloadScraperMangaResult,
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
  RemoveScraperBookmarkRequest,
  SaveScraperBookmarkRequest,
  SaveScraperGlobalConfigRequest,
  SaveScraperReaderProgressRequest,
  ScraperAccessValidationRequest,
  ScraperAccessValidationResult,
  ScraperBookmarkRecord,
  ScraperBookmarkMetadataField,
  ScraperChapterItem,
  ScraperDetailsDerivedValueResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperGlobalConfig,
  ScraperRequestConfig,
  ScraperRequestField,
  ScraperReaderProgressRecord,
  ScraperRecord,
  SaveScraperDraftRequest,
  SaveScraperFeatureRequest,
  createDefaultScraperGlobalConfig,
  createDefaultScraperFeatures,
  normalizeScraperBaseUrl,
  resolveScraperUrl,
} from '../scraper';
import {
  ensureDataDir,
  scraperBookmarksFilePath,
  scraperReaderProgressFilePath,
  scrapersFilePath,
} from '../utils';
import { addManga, createStoredThumbnailForMangaFromBuffer, patchMangaById } from './mangas';
import { getSettings } from './params';
import { ensureSeriesByTitle } from './series';
import { getTags } from './tags';

const DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS = 10000;
const DEFAULT_DOWNLOADED_MANGA_FOLDER_NAME = 'Manga Helper Library';
const MAX_SCRAPER_DOWNLOAD_PAGES = 4000;

const sanitizeAccessValidation = (
  validation: Partial<ScraperAccessValidationResult> | null | undefined,
): ScraperAccessValidationResult | null => {
  if (!validation) {
    return null;
  }

  return {
    ok: Boolean(validation.ok),
    kind: validation.kind === 'api' ? 'api' : 'site',
    normalizedUrl: String(validation.normalizedUrl ?? ''),
    checkedAt: String(validation.checkedAt ?? ''),
    status: typeof validation.status === 'number' ? validation.status : undefined,
    finalUrl: typeof validation.finalUrl === 'string' ? validation.finalUrl : undefined,
    contentType: typeof validation.contentType === 'string' ? validation.contentType : undefined,
  };
};

const sanitizeFeatureValidationCheck = (
  check: Partial<ScraperFeatureValidationCheck>,
): ScraperFeatureValidationCheck | null => {
  const allowedKeys = ['title', 'cover', 'description', 'authors', 'tags', 'status', 'chapters', 'pages'];
  if (!allowedKeys.includes(String(check.key))) {
    return null;
  }

  return {
    key: check.key as ScraperFeatureValidationCheck['key'],
    selector: String(check.selector ?? ''),
    required: Boolean(check.required),
    matchedCount: typeof check.matchedCount === 'number' ? check.matchedCount : 0,
    sample: typeof check.sample === 'string' ? check.sample : undefined,
    samples: Array.isArray(check.samples)
      ? check.samples.filter((value): value is string => typeof value === 'string')
      : undefined,
    issueCode: check.issueCode === 'invalid_selector' || check.issueCode === 'no_match'
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

  const url = String(chapter.url ?? '').trim();
  const label = String(chapter.label ?? '').trim();
  const image = String(chapter.image ?? '').trim();

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
  const allowedSourceTypes = ['requested_url', 'final_url', 'field', 'selector', 'html'];
  const allowedFieldKeys = ['title', 'cover', 'description', 'authors', 'tags', 'status'];
  const allowedIssueCodes = ['missing_source', 'invalid_selector', 'invalid_pattern', 'no_match'];

  const key = String(derivedValue.key ?? '').trim();
  if (!key) {
    return null;
  }

  return {
    key,
    sourceType: allowedSourceTypes.includes(String(derivedValue.sourceType))
      ? derivedValue.sourceType as ScraperDetailsDerivedValueResult['sourceType']
      : 'field',
    sourceField: allowedFieldKeys.includes(String(derivedValue.sourceField))
      ? derivedValue.sourceField as ScraperDetailsDerivedValueResult['sourceField']
      : undefined,
    selector: typeof derivedValue.selector === 'string' ? derivedValue.selector : undefined,
    pattern: typeof derivedValue.pattern === 'string' ? derivedValue.pattern : undefined,
    sourceSample: typeof derivedValue.sourceSample === 'string' ? derivedValue.sourceSample : undefined,
    value: typeof derivedValue.value === 'string' ? derivedValue.value : undefined,
    issueCode: allowedIssueCodes.includes(String(derivedValue.issueCode))
      ? derivedValue.issueCode as ScraperDetailsDerivedValueResult['issueCode']
      : undefined,
  };
};

const sanitizeFeatureValidation = (
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
    checkedAt: String(validation.checkedAt ?? ''),
    requestedUrl: typeof validation.requestedUrl === 'string' ? validation.requestedUrl : undefined,
    finalUrl: typeof validation.finalUrl === 'string' ? validation.finalUrl : undefined,
    status: typeof validation.status === 'number' ? validation.status : undefined,
    contentType: typeof validation.contentType === 'string' ? validation.contentType : undefined,
    failureCode: validation.failureCode === 'http_error' || validation.failureCode === 'request_failed'
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

const sanitizeStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const SCRAPER_BOOKMARK_METADATA_FIELDS: ScraperBookmarkMetadataField[] = [
  'cover',
  'summary',
  'description',
  'authors',
  'tags',
  'mangaStatus',
];

const sanitizeBookmarkMetadataFieldList = (value: unknown): ScraperBookmarkMetadataField[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value.filter((entry): entry is ScraperBookmarkMetadataField => (
        SCRAPER_BOOKMARK_METADATA_FIELDS.includes(String(entry ?? '').trim() as ScraperBookmarkMetadataField)
      )),
    ))
    : []
);

const sanitizeRequestField = (value: unknown): ScraperRequestField | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const key = String(raw.key ?? '').trim();
  const fieldValue = typeof raw.value === 'string'
    ? raw.value
    : raw.value == null
      ? ''
      : String(raw.value);

  if (!key && fieldValue.trim().length === 0) {
    return null;
  }

  return {
    key,
    value: fieldValue,
  };
};

const sanitizeRequestConfig = (
  requestConfig: Partial<ScraperRequestConfig> | null | undefined,
): ScraperRequestConfig | undefined => {
  if (!requestConfig) {
    return undefined;
  }

  const method = requestConfig.method === 'POST' ? 'POST' : 'GET';
  const bodyMode = requestConfig.bodyMode === 'raw' ? 'raw' : 'form';
  const bodyFields = Array.isArray(requestConfig.bodyFields)
    ? requestConfig.bodyFields
      .map((field) => sanitizeRequestField(field))
      .filter((field): field is ScraperRequestField => Boolean(field))
    : [];
  const body = typeof requestConfig.body === 'string' ? requestConfig.body : undefined;
  const contentType = String(requestConfig.contentType ?? '').trim() || undefined;

  if (
    method === 'GET'
    && bodyMode === 'form'
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

const buildScraperFetchInit = (
  requestConfig: ScraperRequestConfig | undefined,
  defaultAccept: string,
): {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
} => {
  const method = requestConfig?.method === 'POST' ? 'POST' : 'GET';
  const headers: Record<string, string> = {
    'User-Agent': 'Manga Helper Scraper Validation/1.0',
    Accept: defaultAccept,
  };

  if (method !== 'POST') {
    return {
      method,
      headers,
    };
  }

  if (requestConfig?.bodyMode === 'raw') {
    if (requestConfig.contentType) {
      headers['Content-Type'] = requestConfig.contentType;
    }

    return {
      method,
      headers,
      body: requestConfig.body ?? '',
    };
  }

  const body = new URLSearchParams();
  (requestConfig?.bodyFields ?? [])
    .filter((field) => field.key.trim().length > 0)
    .forEach((field) => {
      body.append(field.key, field.value);
    });

  headers['Content-Type'] = requestConfig?.contentType || 'application/x-www-form-urlencoded;charset=UTF-8';

  return {
    method,
    headers,
    body: body.toString(),
  };
};

const sanitizeGlobalConfig = (
  globalConfig: Partial<ScraperGlobalConfig> | null | undefined,
): ScraperGlobalConfig => {
  const defaultLanguage = String(globalConfig?.defaultLanguage ?? '').trim().toLowerCase();
  const homeSearchQuery = String(globalConfig?.homeSearch?.query ?? '').trim();

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

const normalizeChapterValue = (value: string): string => value
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const extractChapterValueFromLabel = (label: string): string | undefined => {
  const normalizedLabel = normalizeChapterValue(label);
  if (!normalizedLabel) {
    return undefined;
  }

  const explicitChapterMatch = normalizedLabel.match(
    /(?:chap(?:it(?:re)?)?|chapter|ch|cap(?:itulo)?|ep(?:isode)?)\s*\.?\s*([0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?)/i,
  );
  if (explicitChapterMatch?.[1]) {
    return normalizeChapterValue(explicitChapterMatch[1]).replace(/\s*-\s*/g, '-');
  }

  const lastNumericMatch = Array.from(
    normalizedLabel.matchAll(/([0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?)/g),
  ).pop();
  if (lastNumericMatch?.[1]) {
    return normalizeChapterValue(lastNumericMatch[1]).replace(/\s*-\s*/g, '-');
  }

  return normalizedLabel || undefined;
};

const toPersistedScraperRecord = (scraper: ScraperRecord) => ({
  id: scraper.id,
  kind: scraper.kind,
  name: scraper.name,
  baseUrl: scraper.baseUrl,
  description: scraper.description ?? '',
  status: scraper.status,
  createdAt: scraper.createdAt,
  updatedAt: scraper.updatedAt,
  validation: sanitizeAccessValidation(scraper.validation),
  globalConfig: sanitizeGlobalConfig(scraper.globalConfig),
  features: scraper.features.map((feature) => ({
    kind: feature.kind,
    status: feature.status,
    config: feature.config ?? null,
    validation: sanitizeFeatureValidation(feature.validation),
  })),
});

const hydrateScraperFeatures = (
  features: Partial<ScraperFeatureDefinition>[] | undefined,
): ScraperFeatureDefinition[] => {
  const defaults = createDefaultScraperFeatures();

  return defaults.map((feature) => {
    const existing = features?.find((candidate) => {
      const candidateKind = String(candidate.kind) === 'images' ? 'pages' : candidate.kind;
      return candidateKind === feature.kind;
    });

    return {
      ...feature,
      ...existing,
      kind: feature.kind,
      status: existing?.status ?? feature.status,
      config: existing?.config ?? null,
      validation: sanitizeFeatureValidation(existing?.validation) ?? null,
    };
  });
};

async function readScrapersFile(): Promise<ScraperRecord[]> {
  try {
    const data = await fs.readFile(scrapersFilePath, 'utf-8');
    const parsed = JSON.parse(data) as ScraperRecord[];
    const hydrated = parsed.map((scraper) => ({
      ...scraper,
      validation: sanitizeAccessValidation(scraper.validation),
      globalConfig: sanitizeGlobalConfig(scraper.globalConfig),
      features: hydrateScraperFeatures(scraper.features),
    }));

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(hydrated.map((scraper) => toPersistedScraperRecord(scraper)), null, 2);

    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scrapersFilePath, normalizedSanitized);
    }

    return hydrated;
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      await ensureDataDir();
      await fs.writeFile(scrapersFilePath, JSON.stringify([], null, 2));
      return [];
    }
    console.error('Error reading scrapers file:', error);
    throw new Error('Failed to read scrapers');
  }
}

async function writeScrapersFile(scrapers: ScraperRecord[]): Promise<void> {
  await ensureDataDir();
  const persisted = scrapers.map((scraper) => toPersistedScraperRecord(scraper));
  await fs.writeFile(scrapersFilePath, JSON.stringify(persisted, null, 2));
}

const sanitizeScraperReaderProgressRecord = (
  record: Partial<ScraperReaderProgressRecord>,
): ScraperReaderProgressRecord | null => {
  const id = String(record.id ?? '').trim();
  const scraperId = String(record.scraperId ?? '').trim();
  const title = String(record.title ?? '').trim();
  const sourceUrl = String(record.sourceUrl ?? '').trim();
  const updatedAt = String(record.updatedAt ?? '').trim();

  if (!id || !scraperId || !title || !sourceUrl) {
    return null;
  }

  return {
    id,
    scraperId,
    title,
    sourceUrl,
    currentPage: typeof record.currentPage === 'number' && Number.isFinite(record.currentPage)
      ? Math.max(1, Math.floor(record.currentPage))
      : null,
    totalPages: typeof record.totalPages === 'number' && Number.isFinite(record.totalPages)
      ? Math.max(1, Math.floor(record.totalPages))
      : null,
    updatedAt: updatedAt || new Date().toISOString(),
  };
};

async function readScraperReaderProgressFile(): Promise<ScraperReaderProgressRecord[]> {
  try {
    const data = await fs.readFile(scraperReaderProgressFilePath, 'utf-8');
    const parsed = JSON.parse(data) as Partial<ScraperReaderProgressRecord>[];
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeScraperReaderProgressRecord(record))
        .filter((record): record is ScraperReaderProgressRecord => Boolean(record))
      : [];

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(sanitized, null, 2);
    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scraperReaderProgressFilePath, normalizedSanitized);
    }

    return sanitized;
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      await ensureDataDir();
      await fs.writeFile(scraperReaderProgressFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error('Error reading scraper reader progress file:', error);
    throw new Error('Failed to read scraper reader progress');
  }
}

async function writeScraperReaderProgressFile(records: ScraperReaderProgressRecord[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(scraperReaderProgressFilePath, JSON.stringify(records, null, 2));
}

const normalizeScraperBookmarkUrl = (value: unknown): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

const sanitizeScraperBookmarkRecord = (
  record: Partial<ScraperBookmarkRecord>,
): ScraperBookmarkRecord | null => {
  const scraperId = String(record.scraperId ?? '').trim();
  const sourceUrl = normalizeScraperBookmarkUrl(record.sourceUrl);
  const title = String(record.title ?? '').trim() || sourceUrl;
  const createdAt = String(record.createdAt ?? '').trim();
  const updatedAt = String(record.updatedAt ?? '').trim();

  if (!scraperId || !sourceUrl) {
    return null;
  }

  const cover = String(record.cover ?? '').trim();
  const summary = String(record.summary ?? '').trim();
  const description = String(record.description ?? '').trim();
  const mangaStatus = String(record.mangaStatus ?? '').trim();

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
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
};

const applyExcludedBookmarkFields = <T extends Partial<ScraperBookmarkRecord>>(
  record: T,
  excludedFields: ScraperBookmarkMetadataField[],
): T => {
  const nextRecord: Partial<ScraperBookmarkRecord> = { ...record };

  excludedFields.forEach((field) => {
    if (field === 'authors' || field === 'tags') {
      nextRecord[field] = [];
      return;
    }

    nextRecord[field] = undefined;
  });

  return nextRecord as T;
};

const mergeScraperBookmarkRecord = (
  existing: ScraperBookmarkRecord | null,
  request: SaveScraperBookmarkRequest,
): ScraperBookmarkRecord | null => {
  const now = new Date().toISOString();
  const excludedFields = sanitizeBookmarkMetadataFieldList(request.excludedFields);
  const normalizedRequest = sanitizeScraperBookmarkRecord({
    ...existing,
    ...applyExcludedBookmarkFields(request, excludedFields),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  if (!normalizedRequest) {
    return null;
  }

  if (!existing) {
    return normalizedRequest;
  }

  return sanitizeScraperBookmarkRecord(applyExcludedBookmarkFields({
    scraperId: existing.scraperId,
    sourceUrl: existing.sourceUrl,
    title: normalizedRequest.title || existing.title,
    cover: normalizedRequest.cover || existing.cover,
    summary: normalizedRequest.summary || existing.summary,
    description: normalizedRequest.description || existing.description,
    authors: normalizedRequest.authors.length ? normalizedRequest.authors : existing.authors,
    tags: normalizedRequest.tags.length ? normalizedRequest.tags : existing.tags,
    mangaStatus: normalizedRequest.mangaStatus || existing.mangaStatus,
    createdAt: existing.createdAt,
    updatedAt: now,
  }, excludedFields));
};

const sortScraperBookmarks = (records: ScraperBookmarkRecord[]): ScraperBookmarkRecord[] => (
  [...records].sort((left, right) => {
    const updatedAtCompare = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedAtCompare !== 0) {
      return updatedAtCompare;
    }

    const scraperCompare = left.scraperId.localeCompare(right.scraperId);
    if (scraperCompare !== 0) {
      return scraperCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

async function readScraperBookmarksFile(): Promise<ScraperBookmarkRecord[]> {
  try {
    const data = await fs.readFile(scraperBookmarksFilePath, 'utf-8');
    const parsed = JSON.parse(data) as Partial<ScraperBookmarkRecord>[];
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeScraperBookmarkRecord(record))
        .filter((record): record is ScraperBookmarkRecord => Boolean(record))
      : [];
    const sorted = sortScraperBookmarks(sanitized);

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(sorted, null, 2);
    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scraperBookmarksFilePath, normalizedSanitized);
    }

    return sorted;
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      await ensureDataDir();
      await fs.writeFile(scraperBookmarksFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error('Error reading scraper bookmarks file:', error);
    throw new Error('Failed to read scraper bookmarks');
  }
}

async function writeScraperBookmarksFile(records: ScraperBookmarkRecord[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(scraperBookmarksFilePath, JSON.stringify(sortScraperBookmarks(records), null, 2));
}

const sanitizePathSegment = (value: string): string => {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return sanitized || 'manga';
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const getConfiguredLibraryRoot = async (): Promise<string> => {
  const settings = await getSettings();
  const configuredLibraryPath = String(settings?.libraryPath || '').trim();

  if (configuredLibraryPath) {
    return path.isAbsolute(configuredLibraryPath)
      ? configuredLibraryPath
      : path.resolve(configuredLibraryPath);
  }

  return path.join(app.getPath('documents'), DEFAULT_DOWNLOADED_MANGA_FOLDER_NAME);
};

const getUniqueFolderPath = async (libraryRoot: string, title: string): Promise<string> => {
  const baseName = sanitizePathSegment(title);
  let candidatePath = path.join(libraryRoot, baseName);
  let suffix = 2;

  while (await pathExists(candidatePath)) {
    candidatePath = path.join(libraryRoot, `${baseName} (${suffix})`);
    suffix += 1;
  }

  return candidatePath;
};

const inferExtensionFromContentType = (contentType: string | null): string => {
  const normalized = String(contentType || '').toLowerCase();

  if (normalized.includes('image/webp')) return '.webp';
  if (normalized.includes('image/png')) return '.png';
  if (normalized.includes('image/avif')) return '.avif';
  if (normalized.includes('image/gif')) return '.gif';
  if (normalized.includes('image/jpeg')) return '.jpg';
  if (normalized.includes('image/jpg')) return '.jpg';

  return '.jpg';
};

const inferExtensionFromUrl = (targetUrl: string, contentType: string | null): string => {
  try {
    const parsed = new URL(targetUrl);
    const extension = path.extname(parsed.pathname);
    if (extension && extension.length <= 8) {
      return extension;
    }
  } catch {
    // Fall back to content-type when URL parsing fails.
  }

  return inferExtensionFromContentType(contentType);
};

const buildDownloadHeaders = (refererUrl?: string): HeadersInit => {
  const headers: HeadersInit = {
    'User-Agent': 'Manga Helper Scraper Downloader/1.0',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };

  if (refererUrl) {
    headers.Referer = refererUrl;
  }

  return headers;
};

const buildContentTypeWarning = (
  kind: ScraperAccessValidationRequest['kind'],
  contentType: string | undefined,
): string | undefined => {
  if (!contentType) return undefined;

  const normalized = contentType.toLowerCase();

  if (kind === 'site' && !normalized.includes('text/html')) {
    return 'La source repond, mais le type de contenu ne ressemble pas a une page HTML.';
  }

  if (kind === 'api' && !normalized.includes('json')) {
    return 'La source repond, mais le type de contenu ne ressemble pas a une reponse JSON.';
  }

  return undefined;
};

export async function validateScraperAccess(
  _event: IpcMainInvokeEvent,
  request: ScraperAccessValidationRequest,
): Promise<ScraperAccessValidationResult> {
  const checkedAt = new Date().toISOString();

  let normalizedUrl = '';
  try {
    normalizedUrl = normalizeScraperBaseUrl(request.baseUrl);
  } catch (error) {
    return {
      ok: false,
      kind: request.kind,
      normalizedUrl: request.baseUrl.trim(),
      checkedAt,
      error: error instanceof Error ? error.message : 'URL invalide.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Manga Helper Scraper Validation/1.0',
        Accept: request.kind === 'api'
          ? 'application/json, text/plain, */*'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const contentType = response.headers.get('content-type') ?? undefined;
    const warning = buildContentTypeWarning(request.kind, contentType);

    try {
      await response.body?.cancel();
    } catch {
      // no-op: some response bodies cannot be cancelled once fully buffered
    }

    return {
      ok: response.ok,
      kind: request.kind,
      normalizedUrl,
      checkedAt,
      status: response.status,
      finalUrl: response.url || normalizedUrl,
      contentType,
      warning,
      error: response.ok ? undefined : `La source a repondu avec le code HTTP ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Echec de la requete.';
    return {
      ok: false,
      kind: request.kind,
      normalizedUrl,
      checkedAt,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getScrapers(): Promise<ScraperRecord[]> {
  return readScrapersFile();
}

export async function getScraperBookmarks(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperBookmarkRecord[]> {
  const records = await readScraperBookmarksFile();
  const normalizedScraperId = String(scraperId ?? '').trim();

  if (!normalizedScraperId) {
    return records;
  }

  return records.filter((record) => record.scraperId === normalizedScraperId);
}

export async function saveScraperBookmark(
  _event: IpcMainInvokeEvent,
  request: SaveScraperBookmarkRequest,
): Promise<ScraperBookmarkRecord> {
  const records = await readScraperBookmarksFile();
  const normalizedScraperId = String(request.scraperId ?? '').trim();
  const normalizedSourceUrl = normalizeScraperBookmarkUrl(request.sourceUrl);
  const existingIndex = records.findIndex((record) => (
    record.scraperId === normalizedScraperId && record.sourceUrl === normalizedSourceUrl
  ));
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const merged = mergeScraperBookmarkRecord(existing, request);

  if (!merged) {
    throw new Error('Le bookmark scraper est incomplet.');
  }

  if (existingIndex >= 0) {
    records[existingIndex] = merged;
  } else {
    records.push(merged);
  }

  await writeScraperBookmarksFile(records);
  return merged;
}

export async function removeScraperBookmark(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperBookmarkRequest,
): Promise<boolean> {
  const normalizedScraperId = String(request.scraperId ?? '').trim();
  const normalizedSourceUrl = normalizeScraperBookmarkUrl(request.sourceUrl);

  if (!normalizedScraperId || !normalizedSourceUrl) {
    return false;
  }

  const records = await readScraperBookmarksFile();
  const filtered = records.filter((record) => !(
    record.scraperId === normalizedScraperId && record.sourceUrl === normalizedSourceUrl
  ));

  if (filtered.length === records.length) {
    return false;
  }

  await writeScraperBookmarksFile(filtered);
  return true;
}

export async function deleteScraper(
  _event: IpcMainInvokeEvent,
  scraperId: string,
): Promise<ScraperRecord[]> {
  const scrapers = await readScrapersFile();
  const filtered = scrapers.filter((scraper) => String(scraper.id) !== String(scraperId));

  if (filtered.length === scrapers.length) {
    return scrapers;
  }

  await writeScrapersFile(filtered);

  const bookmarkRecords = await readScraperBookmarksFile();
  const filteredBookmarkRecords = bookmarkRecords.filter((record) => record.scraperId !== String(scraperId));
  if (filteredBookmarkRecords.length !== bookmarkRecords.length) {
    await writeScraperBookmarksFile(filteredBookmarkRecords);
  }

  const progressRecords = await readScraperReaderProgressFile();
  const filteredProgressRecords = progressRecords.filter((record) => record.scraperId !== String(scraperId));
  if (filteredProgressRecords.length !== progressRecords.length) {
    await writeScraperReaderProgressFile(filteredProgressRecords);
  }

  return filtered;
}

export async function getScraperReaderProgress(
  _event: IpcMainInvokeEvent,
  scraperMangaId: string,
): Promise<ScraperReaderProgressRecord | null> {
  const records = await readScraperReaderProgressFile();
  return records.find((record) => record.id === String(scraperMangaId)) ?? null;
}

export async function saveScraperReaderProgress(
  _event: IpcMainInvokeEvent,
  request: SaveScraperReaderProgressRequest,
): Promise<ScraperReaderProgressRecord> {
  const normalized = sanitizeScraperReaderProgressRecord({
    ...request,
    updatedAt: new Date().toISOString(),
  });

  if (!normalized) {
    throw new Error('La progression du reader scraper est incomplete.');
  }

  const records = await readScraperReaderProgressFile();
  const existingIndex = records.findIndex((record) => record.id === normalized.id);

  if (existingIndex >= 0) {
    records[existingIndex] = normalized;
  } else {
    records.push(normalized);
  }

  await writeScraperReaderProgressFile(records);
  return normalized;
}

export async function fetchScraperDocument(
  _event: IpcMainInvokeEvent,
  request: FetchScraperDocumentRequest,
): Promise<FetchScraperDocumentResult> {
  const checkedAt = new Date().toISOString();
  const requestConfig = sanitizeRequestConfig(request.requestConfig);

  let requestedUrl = '';
  try {
    requestedUrl = resolveScraperUrl(request.baseUrl, request.targetUrl);
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl: request.targetUrl.trim(),
      error: error instanceof Error ? error.message : 'URL invalide.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_SCRAPER_VALIDATION_TIMEOUT_MS);

  try {
    const fetchInit = buildScraperFetchInit(
      requestConfig,
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    );
    const response = await fetch(requestedUrl, {
      method: fetchInit.method,
      redirect: 'follow',
      signal: controller.signal,
      headers: fetchInit.headers,
      body: fetchInit.body,
    });
    const contentType = response.headers.get('content-type') ?? undefined;
    let html: string | undefined;

    if (response.ok && contentType && contentType.toLowerCase().startsWith('image/')) {
      try {
        await response.body?.cancel();
      } catch {
        // no-op
      }
    } else {
      html = await response.text();
    }

    return {
      ok: response.ok,
      checkedAt,
      requestedUrl,
      finalUrl: response.url || requestedUrl,
      status: response.status,
      contentType,
      html: response.ok ? html : undefined,
      error: response.ok ? undefined : `La page a repondu avec le code HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl,
      error: error instanceof Error ? error.message : 'Echec de la requete.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadScraperManga(
  _event: IpcMainInvokeEvent,
  request: DownloadScraperMangaRequest,
): Promise<DownloadScraperMangaResult> {
  const title = String(request.title || '').trim();
  const pageUrls = Array.isArray(request.pageUrls)
    ? request.pageUrls
      .map((pageUrl) => String(pageUrl || '').trim())
      .filter((pageUrl) => pageUrl.length > 0)
    : [];
  const refererUrl = typeof request.refererUrl === 'string' && request.refererUrl.trim().length > 0
    ? request.refererUrl.trim()
    : undefined;
  const scraperId = typeof request.scraperId === 'string' && request.scraperId.trim().length > 0
    ? request.scraperId.trim()
    : undefined;
  const sourceUrl = typeof request.sourceUrl === 'string' && request.sourceUrl.trim().length > 0
    ? request.sourceUrl.trim()
    : undefined;
  const requestedDefaultTagIds = sanitizeStringList(request.defaultTagIds);
  const requestedDefaultLanguage = String(request.defaultLanguage ?? '').trim().toLowerCase() || undefined;
  const autoAssignSeriesOnChapterDownload = Boolean(request.autoAssignSeriesOnChapterDownload);
  const seriesTitle = String(request.seriesTitle ?? '').trim();
  const chapterLabel = String(request.chapterLabel ?? '').trim();
  const thumbnailUrl = typeof request.thumbnailUrl === 'string' && request.thumbnailUrl.trim().length > 0
    ? request.thumbnailUrl.trim()
    : undefined;

  if (!title) {
    throw new Error('Le titre du manga est requis pour le telechargement.');
  }

  if (!pageUrls.length) {
    throw new Error('Aucune page a telecharger.');
  }

  if (pageUrls.length > MAX_SCRAPER_DOWNLOAD_PAGES) {
    throw new Error(`Le telechargement est limite a ${MAX_SCRAPER_DOWNLOAD_PAGES} pages pour cette version.`);
  }

  const uniquePageUrls = Array.from(new Set(pageUrls));
  const libraryRoot = await getConfiguredLibraryRoot();
  await fs.mkdir(libraryRoot, { recursive: true });

  const folderPath = await getUniqueFolderPath(libraryRoot, title);
  await fs.mkdir(folderPath, { recursive: true });

  const fileNameWidth = Math.max(3, String(uniquePageUrls.length - 1).length);

  try {
    for (let index = 0; index < uniquePageUrls.length; index += 1) {
      const pageUrl = uniquePageUrls[index];
      const response = await fetch(pageUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: buildDownloadHeaders(refererUrl),
      });

      if (!response.ok) {
        throw new Error(`La page ${index + 1} a repondu avec le code HTTP ${response.status}.`);
      }

      const contentType = response.headers.get('content-type');
      if (!String(contentType || '').toLowerCase().startsWith('image/')) {
        throw new Error(`La page ${index + 1} ne ressemble pas a une image telechargeable.`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = inferExtensionFromUrl(response.url || pageUrl, contentType);
      const fileName = `${String(index).padStart(fileNameWidth, '0')}${extension}`;
      const targetFilePath = path.join(folderPath, fileName);

      await fs.writeFile(targetFilePath, buffer);
    }
  } catch (error) {
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup only.
    }

    throw error;
  }

  const availableTags = await getTags();
  const availableTagIds = new Set(
    Array.isArray(availableTags)
      ? availableTags.map((tag) => String(tag?.id ?? '').trim()).filter((tagId) => tagId.length > 0)
      : [],
  );
  const defaultTagIds = requestedDefaultTagIds.filter((tagId) => availableTagIds.has(tagId));
  const linkedSeries = autoAssignSeriesOnChapterDownload && seriesTitle && chapterLabel
    ? await ensureSeriesByTitle(seriesTitle)
    : null;
  const chapterValue = chapterLabel
    ? extractChapterValueFromLabel(chapterLabel)
    : undefined;

  const createdManga = await addManga(undefined as any, {
    id: randomUUID(),
    title,
    path: folderPath,
    createdAt: new Date().toISOString(),
    authorIds: [],
    tagIds: defaultTagIds,
    language: requestedDefaultLanguage,
    seriesId: linkedSeries?.id ?? null,
    chapters: linkedSeries ? (chapterValue || chapterLabel) : undefined,
    sourceKind: scraperId ? 'scraper' : undefined,
    scraperId: scraperId ?? null,
    sourceUrl: sourceUrl ?? refererUrl ?? null,
  });

  const inserted = Array.isArray(createdManga)
    ? createdManga[createdManga.length - 1]
    : null;

  if (!inserted?.id) {
    throw new Error('Le manga a ete telecharge, mais son ajout a la bibliotheque a echoue.');
  }

  if (thumbnailUrl) {
    try {
      const thumbnailResponse = await fetch(thumbnailUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: buildDownloadHeaders(refererUrl),
      });

      if (thumbnailResponse.ok && String(thumbnailResponse.headers.get('content-type') || '').toLowerCase().startsWith('image/')) {
        const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
        const thumbnailPath = await createStoredThumbnailForMangaFromBuffer(String(inserted.id), thumbnailBuffer);

        if (thumbnailPath) {
          await patchMangaById(String(inserted.id), { thumbnailPath });
        }
      }
    } catch (error) {
      console.warn('Failed to override scraper download thumbnail from chapter image', {
        mangaId: inserted.id,
        thumbnailUrl,
        error,
      });
    }
  }

  return {
    ok: true,
    mangaId: String(inserted.id),
    folderPath,
    libraryRoot,
    downloadedCount: uniquePageUrls.length,
  };
}

export async function saveScraperDraft(
  _event: IpcMainInvokeEvent,
  request: SaveScraperDraftRequest,
): Promise<ScraperRecord> {
  if (!request.validation?.ok) {
    throw new Error('Le scraper doit etre valide avant enregistrement.');
  }

  const normalizedUrl = normalizeScraperBaseUrl(request.identity.baseUrl);
  const now = new Date().toISOString();
  const scrapers = await readScrapersFile();

  const existingIndex = request.id
    ? scrapers.findIndex((scraper) => String(scraper.id) === String(request.id))
    : -1;

  if (existingIndex >= 0) {
    const existing = scrapers[existingIndex];
    const updated: ScraperRecord = {
      ...existing,
      kind: request.identity.kind,
      name: request.identity.name.trim(),
      baseUrl: normalizedUrl,
      description: request.identity.description?.trim() || '',
      status: 'validated',
      updatedAt: now,
      validation: {
        ...request.validation,
        normalizedUrl,
      },
      globalConfig: sanitizeGlobalConfig(existing.globalConfig),
      features: existing.features?.length ? hydrateScraperFeatures(existing.features) : createDefaultScraperFeatures(),
    };

    scrapers[existingIndex] = updated;
    await writeScrapersFile(scrapers);
    return updated;
  }

  const created: ScraperRecord = {
    id: randomUUID(),
    kind: request.identity.kind,
    name: request.identity.name.trim(),
    baseUrl: normalizedUrl,
    description: request.identity.description?.trim() || '',
    status: 'validated',
    createdAt: now,
    updatedAt: now,
    validation: {
      ...request.validation,
      normalizedUrl,
    },
    globalConfig: createDefaultScraperGlobalConfig(),
    features: createDefaultScraperFeatures(),
  };

  scrapers.push(created);
  await writeScrapersFile(scrapers);
  return created;
}

export async function saveScraperFeatureConfig(
  _event: IpcMainInvokeEvent,
  request: SaveScraperFeatureRequest,
): Promise<ScraperRecord> {
  const scrapers = await readScrapersFile();
  const scraperIndex = scrapers.findIndex((scraper) => String(scraper.id) === String(request.scraperId));

  if (scraperIndex < 0) {
    throw new Error('Scraper introuvable.');
  }

  const scraper = scrapers[scraperIndex];
  const features = hydrateScraperFeatures(scraper.features);
  const featureIndex = features.findIndex((feature) => feature.kind === request.featureKind);

  if (featureIndex < 0) {
    throw new Error('Composant introuvable.');
  }

  features[featureIndex] = {
    ...features[featureIndex],
    config: request.config,
    validation: request.validation ?? null,
    status: request.validation?.ok ? 'validated' : 'configured',
  };

  const updated: ScraperRecord = {
    ...scraper,
    updatedAt: new Date().toISOString(),
    features,
  };

  scrapers[scraperIndex] = updated;
  await writeScrapersFile(scrapers);
  return updated;
}

export async function saveScraperGlobalConfig(
  _event: IpcMainInvokeEvent,
  request: SaveScraperGlobalConfigRequest,
): Promise<ScraperRecord> {
  const scrapers = await readScrapersFile();
  const scraperIndex = scrapers.findIndex((scraper) => String(scraper.id) === String(request.scraperId));

  if (scraperIndex < 0) {
    throw new Error('Scraper introuvable.');
  }

  const scraper = scrapers[scraperIndex];
  const updated: ScraperRecord = {
    ...scraper,
    updatedAt: new Date().toISOString(),
    globalConfig: sanitizeGlobalConfig(request.globalConfig),
  };

  scrapers[scraperIndex] = updated;
  await writeScrapersFile(scrapers);
  return updated;
}
