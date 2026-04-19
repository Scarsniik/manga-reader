import {
  applyScraperSearchTemplate,
  buildScraperSearchUrl,
  ScraperChapterItem,
  ScraperAuthorFeatureConfig,
  ScraperCardListConfig,
  ScraperChaptersFeatureConfig,
  buildScraperContextTemplateUrl,
  buildScraperTemplateUrl,
  FetchScraperDocumentResult,
  resolveScraperUrl,
  ScraperDetailsDerivedValueConfig,
  ScraperDetailsDerivedValueResult,
  ScraperDetailsFeatureConfig,
  ScraperFeatureDefinition,
  ScraperFeatureKind,
  ScraperFeatureValidationCheckKey,
  ScraperPagesFeatureConfig,
  ScraperPagesTemplateBase,
  ScraperRequestConfig,
  ScraperRequestField,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
  ScraperRecord,
} from '@/shared/scraper';
import {
  buildScraperTemplateContextFromDetails,
  hasScraperChapterPagePlaceholder,
  resolveScraperChaptersSourceUrl,
  resolveScraperTemplateBaseUrl,
  type ScraperTemplateContext,
} from '@/renderer/utils/scraperTemplateContext';
import {
  usesScraperPagesChapterSource,
  usesScraperPagesChapters,
  usesScraperPagesSelectorSource,
  usesScraperPagesTemplateChapterContext,
} from '@/renderer/utils/scraperPages';

type DetailsFieldKey = Extract<
  ScraperFeatureValidationCheckKey,
  'title' | 'cover' | 'description' | 'authors' | 'tags' | 'status' | 'pageCount'
>;

export type ScraperRuntimeChapterResult = ScraperChapterItem;

export type ScraperRuntimeDetailsResult = {
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  title?: string;
  cover?: string;
  description?: string;
  authors: string[];
  authorUrls: string[];
  tags: string[];
  thumbnails?: string[];
  thumbnailsNextPageUrl?: string;
  mangaStatus?: string;
  pageCount?: string;
  derivedValues: Record<string, string>;
};

export type ScraperReaderSession = {
  id: string;
  scraperId: string;
  title: string;
  sourceUrl: string;
  cover?: string;
  pageUrls: string[];
};

export type ScraperRuntimeSearchPageResult = {
  currentPageUrl: string;
  nextPageUrl?: string;
  items: ScraperSearchResultItem[];
};

export type ScraperDocumentFetcher = (request: {
  baseUrl: string;
  targetUrl: string;
}) => Promise<FetchScraperDocumentResult>;

export type ScraperResolvedChaptersResult = {
  sourceResult: FetchScraperDocumentResult;
  chapters: ScraperRuntimeChapterResult[];
  pagesVisited: number;
};

const DETAILS_FIELD_KEYS: DetailsFieldKey[] = [
  'title',
  'cover',
  'description',
  'authors',
  'tags',
  'status',
  'pageCount',
];

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const RESERVED_SCRAPER_DISPLAY_CHARACTERS = new Set([
  ':',
  '/',
  '?',
  '#',
  '[',
  ']',
  '@',
  '!',
  '$',
  '&',
  '\'',
  '(',
  ')',
  '*',
  '+',
  ',',
  ';',
  '=',
  '%',
]);

export const normalizeSelectorInput = (input: string): string => input
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const formatScraperValueForDisplay = (value: string | undefined): string => {
  if (typeof value !== 'string' || !value.length) {
    return '';
  }

  return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, (encodedChunk) => {
    try {
      const decodedChunk = decodeURIComponent(encodedChunk);
      return Array.from(decodedChunk).some((character) => RESERVED_SCRAPER_DISPLAY_CHARACTERS.has(character))
        ? encodedChunk
        : decodedChunk;
    } catch {
      return encodedChunk;
    }
  });
};

export const formatScraperPageCountForDisplay = (value: string | undefined): string => {
  const normalizedValue = formatScraperValueForDisplay(String(value ?? '').trim());
  if (!normalizedValue) {
    return '';
  }

  return /^\d+$/.test(normalizedValue)
    ? `${normalizedValue} page(s)`
    : normalizedValue;
};

const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
};

const normalizePagesTemplateBase = (value: unknown): ScraperPagesTemplateBase => (
  value === 'details_page' ? 'details_page' : 'scraper_base'
);

const buildCardListConfig = (
  raw: Record<string, unknown>,
): ScraperCardListConfig => ({
  resultListSelector: trimOptionalSelector(raw.resultListSelector),
  resultItemSelector: normalizeSelectorInput(String(raw.resultItemSelector ?? '')),
  titleSelector: normalizeSelectorInput(String(raw.titleSelector ?? '')),
  detailUrlSelector: trimOptionalSelector(raw.detailUrlSelector),
  authorUrlSelector: trimOptionalSelector(raw.authorUrlSelector),
  thumbnailSelector: trimOptionalSelector(raw.thumbnailSelector),
  summarySelector: trimOptionalSelector(raw.summarySelector),
  pageCountSelector: trimOptionalSelector(raw.pageCountSelector),
  nextPageSelector: trimOptionalSelector(raw.nextPageSelector),
});

