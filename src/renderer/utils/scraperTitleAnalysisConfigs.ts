import type {
  ScraperRecord,
  ScraperTitleAnalysisConfig,
} from "@/shared/scraper";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";

export type ScraperTitleAnalysisConfigs = ReadonlyMap<string, ScraperTitleAnalysisConfig>;

export const buildScraperTitleAnalysisConfigs = (
  scrapers: ScraperRecord[],
): ScraperTitleAnalysisConfigs => {
  const configs = new Map<string, ScraperTitleAnalysisConfig>();

  scrapers.forEach((scraper) => {
    const config = getScraperTitleAnalysisFeatureConfig(
      getScraperFeature(scraper, "titleAnalysis"),
    );
    if (config) {
      configs.set(scraper.id, config);
    }
  });

  return configs;
};
