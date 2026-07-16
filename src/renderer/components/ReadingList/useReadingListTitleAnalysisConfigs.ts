import { useCallback, useEffect, useState } from "react";
import type { ReadingListTitleAnalysisConfigs } from "@/renderer/components/ReadingList/readingListOrdering";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";
import type {
  ScraperRecord,
  ScraperTitleAnalysisConfig,
} from "@/shared/scraper";

type ReadingListTitleAnalysisConfigState = {
  configsByScraperId: ReadingListTitleAnalysisConfigs;
  loading: boolean;
};

const EMPTY_CONFIGS: ReadingListTitleAnalysisConfigs = new Map();

export default function useReadingListTitleAnalysisConfigs(): ReadingListTitleAnalysisConfigState {
  const [configsByScraperId, setConfigsByScraperId] = useState(EMPTY_CONFIGS);
  const [loading, setLoading] = useState(true);

  const loadConfigs = useCallback(async () => {
    const api = window.api ?? {};
    if (typeof api.getScrapers !== "function") {
      setConfigsByScraperId(EMPTY_CONFIGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.getScrapers();
      const nextConfigs = new Map<string, ScraperTitleAnalysisConfig>();
      if (Array.isArray(response)) {
        (response as ScraperRecord[]).forEach((scraper) => {
          const config = getScraperTitleAnalysisFeatureConfig(
            getScraperFeature(scraper, "titleAnalysis"),
          );
          if (config) {
            nextConfigs.set(scraper.id, config);
          }
        });
      }
      setConfigsByScraperId(nextConfigs);
    } catch (error) {
      console.warn("ReadingListView: failed to load title analysis rules", error);
      setConfigsByScraperId(EMPTY_CONFIGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleScrapersUpdated = () => {
      void loadConfigs();
    };

    void loadConfigs();
    window.addEventListener("scrapers-updated", handleScrapersUpdated);
    return () => {
      window.removeEventListener("scrapers-updated", handleScrapersUpdated);
    };
  }, [loadConfigs]);

  return { configsByScraperId, loading };
}