const normalizeRequestField = (value: unknown): ScraperRequestField | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const key = trimOptional(raw.key) ?? '';
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

const normalizeRequestConfig = (value: unknown): ScraperRequestConfig | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const method = raw.method === 'POST' ? 'POST' : 'GET';
  const bodyMode = raw.bodyMode === 'raw' ? 'raw' : 'form';
  const bodyFields = Array.isArray(raw.bodyFields)
    ? raw.bodyFields
      .map((field) => normalizeRequestField(field))
      .filter((field): field is ScraperRequestField => Boolean(field))
    : [];
  const body = typeof raw.body === 'string' ? raw.body : undefined;
  const contentType = trimOptional(raw.contentType);

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

const isDetailsFieldKey = (value: unknown): value is DetailsFieldKey => (
  DETAILS_FIELD_KEYS.includes(String(value) as DetailsFieldKey)
);

const normalizeDerivedValueConfig = (
  value: unknown,
): ScraperDetailsDerivedValueConfig | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const key = trimOptional(raw.key);
  if (!key) {
    return null;
  }

  return {
    key,
    sourceType: raw.sourceType === 'selector'
      || raw.sourceType === 'html'
      || raw.sourceType === 'requested_url'
      || raw.sourceType === 'final_url'
      ? raw.sourceType
      : 'field',
    sourceField: isDetailsFieldKey(raw.sourceField) ? raw.sourceField : undefined,
    selector: trimOptionalSelector(raw.selector),
    pattern: trimOptional(raw.pattern),
  };
};

export const getScraperFeature = (
  scraper: ScraperRecord,
  featureKind: ScraperFeatureKind,
): ScraperFeatureDefinition | null => (
  scraper.features.find((feature) => feature.kind === featureKind) ?? null
);

export const getScraperSearchFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperSearchFeatureConfig | null => {
  if (!feature?.config) {
    return null;
  }

  const raw = feature.config as Record<string, unknown>;

  return {
    ...buildCardListConfig(raw),
    urlTemplate: trimOptional(raw.urlTemplate) ?? '',
    testQuery: trimOptional(raw.testQuery),
    request: normalizeRequestConfig(raw.request),
  };
};

export const getScraperAuthorFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperAuthorFeatureConfig | null => {
  if (!feature?.config) {
    return null;
  }

  const raw = feature.config as Record<string, unknown>;

  return {
    ...buildCardListConfig(raw),
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'result_url',
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
  };
};

export const isScraperFeatureConfigured = (
  feature: ScraperFeatureDefinition | null | undefined,
): boolean => Boolean(feature?.config && feature.status !== 'not_configured');

export const getScraperDetailsFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperDetailsFeatureConfig | null => {
  if (!feature?.config) {
    return null;
  }

  const raw = feature.config as Record<string, unknown>;
  const titleSelector = normalizeSelectorInput(String(raw.titleSelector ?? ''));

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'result_url',
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
    titleSelector,
    coverSelector: trimOptionalSelector(raw.coverSelector),
    descriptionSelector: trimOptionalSelector(raw.descriptionSelector),
    authorsSelector: trimOptionalSelector(raw.authorsSelector),
    authorUrlSelector: trimOptionalSelector(raw.authorUrlSelector),
    tagsSelector: trimOptionalSelector(raw.tagsSelector),
    statusSelector: trimOptionalSelector(raw.statusSelector),
    pageCountSelector: trimOptionalSelector(raw.pageCountSelector),
    thumbnailsListSelector: trimOptionalSelector(raw.thumbnailsListSelector),
    thumbnailsSelector: trimOptionalSelector(raw.thumbnailsSelector),
    thumbnailsNextPageSelector: trimOptionalSelector(raw.thumbnailsNextPageSelector),
    derivedValues: Array.isArray(raw.derivedValues)
      ? raw.derivedValues
        .map((value) => normalizeDerivedValueConfig(value))
        .filter((value): value is ScraperDetailsDerivedValueConfig => Boolean(value))
      : [],
  };
};

export const getScraperChaptersFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperChaptersFeatureConfig | null => {
  if (!feature?.config) {
    return null;
  }

  const raw = feature.config as Record<string, unknown>;
  const chapterItemSelector = normalizeSelectorInput(String(raw.chapterItemSelector ?? ''));
  const chapterUrlSelector = normalizeSelectorInput(String(raw.chapterUrlSelector ?? ''));
  const chapterLabelSelector = normalizeSelectorInput(String(raw.chapterLabelSelector ?? ''));

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'details_page',
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: normalizePagesTemplateBase(raw.templateBase),
    chapterListSelector: trimOptionalSelector(raw.chapterListSelector),
    chapterItemSelector,
    chapterUrlSelector,
    chapterImageSelector: trimOptionalSelector(raw.chapterImageSelector),
    chapterLabelSelector,
    reverseOrder: Boolean(raw.reverseOrder),
  };
};

