import {
  buildScraperContextTemplateUrl,
  buildScraperTemplateUrl,
  FetchScraperDocumentResult,
  resolveScraperUrl,
  ScraperDetailsDerivedValueConfig,
  ScraperDetailsFeatureConfig,
  ScraperFeatureDefinition,
  ScraperFeatureKind,
  ScraperFeatureValidationCheckKey,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from '@/shared/scraper';

type DetailsFieldKey = Exclude<ScraperFeatureValidationCheckKey, 'pages'>;

export type ScraperRuntimeDetailsResult = {
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  title?: string;
  cover?: string;
  description?: string;
  authors: string[];
  tags: string[];
  mangaStatus?: string;
  derivedValues: Record<string, string>;
};

export type ScraperDocumentFetcher = (request: {
  baseUrl: string;
  targetUrl: string;
}) => Promise<FetchScraperDocumentResult>;

const DETAILS_FIELD_KEYS: DetailsFieldKey[] = [
  'title',
  'cover',
  'description',
  'authors',
  'tags',
  'status',
];

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeSelectorInput = (input: string): string => input
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
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
    tagsSelector: trimOptionalSelector(raw.tagsSelector),
    statusSelector: trimOptionalSelector(raw.statusSelector),
    derivedValues: Array.isArray(raw.derivedValues)
      ? raw.derivedValues
        .map((value) => normalizeDerivedValueConfig(value))
        .filter((value): value is ScraperDetailsDerivedValueConfig => Boolean(value))
      : [],
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
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'details_page',
    urlTemplate: trimOptional(raw.urlTemplate),
    pageImageSelector: trimOptionalSelector(raw.pageImageSelector),
  };
};

export const resolveScraperDetailsTargetUrl = (
  baseUrl: string,
  config: ScraperDetailsFeatureConfig,
  query: string,
): string => {
  if (config.urlStrategy === 'template') {
    return buildScraperTemplateUrl(baseUrl, config.urlTemplate || '', query);
  }

  return resolveScraperUrl(baseUrl, query);
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

export const extractSelectorValues = (doc: Document, input: string): string[] => {
  const { selector, attribute } = parseSelectorExpression(input);
  if (!selector) {
    return [];
  }

  return Array.from(doc.querySelectorAll(selector))
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

const padPageNumber = (value: number, length: number): string => String(value).padStart(length, '0');

const hasPagePlaceholder = (template: string | undefined): boolean => (
  typeof template === 'string' && /{{\s*page(?:Index)?\d*\s*}}/.test(template)
);

const isImageLikeContentType = (contentType: string | undefined): boolean => (
  typeof contentType === 'string' && contentType.toLowerCase().startsWith('image/')
);

const buildDetailsTemplateContext = (
  details: ScraperRuntimeDetailsResult,
): Record<string, string | undefined> => ({
  requestedUrl: details.requestedUrl,
  finalUrl: details.finalUrl || details.requestedUrl,
  title: details.title,
  cover: details.cover,
  description: details.description,
  authors: details.authors.length ? details.authors.join(', ') : undefined,
  tags: details.tags.length ? details.tags.join(', ') : undefined,
  status: details.mangaStatus,
  ...details.derivedValues,
});

const buildTemplateContextForPage = (
  context: Record<string, string | undefined>,
  pageIndex: number,
): Record<string, string | undefined> => ({
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

export const extractScraperDetailsFromDocument = (
  doc: Document,
  config: ScraperDetailsFeatureConfig,
  requestMeta: {
    requestedUrl: string;
    finalUrl?: string;
    status?: number;
    contentType?: string;
  },
): ScraperRuntimeDetailsResult => {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const fieldValuesByKey: Partial<Record<DetailsFieldKey, string[]>> = {};

  const selectorMap: Partial<Record<DetailsFieldKey, string | undefined>> = {
    title: config.titleSelector,
    cover: config.coverSelector,
    description: config.descriptionSelector,
    authors: config.authorsSelector,
    tags: config.tagsSelector,
    status: config.statusSelector,
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

  const derivedValues = config.derivedValues.reduce<Record<string, string>>((accumulator, derivedValue) => {
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
      sourceValues = derivedValue.sourceField
        ? fieldValuesByKey[derivedValue.sourceField] ?? []
        : [];
    } else {
      sourceValues = derivedValue.selector
        ? extractSelectorValues(doc, derivedValue.selector)
        : [];
    }

    if (!sourceValues.length) {
      return accumulator;
    }

    const sourceSample = sourceValues[0];
    if (!derivedValue.pattern) {
      accumulator[derivedValue.key] = sourceSample;
      return accumulator;
    }

    try {
      const match = sourceSample.match(new RegExp(derivedValue.pattern));
      if (!match) {
        return accumulator;
      }

      accumulator[derivedValue.key] = match[1] ?? match[0];
      return accumulator;
    } catch {
      return accumulator;
    }
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
    tags: uniqueValues(fieldValuesByKey.tags ?? []),
    mangaStatus: fieldValuesByKey.status?.[0],
    derivedValues,
  };
};

export const hasRenderableDetails = (details: ScraperRuntimeDetailsResult): boolean => (
  Boolean(
    details.title
    || details.cover
    || details.description
    || details.authors.length
    || details.tags.length
    || details.mangaStatus
  )
);

export async function resolveScraperPageUrls(
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
  pagesConfig: ScraperPagesFeatureConfig,
  fetchDocument: ScraperDocumentFetcher,
  options?: { maxTemplatePages?: number },
): Promise<string[]> {
  const maxTemplatePages = Math.max(1, options?.maxTemplatePages ?? 2000);
  const detailsUrl = details.finalUrl || details.requestedUrl;

  if (pagesConfig.urlStrategy === 'details_page') {
    if (!pagesConfig.pageImageSelector) {
      throw new Error('Le composant Pages doit avoir un selecteur pour lire les pages depuis la fiche.');
    }

    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl: detailsUrl,
    });

    if (!result.ok || !result.html) {
      throw new Error(
        result.error
        || (typeof result.status === 'number'
          ? `La fiche a repondu avec le code HTTP ${result.status}.`
          : 'Impossible de recuperer la fiche pour extraire les pages.'),
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

  const templateContext = buildDetailsTemplateContext(details);

  if (pagesConfig.pageImageSelector) {
    const targetUrl = buildScraperContextTemplateUrl(
      scraper.baseUrl,
      pagesConfig.urlTemplate,
      buildTemplateContextForPage(templateContext, 0),
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
    );
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
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
    );
    const result = await fetchDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!result.ok || !isImageLikeContentType(result.contentType)) {
      if (pageIndex === 0) {
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
