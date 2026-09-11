import type { ScraperRecord } from "@/shared/scraper";
import { buildScraperTemplateContextFromDetails } from "@/renderer/utils/scraperTemplateContext";
import {
  getScraperChaptersFeatureConfig,
  getScraperFeature,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime/featureConfig";
import { resolveScraperChapters } from "@/renderer/utils/scraperRuntime/chapters";
import type {
  ScraperDocumentFetcher,
  ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime/types";

export const resolveScraperDetailsChapterCount = async ({
  scraper,
  details,
  fetchDocument,
}: {
  scraper: ScraperRecord;
  details: ScraperRuntimeDetailsResult;
  fetchDocument: ScraperDocumentFetcher;
}): Promise<number | null> => {
  const chaptersFeature = getScraperFeature(scraper, "chapters");
  if (!isScraperFeatureConfigured(chaptersFeature)) {
    return null;
  }

  const chaptersConfig = getScraperChaptersFeatureConfig(chaptersFeature);
  if (!chaptersConfig) {
    return null;
  }

  const resolution = await resolveScraperChapters(
    scraper.baseUrl,
    details.finalUrl || details.requestedUrl,
    chaptersConfig,
    buildScraperTemplateContextFromDetails(details),
    fetchDocument,
  );

  return resolution.sourceResult.ok ? resolution.chapters.length : null;
};