export const getScraperPagesFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperPagesFeatureConfig | null => {
  if (!feature?.config) {
    return null;
  }

  const raw = feature.config as Record<string, unknown>;

  return {
    urlStrategy: raw.urlStrategy === 'template'
      ? 'template'
      : raw.urlStrategy === 'chapter_page' || Boolean(raw.linkedToChapters)
        ? 'chapter_page'
        : 'details_page',
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: normalizePagesTemplateBase(raw.templateBase),
    pageImageSelector: trimOptionalSelector(raw.pageImageSelector),
    linkedToChapters: raw.urlStrategy === 'template'
      ? Boolean(raw.linkedToChapters)
      : false,
  };
};

export const resolveScraperDetailsTargetUrl = (
  baseUrl: string,
  config: ScraperDetailsFeatureConfig,
  query: string,
): string => {
  const trimmedQuery = query.trim();
  const looksLikeDirectUrlInput = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedQuery)
    || trimmedQuery.startsWith('//')
    || trimmedQuery.startsWith('/')
    || trimmedQuery.startsWith('./')
    || trimmedQuery.startsWith('../')
    || trimmedQuery.startsWith('?')
    || trimmedQuery.startsWith('#');

  if (config.urlStrategy === 'template' && !looksLikeDirectUrlInput) {
    return buildScraperTemplateUrl(baseUrl, config.urlTemplate || '', trimmedQuery);
  }

  return resolveScraperUrl(baseUrl, trimmedQuery);
};

export const resolveScraperSearchTargetUrl = (
  baseUrl: string,
  config: ScraperSearchFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
  },
): string => buildScraperSearchUrl(baseUrl, config.urlTemplate || '', query, options);

export const resolveScraperAuthorTargetUrl = (
  baseUrl: string,
  config: ScraperAuthorFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
    templateContext?: ScraperTemplateContext;
  },
): string => {
  const trimmedQuery = query.trim();
  const looksLikeDirectUrlInput = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedQuery)
    || trimmedQuery.startsWith('//')
    || trimmedQuery.startsWith('/')
    || trimmedQuery.startsWith('./')
    || trimmedQuery.startsWith('../')
    || trimmedQuery.startsWith('?')
    || trimmedQuery.startsWith('#');

  if (config.urlStrategy === 'template' && !looksLikeDirectUrlInput) {
    const searchResolvedTemplate = applyScraperSearchTemplate(
      config.urlTemplate || '',
      trimmedQuery,
      options,
    );

    return buildScraperContextTemplateUrl(
      baseUrl,
      searchResolvedTemplate,
      options?.templateContext ?? {},
    );
  }

  return resolveScraperUrl(baseUrl, trimmedQuery);
};

export const resolveScraperSearchRequestConfig = (
  config: ScraperSearchFeatureConfig,
  query: string,
  options?: {
    pageIndex?: number;
  },
): ScraperRequestConfig | undefined => {
  const request = normalizeRequestConfig(config.request);
  if (!request || request.method !== 'POST') {
    return undefined;
  }

  if (request.bodyMode === 'raw') {
    return {
      method: 'POST',
      bodyMode: 'raw',
      body: typeof request.body === 'string'
        ? applyScraperSearchTemplate(request.body, query, options)
        : '',
      contentType: request.contentType,
    };
  }

  return {
    method: 'POST',
    bodyMode: 'form',
    bodyFields: (request.bodyFields ?? [])
      .filter((field) => field.key.trim().length > 0)
      .map((field) => ({
        key: applyScraperSearchTemplate(field.key, query, options),
        value: applyScraperSearchTemplate(field.value, query, options),
      })),
    contentType: request.contentType,
  };
};

export const parseSelectorExpression = (
  input: string,
): { selector: string; attribute?: string } => {
  const trimmed = normalizeSelectorInput(input);
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { selector: trimmed };
  }

  return {
    selector: trimmed.slice(0, atIndex).trim(),
    attribute: trimmed.slice(atIndex + 1).trim(),
  };
};

const extractSelectorValuesFromRoot = (root: ParentNode, input: string): string[] => {
  const { selector, attribute } = parseSelectorExpression(input);
  if (!selector) {
    return [];
  }

  return Array.from(root.querySelectorAll(selector))
    .map((element) => {
      if (attribute) {
        return element.getAttribute(attribute)?.trim() || '';
      }

      if (element.tagName === 'IMG') {
        return element.getAttribute('src')?.trim() || '';
      }

      return element.textContent?.trim() || '';
    })
    .filter(Boolean);
};

const extractUrlSelectorValuesFromRoot = (root: ParentNode, input: string): string[] => {
  const { selector, attribute } = parseSelectorExpression(input);
  if (!selector) {
    return [];
  }

  return Array.from(root.querySelectorAll(selector))
    .map((element) => {
      if (attribute) {
        return element.getAttribute(attribute)?.trim() || '';
      }

      if (element.tagName === 'A') {
        return element.getAttribute('href')?.trim() || '';
      }

      if (element.tagName === 'IMG') {
        return element.getAttribute('src')?.trim() || '';
      }

      return element.textContent?.trim() || '';
    })
    .filter(Boolean);
};

