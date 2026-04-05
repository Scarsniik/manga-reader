import { ScraperPagesFeatureConfig } from '@/shared/scraper';

type ScraperPagesChapterConfig = Pick<ScraperPagesFeatureConfig, 'urlStrategy' | 'linkedToChapters'>;

export const usesScraperPagesTemplateChapterContext = (
  config: ScraperPagesChapterConfig | null | undefined,
): boolean => Boolean(config && config.urlStrategy === 'template' && config.linkedToChapters);

export const usesScraperPagesChapterSource = (
  config: ScraperPagesChapterConfig | null | undefined,
): boolean => Boolean(config && config.urlStrategy === 'chapter_page');

export const usesScraperPagesChapters = (
  config: ScraperPagesChapterConfig | null | undefined,
): boolean => (
  usesScraperPagesChapterSource(config) || usesScraperPagesTemplateChapterContext(config)
);

export const usesScraperPagesSelectorSource = (
  config: Pick<ScraperPagesFeatureConfig, 'urlStrategy'> | null | undefined,
): boolean => Boolean(
  config && (config.urlStrategy === 'details_page' || config.urlStrategy === 'chapter_page'),
);
