export type ScraperSourceKind = 'site' | 'api';
export type ScraperFeatureKind = 'search' | 'details' | 'pages';
export type ScraperFeatureStatus = 'not_configured' | 'configured' | 'validated';

export interface ScraperIdentityDraft {
  kind: ScraperSourceKind;
  name: string;
  baseUrl: string;
  description?: string;
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
  | 'tags'
  | 'status'
  | 'pages';

export type ScraperFeatureValidationIssueCode = 'no_match' | 'invalid_selector';
export type ScraperFeatureValidationFailureCode = 'request_failed' | 'http_error';
export type ScraperDetailsUrlStrategy = 'result_url' | 'template';
export type ScraperPagesUrlStrategy = 'details_page' | 'template';
export type ScraperDetailsDerivedValueSourceType = 'requested_url' | 'final_url' | 'field' | 'selector';
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

export interface ScraperDetailsDerivedValueConfig {
  key: string;
  sourceType: ScraperDetailsDerivedValueSourceType;
  sourceField?: ScraperFeatureValidationCheckKey;
  selector?: string;
  pattern?: string;
}

export interface ScraperDetailsDerivedValueResult {
  key: string;
  sourceType: ScraperDetailsDerivedValueSourceType;
  sourceField?: ScraperFeatureValidationCheckKey;
  selector?: string;
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
}

export interface ScraperSearchFeatureConfig {
  urlTemplate: string;
  testQuery?: string;
  resultListSelector?: string;
  resultItemSelector: string;
  titleSelector: string;
  detailUrlSelector?: string;
  thumbnailSelector?: string;
  summarySelector?: string;
  nextPageSelector?: string;
}

export interface ScraperSearchResultItem {
  title: string;
  detailUrl?: string;
  thumbnailUrl?: string;
  summary?: string;
}

export interface ScraperDetailsFeatureConfig {
  urlStrategy: ScraperDetailsUrlStrategy;
  urlTemplate?: string;
  testUrl?: string;
  testValue?: string;
  titleSelector: string;
  coverSelector?: string;
  descriptionSelector?: string;
  authorsSelector?: string;
  tagsSelector?: string;
  statusSelector?: string;
  derivedValues: ScraperDetailsDerivedValueConfig[];
}

export interface ScraperPagesFeatureConfig {
  urlStrategy: ScraperPagesUrlStrategy;
  urlTemplate?: string;
  pageImageSelector?: string;
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

export interface FetchScraperDocumentRequest {
  baseUrl: string;
  targetUrl: string;
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
}

export interface DownloadScraperMangaResult {
  ok: boolean;
  mangaId: string;
  folderPath: string;
  libraryRoot: string;
  downloadedCount: number;
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
    kind: 'pages',
    label: 'Pages',
    description: 'Definir comment recuperer les pages du manga et ouvrir un lecteur.',
  },
];

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

  const encodedValue = encodeURIComponent(trimmedValue);
  const replacements: Array<[string, string]> = [
    ['{{value}}', encodedValue],
    ['{{id}}', encodedValue],
    ['{{slug}}', encodedValue],
    ['{{rawValue}}', trimmedValue],
    ['{{rawId}}', trimmedValue],
    ['{{rawSlug}}', trimmedValue],
  ];

  const resolvedTemplate = replacements.reduce(
    (current, [token, replacement]) => current.split(token).join(replacement),
    trimmedTemplate,
  );

  return resolveScraperUrl(baseUrl, resolvedTemplate);
}

export function buildScraperSearchUrl(
  baseUrl: string,
  template: string,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string {
  const trimmedTemplate = template.trim();
  const trimmedQuery = query.trim();
  const pageIndex = Math.max(0, options?.pageIndex ?? 0);
  const page = pageIndex + 1;
  const padPageNumber = (value: number, length: number): string => String(value).padStart(length, '0');

  if (!trimmedTemplate) {
    throw new Error('Le template de recherche est requis.');
  }

  const encodedQuery = encodeURIComponent(trimmedQuery);
  const replacements: Array<[string, string]> = [
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
    ['{{rawSearch}}', trimmedQuery],
    ['{{rawValue}}', trimmedQuery],
  ];

  const resolvedTemplate = replacements.reduce(
    (current, [token, replacement]) => current.split(token).join(replacement),
    trimmedTemplate,
  );

  return resolveScraperUrl(baseUrl, resolvedTemplate);
}

export function buildScraperContextTemplateUrl(
  baseUrl: string,
  template: string,
  context: Record<string, string | undefined>,
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
      .join(encodeURIComponent(rawValue));
  });

  const unresolvedMatches = resolvedTemplate.match(/{{\s*[^}]+\s*}}/g);
  if (unresolvedMatches?.length) {
    throw new Error(`Variables non resolues dans le template : ${unresolvedMatches.join(', ')}`);
  }

  return resolveScraperUrl(baseUrl, resolvedTemplate);
}
