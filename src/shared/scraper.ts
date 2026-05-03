export type ScraperSourceKind = 'site' | 'api';
export type ScraperFeatureKind = 'search' | 'details' | 'author' | 'chapters' | 'pages';
export type ScraperFeatureStatus = 'not_configured' | 'configured' | 'validated';
export type ScraperRequestMethod = 'GET' | 'POST';
export type ScraperRequestBodyMode = 'form' | 'raw';
export type ScraperFieldSelectorKind = 'css' | 'regex';

export interface ScraperFieldSelector {
  kind: ScraperFieldSelectorKind;
  value: string;
}

export interface ScraperLanguageValueMapping {
  value: string;
  languageCode: string;
}

export interface ScraperLanguageDetectionConfig {
  detectFromTitle: boolean;
  languageSelector?: ScraperFieldSelector;
  processedLanguageSelector?: ScraperFieldSelector;
  valueMappings?: ScraperLanguageValueMapping[];
}

export interface ScraperRegexPattern {
  source: string;
  flags: string;
}

export type ScraperFieldSelectorInput = string | Partial<ScraperFieldSelector> | null | undefined;

const SCRAPER_REGEX_FLAGS_PATTERN = /^[dgimsuvy]*$/;

function isRegexSlashEscaped(value: string, index: number): boolean {
  let backslashCount = 0;
  for (let position = index - 1; position >= 0 && value[position] === '\\'; position -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function findRegexLiteralClosingSlash(value: string): number {
  for (let index = value.length - 1; index > 0; index -= 1) {
    if (value[index] === '/' && !isRegexSlashEscaped(value, index)) {
      return index;
    }
  }

  return -1;
}

export function parseScraperRegexPatternInput(input: string): ScraperRegexPattern {
  const trimmed = input.trim();

  if (trimmed.startsWith('/')) {
    const closingSlashIndex = findRegexLiteralClosingSlash(trimmed);
    const flags = closingSlashIndex > 0 ? trimmed.slice(closingSlashIndex + 1) : '';

    if (closingSlashIndex > 0 && SCRAPER_REGEX_FLAGS_PATTERN.test(flags)) {
      return {
        source: trimmed.slice(1, closingSlashIndex),
        flags,
      };
    }
  }

  return {
    source: trimmed,
    flags: '',
  };
}

function appendMissingRegexFlags(flags: string, defaultFlags: string): string {
  return defaultFlags.split('').reduce((nextFlags, flag) => (
    nextFlags.includes(flag) ? nextFlags : `${nextFlags}${flag}`
  ), flags);
}

export function buildScraperRegexFromInput(input: string, defaultFlags = ''): RegExp {
  const pattern = parseScraperRegexPatternInput(input);
  return new RegExp(pattern.source, appendMissingRegexFlags(pattern.flags, defaultFlags));
}

export function normalizeScraperCssSelectorInput(input: string): string {
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createScraperFieldSelector(
  kind: ScraperFieldSelectorKind = 'css',
  value = '',
): ScraperFieldSelector {
  return {
    kind,
    value,
  };
}

export function normalizeScraperFieldSelector(input: unknown): ScraperFieldSelector | undefined {
  if (typeof input === 'string') {
    const value = normalizeScraperCssSelectorInput(input);
    return value ? createScraperFieldSelector('css', value) : undefined;
  }

  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const raw = input as Record<string, unknown>;
  const kind = raw.kind === 'regex' || raw.mode === 'regex' ? 'regex' : 'css';
  const rawValue = typeof raw.value === 'string'
    ? raw.value
    : typeof raw.selector === 'string'
      ? raw.selector
      : '';
  const value = kind === 'css'
    ? normalizeScraperCssSelectorInput(rawValue)
    : rawValue.trim();

  return value ? createScraperFieldSelector(kind, value) : undefined;
}

export function getScraperFieldSelectorValue(input: ScraperFieldSelectorInput): string {
  if (typeof input === 'string') {
    return input;
  }

  return typeof input?.value === 'string' ? input.value : '';
}

export function hasScraperFieldSelectorValue(input: ScraperFieldSelectorInput): boolean {
  return getScraperFieldSelectorValue(input).trim().length > 0;
}

export function formatScraperFieldSelectorForDisplay(input: ScraperFieldSelectorInput): string {
  const normalized = normalizeScraperFieldSelector(input);
  if (!normalized) {
    return '';
  }

  return normalized.kind === 'regex'
    ? `regex: ${normalized.value}`
    : normalized.value;
}

export interface ScraperRequestField {
  key: string;
  value: string;
}

export interface ScraperRequestConfig {
  method?: ScraperRequestMethod;
  bodyMode?: ScraperRequestBodyMode;
  bodyFields?: ScraperRequestField[];
  body?: string;
  contentType?: string;
}

export interface ScraperIdentityDraft {
  kind: ScraperSourceKind;
  name: string;
  baseUrl: string;
  description?: string;
}

export interface ScraperHomeSearchConfig {
  enabled: boolean;
  query: string;
}

export type ScraperBookmarkMetadataField =
  | 'cover'
  | 'summary'
  | 'description'
  | 'authors'
  | 'tags'
  | 'mangaStatus'
  | 'pageCount'
  | 'languageCodes';

export interface ScraperBookmarkConfig {
  excludedFields: ScraperBookmarkMetadataField[];
}

export interface ScraperChapterDownloadConfig {
  autoAssignSeries: boolean;
}

export interface ScraperGlobalConfig {
  defaultTagIds: string[];
  defaultLanguage?: string;
  sourceLanguages: string[];
  contentTypes: string[];
  homeSearch: ScraperHomeSearchConfig;
  bookmark: ScraperBookmarkConfig;
  chapterDownloads: ScraperChapterDownloadConfig;
}

export interface ScraperAccessValidationRequest {
  kind: ScraperSourceKind;
  baseUrl: string;
}

export interface ScraperAccessValidationResult {
  ok: boolean;
  kind: ScraperSourceKind;
  normalizedUrl: string;
  checkedAt: string;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  warning?: string;
  error?: string;
}

export type ScraperFeatureValidationCheckKey =
  | 'title'
  | 'cover'
  | 'description'
  | 'authors'
  | 'authorUrl'
  | 'tags'
  | 'status'
  | 'pageCount'
  | 'language'
  | 'thumbnails'
  | 'thumbnailsNextPage'
  | 'chapters'
  | 'pages';

export type ScraperFeatureValidationIssueCode = 'no_match' | 'invalid_selector';
export type ScraperFeatureValidationFailureCode = 'request_failed' | 'http_error';
export type ScraperDetailsUrlStrategy = 'result_url' | 'template';
export type ScraperChaptersUrlStrategy = 'details_page' | 'template';
export type ScraperPagesUrlStrategy = 'details_page' | 'chapter_page' | 'template';
export type ScraperPagesTemplateBase = 'scraper_base' | 'details_page';
export type ScraperDetailsDerivedValueSourceType = 'requested_url' | 'final_url' | 'field' | 'selector' | 'html';
export type ScraperDetailsDerivedValueIssueCode =
  | 'missing_source'
  | 'invalid_selector'
  | 'invalid_pattern'
  | 'no_match';

export interface ScraperFeatureValidationCheck {
  key: ScraperFeatureValidationCheckKey;
  selector: string;
  required: boolean;
  matchedCount: number;
  sample?: string;
  samples?: string[];
  issueCode?: ScraperFeatureValidationIssueCode;
}

export interface ScraperChapterItem {
  url: string;
  label: string;
  image?: string;
}

export interface ScraperDetailsDerivedValueConfig {
  key: string;
  sourceType: ScraperDetailsDerivedValueSourceType;
  sourceField?: ScraperFeatureValidationCheckKey;
  selector?: ScraperFieldSelector;
  pattern?: string;
}

export interface ScraperDetailsDerivedValueResult {
  key: string;
  sourceType: ScraperDetailsDerivedValueSourceType;
  sourceField?: ScraperFeatureValidationCheckKey;
  selector?: ScraperFieldSelector;
  pattern?: string;
  sourceSample?: string;
  value?: string;
  issueCode?: ScraperDetailsDerivedValueIssueCode;
}

export interface ScraperFeatureValidationResult {
  ok: boolean;
  checkedAt: string;
  requestedUrl?: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  failureCode?: ScraperFeatureValidationFailureCode;
  checks: ScraperFeatureValidationCheck[];
  derivedValues: ScraperDetailsDerivedValueResult[];
  chapters?: ScraperChapterItem[];
}

export interface ScraperCardListConfig {
  resultListSelector?: string;
  resultItemSelector: string;
  titleSelector: ScraperFieldSelector;
  detailUrlSelector?: ScraperFieldSelector;
  authorUrlSelector?: ScraperFieldSelector;
  thumbnailSelector?: ScraperFieldSelector;
  summarySelector?: ScraperFieldSelector;
  pageCountSelector?: ScraperFieldSelector;
  nextPageSelector?: ScraperFieldSelector;
  languageDetection: ScraperLanguageDetectionConfig;
}

export interface ScraperSearchFeatureConfig extends ScraperCardListConfig {
  urlTemplate: string;
  testQuery?: string;
  request?: ScraperRequestConfig;
}

export interface ScraperAuthorFeatureConfig extends ScraperCardListConfig {
  urlStrategy: ScraperDetailsUrlStrategy;
  urlTemplate?: string;
  testUrl?: string;
  testValue?: string;
}

export interface ScraperSearchResultItem {
  title: string;
  detailUrl?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  summary?: string;
  pageCount?: string;
  languageCodes?: string[];
}

export interface ScraperDetailsFeatureConfig {
  urlStrategy: ScraperDetailsUrlStrategy;
  urlTemplate?: string;
  testUrl?: string;
  testValue?: string;
  titleSelector: ScraperFieldSelector;
  coverSelector?: ScraperFieldSelector;
  descriptionSelector?: ScraperFieldSelector;
  authorsSelector?: ScraperFieldSelector;
  authorUrlSelector?: ScraperFieldSelector;
  tagsSelector?: ScraperFieldSelector;
  statusSelector?: ScraperFieldSelector;
  pageCountSelector?: ScraperFieldSelector;
  thumbnailsListSelector?: string;
  thumbnailsSelector?: ScraperFieldSelector;
  thumbnailsNextPageSelector?: ScraperFieldSelector;
  languageDetection: ScraperLanguageDetectionConfig;
  derivedValues: ScraperDetailsDerivedValueConfig[];
}

export interface ScraperChaptersFeatureConfig {
  urlStrategy: ScraperChaptersUrlStrategy;
  urlTemplate?: string;
  templateBase?: ScraperPagesTemplateBase;
  chapterListSelector?: string;
  chapterItemSelector: string;
  chapterUrlSelector: ScraperFieldSelector;
  chapterImageSelector?: ScraperFieldSelector;
  chapterLabelSelector: ScraperFieldSelector;
  reverseOrder?: boolean;
}

export interface ScraperPagesFeatureConfig {
  urlStrategy: ScraperPagesUrlStrategy;
  urlTemplate?: string;
  templateBase?: ScraperPagesTemplateBase;
  pageImageSelector?: ScraperFieldSelector;
  linkedToChapters?: boolean;
}

export interface ScraperFeatureDefinition {
  kind: ScraperFeatureKind;
  label: string;
  description: string;
  status: ScraperFeatureStatus;
  config: Record<string, unknown> | null;
  validation: ScraperFeatureValidationResult | null;
}

export interface ScraperRecord {
  id: string;
  kind: ScraperSourceKind;
  name: string;
  baseUrl: string;
  description?: string;
  status: 'draft' | 'validated';
  createdAt: string;
  updatedAt: string;
  validation: ScraperAccessValidationResult | null;
  globalConfig: ScraperGlobalConfig;
  features: ScraperFeatureDefinition[];
}

export interface SaveScraperDraftRequest {
  id?: string;
  identity: ScraperIdentityDraft;
  validation: ScraperAccessValidationResult;
}

export interface SaveScraperFeatureRequest {
  scraperId: string;
  featureKind: ScraperFeatureKind;
  config: Record<string, unknown>;
  validation?: ScraperFeatureValidationResult | null;
}

export interface SaveScraperGlobalConfigRequest {
  scraperId: string;
  globalConfig: ScraperGlobalConfig;
}

export interface FetchScraperDocumentRequest {
  baseUrl: string;
  targetUrl: string;
  requestConfig?: ScraperRequestConfig;
}

export interface FetchScraperDocumentResult {
  ok: boolean;
  checkedAt: string;
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  html?: string;
  error?: string;
}

export interface DownloadScraperMangaRequest {
  title: string;
  pageUrls: string[];
  refererUrl?: string;
  scraperId?: string;
  scraperName?: string;
  sourceUrl?: string;
  sourceChapterUrl?: string;
  sourceChapterLabel?: string;
  replaceMangaId?: string;
  defaultTagIds?: string[];
  defaultLanguage?: string;
  autoAssignSeriesOnChapterDownload?: boolean;
  seriesTitle?: string;
  chapterLabel?: string;
  thumbnailUrl?: string;
}

export type ScraperDownloadJobStatus = 'queued' | 'running' | 'completed' | 'error' | 'cancelled';
export type ScraperDownloadJobMode = 'full_manga' | 'chapter';

export interface DownloadScraperMangaResult {
  ok: boolean;
  mangaId: string;
  folderPath: string;
  libraryRoot: string;
  downloadedCount: number;
}

export interface ScraperDownloadJob {
  id: string;
  title: string;
  status: ScraperDownloadJobStatus;
  mode: ScraperDownloadJobMode;
  scraperId?: string;
  scraperName?: string;
  sourceUrl?: string;
  sourceChapterUrl?: string;
  sourceChapterLabel?: string;
  replaceMangaId?: string;
  refererUrl?: string;
  chapterLabel?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  totalPages: number;
  downloadedPages: number;
  currentPage?: number;
  currentPageUrl?: string;
  folderPath?: string;
  libraryRoot?: string;
  mangaId?: string;
  downloadedCount?: number;
  message?: string | null;
  error?: string | null;
}

export interface ScraperDownloadQueueCounts {
  total: number;
  active: number;
  queued: number;
  running: number;
  completed: number;
  error: number;
  cancelled: number;
}

export interface ScraperDownloadQueueStatus {
  jobs: ScraperDownloadJob[];
  counts: ScraperDownloadQueueCounts;
}

export interface QueueScraperDownloadResult {
  ok: boolean;
  job: ScraperDownloadJob;
  status: ScraperDownloadQueueStatus;
}

export interface ScraperBookmarkRecord {
  scraperId: string;
  sourceUrl: string;
  title: string;
  cover?: string;
  summary?: string;
  description?: string;
  authors: string[];
  tags: string[];
  mangaStatus?: string;
  pageCount?: string;
  languageCodes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveScraperBookmarkRequest {
  scraperId: string;
  sourceUrl: string;
  title?: string;
  cover?: string;
  summary?: string;
  description?: string;
  authors?: string[];
  tags?: string[];
  mangaStatus?: string;
  pageCount?: string;
  languageCodes?: string[];
  excludedFields?: ScraperBookmarkMetadataField[];
}

export interface RemoveScraperBookmarkRequest {
  scraperId: string;
  sourceUrl: string;
}

export interface ScraperViewHistoryCardIdentity {
  scraperId: string;
  sourceUrl?: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
}

export interface ScraperViewHistoryRecord {
  id: string;
  scraperId: string;
  sourceUrl?: string;
  firstSeenAt: string;
  readAt?: string;
}

export interface RecordScraperCardsSeenRequest {
  cards: ScraperViewHistoryCardIdentity[];
}

export interface SetScraperCardReadRequest extends ScraperViewHistoryCardIdentity {
  read: boolean;
}

export interface ScraperReaderProgressRecord {
  id: string;
  scraperId: string;
  title: string;
  sourceUrl: string;
  currentPage?: number | null;
  totalPages?: number | null;
  updatedAt: string;
}

export interface SaveScraperReaderProgressRequest {
  id: string;
  scraperId: string;
  title: string;
  sourceUrl: string;
  currentPage?: number | null;
  totalPages?: number | null;
}

const normalizeScraperViewHistoryText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

export function normalizeScraperViewHistorySourceUrl(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

const hashScraperViewHistoryIdentity = (value: string): string => {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193);
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b);
  }

  return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
};

export function buildScraperViewHistoryCardId(identity: ScraperViewHistoryCardIdentity): string {
  const scraperId = normalizeScraperViewHistoryText(identity.scraperId);
  const sourceUrl = normalizeScraperViewHistorySourceUrl(identity.sourceUrl);
  const title = normalizeScraperViewHistoryText(identity.title);
  const thumbnailUrl = normalizeScraperViewHistorySourceUrl(identity.thumbnailUrl);

  if (!scraperId || (!sourceUrl && !title)) {
    return "";
  }

  const identityKey = [
    scraperId,
    sourceUrl || title,
    sourceUrl ? "" : thumbnailUrl,
  ].join("::");

  return `svh_${hashScraperViewHistoryIdentity(identityKey)}`;
}

export const SCRAPER_FEATURE_TEMPLATES: ReadonlyArray<{
  kind: ScraperFeatureKind;
  label: string;
  description: string;
}> = [
  {
    kind: 'search',
    label: 'Recherche',
    description: 'Definir comment lancer une recherche et extraire les resultats.',
  },
  {
    kind: 'details',
    label: 'Fiche',
    description: 'Definir comment ouvrir une fiche manga et recuperer ses metadonnees.',
  },
  {
    kind: 'author',
    label: 'Auteur',
    description: 'Definir comment ouvrir une page auteur et extraire la liste de cards retournee.',
  },
  {
    kind: 'chapters',
    label: 'Chapitres',
    description: 'Definir comment recuperer la liste des chapitres depuis une fiche manga.',
  },
  {
    kind: 'pages',
    label: 'Pages',
    description: 'Definir comment recuperer les pages du manga et ouvrir un lecteur.',
  },
];

export function createDefaultScraperGlobalConfig(): ScraperGlobalConfig {
  return {
    defaultTagIds: [],
    defaultLanguage: undefined,
    sourceLanguages: [],
    contentTypes: [],
    homeSearch: {
      enabled: false,
      query: '',
    },
    bookmark: {
      excludedFields: [],
    },
    chapterDownloads: {
      autoAssignSeries: false,
    },
  };
}

export function createDefaultScraperFeatures(): ScraperFeatureDefinition[] {
  return SCRAPER_FEATURE_TEMPLATES.map((feature) => ({
    ...feature,
    status: 'not_configured',
    config: null,
    validation: null,
  }));
}

export function normalizeScraperBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('L\'URL de base est requise.');
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const parsed = new URL(withProtocol);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Seules les URLs http et https sont acceptees.');
  }

  return parsed.toString();
}

