import {
  buildScraperContextTemplateUrl,
  ScraperChaptersFeatureConfig,
  ScraperFeatureValidationResult,
  ScraperPagesTemplateBase,
} from '@/shared/scraper';

type DetailsTemplateContextInput = {
  requestedUrl: string;
  finalUrl?: string;
  title?: string;
  cover?: string;
  description?: string;
  authors: string[];
  tags: string[];
  mangaStatus?: string;
  derivedValues: Record<string, string>;
};

type ChapterTemplateContextInput = {
  url?: string | null;
} | null | undefined;

export type ScraperTemplateContext = Record<string, string | undefined>;

const CHAPTER_PAGE_PLACEHOLDER_PATTERN = /{{\s*(?:raw:)?chapterPage\s*}}/;

export const buildScraperTemplateContextFromDetails = (
  details: DetailsTemplateContextInput,
  chapter?: ChapterTemplateContextInput,
): ScraperTemplateContext => ({
  requestedUrl: details.requestedUrl,
  finalUrl: details.finalUrl || details.requestedUrl,
  title: details.title,
  cover: details.cover,
  description: details.description,
  authors: details.authors.length ? details.authors.join(', ') : undefined,
  tags: details.tags.length ? details.tags.join(', ') : undefined,
  status: details.mangaStatus,
  chapter: chapter?.url || undefined,
  ...details.derivedValues,
});

export const buildScraperTemplateContextFromValidation = (
  validation: ScraperFeatureValidationResult | null | undefined,
  options?: {
    chapterUrl?: string | null;
  },
): ScraperTemplateContext => {
  if (!validation?.ok) {
    return {};
  }

  const checksByKey = new Map(
    validation.checks.map((check) => [check.key, check.sample]),
  );
  const derivedValues = Object.fromEntries(
    validation.derivedValues
      .filter((derivedValue) => Boolean(derivedValue.value))
      .map((derivedValue) => [derivedValue.key, derivedValue.value as string]),
  ) as Record<string, string>;

  return {
    requestedUrl: validation.requestedUrl,
    finalUrl: validation.finalUrl || validation.requestedUrl,
    title: checksByKey.get('title'),
    cover: checksByKey.get('cover'),
    description: checksByKey.get('description'),
    authors: checksByKey.get('authors'),
    tags: checksByKey.get('tags'),
    status: checksByKey.get('status'),
    chapter: options?.chapterUrl || undefined,
    ...derivedValues,
  };
};

export const resolveScraperTemplateBaseUrl = (
  scraperBaseUrl: string,
  templateBase: ScraperPagesTemplateBase | undefined,
  detailsUrl?: string,
): string => (
  templateBase === 'details_page' && typeof detailsUrl === 'string' && detailsUrl.trim().length > 0
    ? detailsUrl
    : scraperBaseUrl
);

export const resolveScraperChaptersSourceUrl = (
  baseUrl: string,
  config: Pick<ScraperChaptersFeatureConfig, 'urlStrategy' | 'urlTemplate' | 'templateBase'>,
  templateContext: ScraperTemplateContext,
  detailsUrl: string,
  options?: {
    chapterPage?: number;
  },
): string => {
  if (config.urlStrategy === 'details_page') {
    return detailsUrl;
  }

  const chapterPage = Math.max(1, Math.floor(options?.chapterPage ?? 1));

  return buildScraperContextTemplateUrl(
    baseUrl,
    config.urlTemplate || '',
    {
      ...templateContext,
      chapterPage: String(chapterPage),
    },
    {
      relativeToUrl: resolveScraperTemplateBaseUrl(baseUrl, config.templateBase, detailsUrl),
    },
  );
};

export const hasScraperChapterPagePlaceholder = (template: string | undefined): boolean => (
  typeof template === 'string' && CHAPTER_PAGE_PLACEHOLDER_PATTERN.test(template)
);