export const extractSelectorValues = (doc: Document, input: string): string[] => (
  extractSelectorValuesFromRoot(doc, input)
);

export const toAbsoluteScraperUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
};

const uniqueChapterResults = (
  chapters: ScraperRuntimeChapterResult[],
): ScraperRuntimeChapterResult[] => {
  const seen = new Set<string>();

  return chapters.filter((chapter) => {
    const key = `${chapter.url}::${chapter.label}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const applyScraperChaptersOrder = (
  chapters: ScraperRuntimeChapterResult[],
  config: Pick<ScraperChaptersFeatureConfig, 'reverseOrder'>,
): ScraperRuntimeChapterResult[] => (
  config.reverseOrder ? [...chapters].reverse() : chapters
);

const uniqueSearchResults = (
  results: ScraperSearchResultItem[],
): ScraperSearchResultItem[] => {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = `${result.detailUrl ?? ''}::${result.title}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const createStableHash = (input: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createScraperMangaId = (
  scraperId: string,
  sourceUrl: string,
  contextKey?: string | null,
): string => (
  `scraper-${scraperId}-${createStableHash(`${scraperId}::${sourceUrl}::${contextKey || ''}`)}`
);

const padPageNumber = (value: number, length: number): string => String(value).padStart(length, '0');

const hasPagePlaceholder = (template: string | undefined): boolean => (
  typeof template === 'string' && /{{\s*page(?:Index)?\d*\s*}}/.test(template)
);

export const hasSearchPagePlaceholder = (
  config: ScraperSearchFeatureConfig | null | undefined,
): boolean => hasPagePlaceholder(config?.urlTemplate);

export const hasAuthorPagePlaceholder = (
  config: ScraperAuthorFeatureConfig | null | undefined,
): boolean => hasPagePlaceholder(config?.urlTemplate);

const isImageLikeContentType = (contentType: string | undefined): boolean => (
  typeof contentType === 'string' && contentType.toLowerCase().startsWith('image/')
);

const buildSequentialImageUrl = (
  prefix: string,
  index: number,
  padLength: number,
  extension: string,
  suffix: string,
): string => `${prefix}${String(index).padStart(padLength, '0')}${extension}${suffix}`;

const parseSequentialImagePattern = (imageUrl: string): {
  prefix: string;
  startIndex: number;
  padLength: number;
  extension: string;
  suffix: string;
} | null => {
  const match = imageUrl.match(/^(.*\/)(\d+)(\.[^./?#]+)([?#].*)?$/);
  if (!match) {
    return null;
  }

  const startIndex = Number.parseInt(match[2], 10);
  if (!Number.isFinite(startIndex)) {
    return null;
  }

  return {
    prefix: match[1],
    startIndex,
    padLength: match[2].length,
    extension: match[3],
    suffix: match[4] || '',
  };
};

const resolveSequentialPageUrlsFromCover = async (
  details: ScraperRuntimeDetailsResult,
  fetchDocument: ScraperDocumentFetcher,
  maxTemplatePages: number,
): Promise<string[] | null> => {
  const coverUrl = String(details.cover || '').trim();
  const imagePattern = parseSequentialImagePattern(coverUrl);
  if (!imagePattern) {
    return null;
  }

  const pageUrls: string[] = [];

  for (let pageOffset = 0; pageOffset < maxTemplatePages; pageOffset += 1) {
    const targetUrl = buildSequentialImageUrl(
      imagePattern.prefix,
      imagePattern.startIndex + pageOffset,
      imagePattern.padLength,
      imagePattern.extension,
      imagePattern.suffix,
    );
    const result = await fetchDocument({
      baseUrl: details.requestedUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      if (pageOffset === 0) {
        return null;
      }
      break;
    }

    pageUrls.push(result.finalUrl || result.requestedUrl);
  }

  return pageUrls.length ? uniqueValues(pageUrls) : null;
};

const buildTemplateContextForPage = (
  context: ScraperTemplateContext,
  pageIndex: number,
): ScraperTemplateContext => ({
  ...context,
  page: String(pageIndex + 1),
  page2: padPageNumber(pageIndex + 1, 2),
  page3: padPageNumber(pageIndex + 1, 3),
  page4: padPageNumber(pageIndex + 1, 4),
  pageIndex: String(pageIndex),
  pageIndex2: padPageNumber(pageIndex, 2),
  pageIndex3: padPageNumber(pageIndex, 3),
  pageIndex4: padPageNumber(pageIndex, 4),
});

export const extractScraperSearchPageFromDocument = (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperRuntimeSearchPageResult => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const searchRoots = config.resultListSelector
    ? Array.from(doc.querySelectorAll(config.resultListSelector))
    : [doc];
  const resultItems = Array.from(
    new Set(
      searchRoots.flatMap((root) => Array.from(root.querySelectorAll(config.resultItemSelector))),
    ),
  );

  const results = resultItems.reduce<ScraperSearchResultItem[]>((accumulator, item) => {
    const title = extractSelectorValuesFromRoot(item, config.titleSelector)[0];
    if (!title) {
      return accumulator;
    }

    const detailUrlValue = config.detailUrlSelector
      ? extractUrlSelectorValuesFromRoot(item, config.detailUrlSelector)[0]
      : undefined;
    const authorUrlValue = config.authorUrlSelector
      ? extractUrlSelectorValuesFromRoot(item, config.authorUrlSelector)[0]
      : undefined;
    const thumbnailValue = config.thumbnailSelector
      ? extractSelectorValuesFromRoot(item, config.thumbnailSelector)[0]
      : undefined;
    const summaryValue = config.summarySelector
      ? extractSelectorValuesFromRoot(item, config.summarySelector)[0]
      : undefined;
    const pageCountValue = config.pageCountSelector
      ? extractSelectorValuesFromRoot(item, config.pageCountSelector)[0]
      : undefined;

    accumulator.push({
      title,
      detailUrl: detailUrlValue
        ? toAbsoluteScraperUrl(detailUrlValue, documentUrl)
        : undefined,
      authorUrl: authorUrlValue
        ? toAbsoluteScraperUrl(authorUrlValue, documentUrl)
        : undefined,
      thumbnailUrl: thumbnailValue
        ? toAbsoluteScraperUrl(thumbnailValue, documentUrl)
        : undefined,
      summary: summaryValue,
      pageCount: pageCountValue,
    });

    return accumulator;
  }, []);

  const nextPageValue = config.nextPageSelector
    ? extractUrlSelectorValuesFromRoot(doc, config.nextPageSelector)[0]
    : undefined;

  return {
    currentPageUrl: documentUrl,
    nextPageUrl: nextPageValue
      ? toAbsoluteScraperUrl(nextPageValue, documentUrl)
      : undefined,
    items: uniqueSearchResults(results),
  };
};

export const extractScraperSearchResultsFromDocument = (
  doc: Document,
  config: ScraperCardListConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperSearchResultItem[] => extractScraperSearchPageFromDocument(doc, config, requestMeta).items;

export type ScraperRuntimeDetailsRequestMeta = {
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  html?: string;
};

export type ScraperRuntimeDetailsFieldValues = Partial<Record<DetailsFieldKey, string[]>>;

export type ScraperRuntimeDetailsThumbnailsPageResult = {
  thumbnails: string[];
  nextPageUrl?: string;
};

export const extractScraperAuthorUrlsFromDocument = (
  doc: Document,
  selector: string | undefined,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, 'requestedUrl' | 'finalUrl'>,
): string[] => {
  if (!selector) {
    return [];
  }

  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  return uniqueValues(
    extractUrlSelectorValuesFromRoot(doc, selector).map((value) => toAbsoluteScraperUrl(value, documentUrl)),
  );
};

export const extractScraperDetailsThumbnailsFromDocument = (
  doc: Document,
  config: Pick<ScraperDetailsFeatureConfig, 'thumbnailsListSelector' | 'thumbnailsSelector' | 'thumbnailsNextPageSelector'>,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, 'requestedUrl' | 'finalUrl'>,
): string[] => (
  extractScraperDetailsThumbnailsPageFromDocument(doc, config, requestMeta).thumbnails
);

export const extractScraperDetailsThumbnailsPageFromDocument = (
  doc: Document,
  config: Pick<ScraperDetailsFeatureConfig, 'thumbnailsListSelector' | 'thumbnailsSelector' | 'thumbnailsNextPageSelector'>,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, 'requestedUrl' | 'finalUrl'>,
): ScraperRuntimeDetailsThumbnailsPageResult => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const nextPageValue = config.thumbnailsNextPageSelector
    ? extractUrlSelectorValuesFromRoot(doc, config.thumbnailsNextPageSelector)[0]
    : undefined;
  const nextPageUrl = nextPageValue
    ? toAbsoluteScraperUrl(nextPageValue, documentUrl)
    : undefined;

  if (!config.thumbnailsSelector) {
    return {
      thumbnails: [],
      nextPageUrl,
    };
  }

  const thumbnailsSelector = config.thumbnailsSelector;
  const thumbnailRoots = config.thumbnailsListSelector
    ? Array.from(doc.querySelectorAll(config.thumbnailsListSelector))
    : [doc];

  return {
    thumbnails: thumbnailRoots.flatMap((root) => (
      extractSelectorValuesFromRoot(root, thumbnailsSelector)
        .map((value) => toAbsoluteScraperUrl(value, documentUrl))
    )),
    nextPageUrl,
  };
};

export const extractScraperDetailsFieldValues = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: Pick<ScraperRuntimeDetailsRequestMeta, 'requestedUrl' | 'finalUrl'>,
): ScraperRuntimeDetailsFieldValues => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const fieldValuesByKey: ScraperRuntimeDetailsFieldValues = {};

  const selectorMap: Partial<Record<DetailsFieldKey, string | undefined>> = {
    title: config.titleSelector,
    cover: config.coverSelector,
    description: config.descriptionSelector,
    authors: config.authorsSelector,
    tags: config.tagsSelector,
    status: config.statusSelector,
    pageCount: config.pageCountSelector,
  };

  DETAILS_FIELD_KEYS.forEach((fieldKey) => {
    const selector = selectorMap[fieldKey];
    if (!selector) {
      fieldValuesByKey[fieldKey] = [];
      return;
    }

    const values = extractSelectorValues(doc, selector);
    fieldValuesByKey[fieldKey] = fieldKey === 'cover'
      ? values.map((value) => toAbsoluteScraperUrl(value, documentUrl))
      : values;
  });

  return fieldValuesByKey;
};

export const extractScraperDetailsDerivedValueResults = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: ScraperRuntimeDetailsRequestMeta,
  fieldValuesByKey: ScraperRuntimeDetailsFieldValues,
): ScraperDetailsDerivedValueResult[] => config.derivedValues.map((derivedValue) => {
  const baseResult: ScraperDetailsDerivedValueResult = {
    key: derivedValue.key,
    sourceType: derivedValue.sourceType,
    sourceField: derivedValue.sourceField,
    selector: derivedValue.selector,
    pattern: derivedValue.pattern,
  };

  let sourceValues: string[] = [];

  if (derivedValue.sourceType === 'requested_url') {
    sourceValues = requestMeta.requestedUrl ? [requestMeta.requestedUrl] : [];
  } else if (derivedValue.sourceType === 'final_url') {
    sourceValues = requestMeta.finalUrl
      ? [requestMeta.finalUrl]
      : requestMeta.requestedUrl
        ? [requestMeta.requestedUrl]
        : [];
  } else if (derivedValue.sourceType === 'field') {
    sourceValues = isDetailsFieldKey(derivedValue.sourceField)
      ? fieldValuesByKey[derivedValue.sourceField] ?? []
      : [];
  } else if (derivedValue.sourceType === 'selector') {
    try {
      sourceValues = derivedValue.selector
        ? extractSelectorValues(doc, derivedValue.selector)
        : [];
    } catch {
      return {
        ...baseResult,
        issueCode: 'invalid_selector',
      };
    }
  } else {
    sourceValues = requestMeta.html
      ? [requestMeta.html]
      : doc.documentElement?.outerHTML
        ? [doc.documentElement.outerHTML]
        : [];
  }

  if (sourceValues.length === 0) {
    return {
      ...baseResult,
      issueCode: derivedValue.sourceType === 'requested_url'
        || derivedValue.sourceType === 'final_url'
        || derivedValue.sourceType === 'html'
        ? 'missing_source'
        : 'no_match',
    };
  }

  const sourceSample = derivedValue.sourceType === 'html' ? 'HTML brut de la page' : sourceValues[0];

  if (derivedValue.sourceType === 'html' && !derivedValue.pattern) {
    return {
      ...baseResult,
      sourceSample,
      issueCode: 'invalid_pattern',
    };
  }

  if (!derivedValue.pattern) {
    return {
      ...baseResult,
      sourceSample,
      value: sourceValues[0],
    };
  }

  try {
    const match = sourceValues[0].match(new RegExp(derivedValue.pattern));
    if (!match) {
      return {
        ...baseResult,
        sourceSample,
        issueCode: 'no_match',
      };
    }

    return {
      ...baseResult,
      sourceSample,
      value: match[1] ?? match[0],
    };
  } catch {
    return {
      ...baseResult,
      sourceSample,
      issueCode: 'invalid_pattern',
    };
  }
});

export const extractScraperDetailsFromDocument = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: ScraperRuntimeDetailsRequestMeta,
): ScraperRuntimeDetailsResult => {
  const fieldValuesByKey = extractScraperDetailsFieldValues(doc, config, requestMeta);
  const derivedValueResults = extractScraperDetailsDerivedValueResults(doc, config, requestMeta, fieldValuesByKey);
  const authorUrls = extractScraperAuthorUrlsFromDocument(doc, config.authorUrlSelector, requestMeta);
  const thumbnailsPage = extractScraperDetailsThumbnailsPageFromDocument(doc, config, requestMeta);
  const derivedValues = derivedValueResults.reduce<Record<string, string>>((accumulator, derivedValue) => {
    if (derivedValue.value) {
      accumulator[derivedValue.key] = derivedValue.value;
    }

    return accumulator;
  }, {});

  return {
    requestedUrl: requestMeta.requestedUrl,
    finalUrl: requestMeta.finalUrl,
    status: requestMeta.status,
    contentType: requestMeta.contentType,
    title: fieldValuesByKey.title?.[0],
    cover: fieldValuesByKey.cover?.[0],
    description: fieldValuesByKey.description?.[0],
    authors: uniqueValues(fieldValuesByKey.authors ?? []),
    authorUrls,
    tags: uniqueValues(fieldValuesByKey.tags ?? []),
    thumbnails: config.thumbnailsSelector ? thumbnailsPage.thumbnails : undefined,
    thumbnailsNextPageUrl: thumbnailsPage.nextPageUrl,
    mangaStatus: fieldValuesByKey.status?.[0],
    pageCount: fieldValuesByKey.pageCount?.[0],
    derivedValues,
  };
};

export const extractScraperChaptersFromDocument = (
  doc: Document,
  config: ScraperChaptersFeatureConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
  },
): ScraperRuntimeChapterResult[] => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const chapterRoots = config.chapterListSelector
    ? Array.from(doc.querySelectorAll(config.chapterListSelector))
    : [doc];
  const chapterItems = Array.from(
    new Set(
      chapterRoots.flatMap((root) => Array.from(root.querySelectorAll(config.chapterItemSelector))),
    ),
  );

  const chapters = chapterItems.reduce<ScraperRuntimeChapterResult[]>((accumulator, item, index) => {
    const chapterUrl = extractUrlSelectorValuesFromRoot(item, config.chapterUrlSelector)[0];
    const chapterLabel = extractSelectorValuesFromRoot(item, config.chapterLabelSelector)[0];
    const chapterImage = config.chapterImageSelector
      ? extractSelectorValuesFromRoot(item, config.chapterImageSelector)[0]
      : undefined;

    if (!chapterUrl || !chapterLabel) {
      return accumulator;
    }

    accumulator.push({
      url: toAbsoluteScraperUrl(chapterUrl, documentUrl),
      label: chapterLabel || `Chapitre ${index + 1}`,
      image: chapterImage
        ? toAbsoluteScraperUrl(chapterImage, documentUrl)
        : undefined,
    });

    return accumulator;
  }, []);

  return uniqueChapterResults(chapters);
};

export async function resolveScraperChapters(
  scraperBaseUrl: string,
  detailsUrl: string,
  config: ScraperChaptersFeatureConfig,
  templateContext: ScraperTemplateContext,
  fetchDocument: ScraperDocumentFetcher,
  options?: {
    maxChapterPages?: number;
  },
): Promise<ScraperResolvedChaptersResult> {
  const maxChapterPages = Math.max(1, options?.maxChapterPages ?? 100);
  const usesChapterPagination = config.urlStrategy === 'template'
    && hasScraperChapterPagePlaceholder(config.urlTemplate);
  const parser = new DOMParser();
  let sourceResult: FetchScraperDocumentResult | null = null;
  let chapters: ScraperRuntimeChapterResult[] = [];
  let pagesVisited = 0;

  for (let chapterPageIndex = 0; chapterPageIndex < maxChapterPages; chapterPageIndex += 1) {
    const targetUrl = resolveScraperChaptersSourceUrl(
      scraperBaseUrl,
      config,
      templateContext,
      detailsUrl,
      {
        chapterPage: chapterPageIndex + 1,
      },
    );

    const documentResult = await fetchDocument({
      baseUrl: scraperBaseUrl,
      targetUrl,
    });
    pagesVisited += 1;

    if (!sourceResult) {
      sourceResult = documentResult;
    }

    if (!documentResult.ok || !documentResult.html) {
      if (chapterPageIndex === 0) {
        return {
          sourceResult: documentResult,
          chapters: [],
          pagesVisited,
        };
      }

      break;
    }

    const doc = parser.parseFromString(documentResult.html, 'text/html');
    const pageChapters = extractScraperChaptersFromDocument(doc, config, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });

    if (!pageChapters.length) {
      if (chapterPageIndex === 0) {
        return {
          sourceResult: documentResult,
          chapters: [],
          pagesVisited,
        };
      }

      break;
    }

    const mergedChapters = uniqueChapterResults([
      ...chapters,
      ...pageChapters,
    ]);
    const addedChapterCount = mergedChapters.length - chapters.length;
    chapters = mergedChapters;

    if (!usesChapterPagination) {
      break;
    }

    if (chapterPageIndex > 0 && addedChapterCount === 0) {
      break;
    }
  }

  if (!sourceResult) {
    throw new Error('Impossible de recuperer la source des chapitres.');
  }

  return {
    sourceResult,
    chapters: applyScraperChaptersOrder(chapters, config),
    pagesVisited,
  };
}

export const hasRenderableDetails = (details: ScraperRuntimeDetailsResult): boolean => (
  Boolean(
    details.title
    || details.cover
    || details.description
    || details.authors.length
    || details.tags.length
    || (details.thumbnails?.length ?? 0) > 0
    || details.mangaStatus
    || details.pageCount
  )
);

export async function resolveScraperPageUrls(
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  fetchDocument: ScraperDocumentFetcher,
  options?: {
    maxTemplatePages?: number;
    chapter?: ScraperRuntimeChapterResult | null;
  },
): Promise<string[]> {
  const maxTemplatePages = Math.max(1, options?.maxTemplatePages ?? 2000);
  const chapter = options?.chapter ?? null;
  const detailsUrl = details.finalUrl || details.requestedUrl;
  const usesChapterSource = usesScraperPagesChapterSource(pagesConfig);
  const usesChapterContext = usesScraperPagesChapters(pagesConfig);
  const usesTemplateChapterContext = usesScraperPagesTemplateChapterContext(pagesConfig);
  const targetUrl = usesChapterSource
    ? chapter?.url || ''
    : detailsUrl;
  const templateBaseUrl = resolveScraperTemplateBaseUrl(
    scraper.baseUrl,
    pagesConfig.templateBase,
    usesTemplateChapterContext && chapter?.url
      ? chapter.url
      : detailsUrl,
  );

  if (usesChapterContext && !chapter?.url) {
    throw new Error('Choisis d\'abord un chapitre pour recuperer les pages.');
  }

  if (usesScraperPagesSelectorSource(pagesConfig)) {
    if (!pagesConfig.pageImageSelector) {
      throw new Error('Le composant Pages doit avoir un selecteur pour lire les pages depuis la fiche ou un chapitre.');
    }

    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !result.html) {
      throw new Error(
        result.error
        || (typeof result.status === 'number'
          ? `La source des pages a repondu avec le code HTTP ${result.status}.`
          : 'Impossible de recuperer la source des pages pour extraire les pages.'),
      );
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(result.html, 'text/html');
    const documentUrl = result.finalUrl || result.requestedUrl;
    const pageUrls = extractSelectorValues(doc, pagesConfig.pageImageSelector)
      .map((value) => toAbsoluteScraperUrl(value, documentUrl));
    const uniquePageUrls = uniqueValues(pageUrls);

    if (!uniquePageUrls.length) {
      throw new Error('Aucune page n\'a ete trouvee avec la configuration actuelle.');
    }

    return uniquePageUrls;
  }

  if (!pagesConfig.urlTemplate) {
    throw new Error('Le template des pages est requis pour ce mode.');
  }

  const templateContext = buildScraperTemplateContextFromDetails(details, chapter);

  if (pagesConfig.pageImageSelector) {
    const targetUrl = buildScraperContextTemplateUrl(
      scraper.baseUrl,
      pagesConfig.urlTemplate,
      buildTemplateContextForPage(templateContext, 0),
      {
        relativeToUrl: templateBaseUrl,
      },
    );
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !result.html) {
      throw new Error(
        result.error
        || (typeof result.status === 'number'
          ? `La source des pages a repondu avec le code HTTP ${result.status}.`
          : 'Impossible de recuperer la source des pages.'),
      );
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(result.html, 'text/html');
    const documentUrl = result.finalUrl || result.requestedUrl;
    const pageUrls = extractSelectorValues(doc, pagesConfig.pageImageSelector)
      .map((value) => toAbsoluteScraperUrl(value, documentUrl));
    const uniquePageUrls = uniqueValues(pageUrls);

    if (!uniquePageUrls.length) {
      throw new Error('Aucune page n\'a ete trouvee avec le selecteur fourni.');
    }

    return uniquePageUrls;
  }

  if (!hasPagePlaceholder(pagesConfig.urlTemplate)) {
    const targetUrl = buildScraperContextTemplateUrl(
      scraper.baseUrl,
      pagesConfig.urlTemplate,
      buildTemplateContextForPage(templateContext, 0),
      {
        relativeToUrl: templateBaseUrl,
      },
    );
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      const fallbackPageUrls = await resolveSequentialPageUrlsFromCover(
        details,
        fetchDocument,
        maxTemplatePages,
      );
      if (fallbackPageUrls?.length) {
        return fallbackPageUrls;
      }

      throw new Error(
        result.error
        || 'Le template des pages ne renvoie pas une image exploitable.',
      );
    }

    return [result.finalUrl || result.requestedUrl];
  }

  const pageUrls: string[] = [];

  for (let pageIndex = 0; pageIndex < maxTemplatePages; pageIndex += 1) {
    const targetUrl = buildScraperContextTemplateUrl(
      scraper.baseUrl,
      pagesConfig.urlTemplate,
      buildTemplateContextForPage(templateContext, pageIndex),
      {
        relativeToUrl: templateBaseUrl,
      },
    );
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      if (pageIndex === 0) {
        const fallbackPageUrls = await resolveSequentialPageUrlsFromCover(
          details,
          fetchDocument,
          maxTemplatePages,
        );
        if (fallbackPageUrls?.length) {
          return fallbackPageUrls;
        }

        throw new Error(
          result.error
          || 'Le template des pages ne renvoie pas une premiere page valide.',
        );
      }
      break;
    }

    pageUrls.push(result.finalUrl || result.requestedUrl);
  }

  const uniquePageUrls = uniqueValues(pageUrls);
  if (!uniquePageUrls.length) {
    throw new Error('Aucune page n\'a pu etre resolue depuis le template.');
  }

  return uniquePageUrls;
}