export function resolveScraperUrl(baseUrl: string, input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('L\'URL cible est requise.');
  }

  const normalizedBaseUrl = normalizeScraperBaseUrl(baseUrl);
  return new URL(trimmed, normalizedBaseUrl).toString();
}

const encodeScraperTemplateValue = (value: string): string => {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
};

const applyScraperTemplateReplacements = (
  template: string,
  replacements: Array<[string, string]>,
): string => replacements.reduce(
  (current, [token, replacement]) => current.split(token).join(replacement),
  template,
);

const buildScraperSearchTemplateReplacements = (
  query: string,
  options?: {
    pageIndex?: number;
  },
): Array<[string, string]> => {
  const trimmedQuery = query.trim();
  const pageIndex = Math.max(0, options?.pageIndex ?? 0);
  const page = pageIndex + 1;
  const padPageNumber = (value: number, length: number): string => String(value).padStart(length, '0');
  const encodedQuery = encodeScraperTemplateValue(trimmedQuery);

  return [
    ['{{query}}', encodedQuery],
    ['{{search}}', encodedQuery],
    ['{{value}}', encodedQuery],
    ['{{page}}', String(page)],
    ['{{page2}}', padPageNumber(page, 2)],
    ['{{page3}}', padPageNumber(page, 3)],
    ['{{page4}}', padPageNumber(page, 4)],
    ['{{pageIndex}}', String(pageIndex)],
    ['{{pageIndex2}}', padPageNumber(pageIndex, 2)],
    ['{{pageIndex3}}', padPageNumber(pageIndex, 3)],
    ['{{pageIndex4}}', padPageNumber(pageIndex, 4)],
    ['{{rawQuery}}', trimmedQuery],
    ['{{plusQuery}}', trimmedQuery.split(' ').join('+')],
    ['{{rawSearch}}', trimmedQuery],
    ['{{rawValue}}', trimmedQuery],
  ];
};

export function buildScraperTemplateUrl(
  baseUrl: string,
  template: string,
  value: string,
): string {
  const trimmedTemplate = template.trim();
  const trimmedValue = value.trim();

  if (!trimmedTemplate) {
    throw new Error('Le template d\'URL est requis.');
  }

  if (!trimmedValue) {
    throw new Error('La valeur de test est requise.');
  }

  const encodedValue = encodeScraperTemplateValue(trimmedValue);
  const replacements: Array<[string, string]> = [
    ['{{value}}', encodedValue],
    ['{{id}}', encodedValue],
    ['{{slug}}', encodedValue],
    ['{{rawValue}}', trimmedValue],
    ['{{rawId}}', trimmedValue],
    ['{{rawSlug}}', trimmedValue],
  ];

  const resolvedTemplate = applyScraperTemplateReplacements(trimmedTemplate, replacements);

  return resolveScraperUrl(baseUrl, resolvedTemplate);
}

export function applyScraperSearchTemplate(
  template: string,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string {
  return applyScraperTemplateReplacements(
    template,
    buildScraperSearchTemplateReplacements(query, options),
  );
}

export function resolveScraperSearchTemplateString(
  template: string,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string {
  const trimmedTemplate = template.trim();

  if (!trimmedTemplate) {
    throw new Error('Le template de recherche est requis.');
  }

  return applyScraperSearchTemplate(trimmedTemplate, query, options);
}

export function buildScraperSearchUrl(
  baseUrl: string,
  template: string,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string {
  return resolveScraperUrl(
    baseUrl,
    resolveScraperSearchTemplateString(template, query, options),
  );
}

export function buildScraperContextTemplateUrl(
  baseUrl: string,
  template: string,
  context: Record<string, string | undefined>,
  options?: {
    relativeToUrl?: string;
  },
): string {
  const trimmedTemplate = template.trim();

  if (!trimmedTemplate) {
    throw new Error('Le template d\'URL est requis.');
  }

  let resolvedTemplate = trimmedTemplate;

  Object.entries(context).forEach(([key, rawValue]) => {
    if (typeof rawValue !== 'string' || !rawValue.length) {
      return;
    }

    resolvedTemplate = resolvedTemplate
      .split(`{{raw:${key}}}`)
      .join(rawValue)
      .split(`{{${key}}}`)
      .join(encodeScraperTemplateValue(rawValue));
  });

  const unresolvedMatches = resolvedTemplate.match(/{{\s*[^}]+\s*}}/g);
  if (unresolvedMatches?.length) {
    throw new Error(`Variables non resolues dans le template : ${unresolvedMatches.join(', ')}`);
  }

  const resolutionBaseUrl = options?.relativeToUrl?.trim() || baseUrl;
  return resolveScraperUrl(resolutionBaseUrl, resolvedTemplate);
}
