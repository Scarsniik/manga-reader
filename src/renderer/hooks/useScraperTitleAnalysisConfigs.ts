import { useCallback, useEffect, useState } from "react";
import type { ScraperRecord } from "@/shared/scraper";
import {
  buildScraperTitleAnalysisConfigs,
  type ScraperTitleAnalysisConfigs,
} from "@/renderer/utils/scraperTitleAnalysisConfigs";

type ScraperTitleAnalysisConfigState = {
  configsByScraperId: ScraperTitleAnalysisConfigs;
  loading: boolean;
};

const EMPTY_CONFIGS: ScraperTitleAnalysisConfigs = new Map();

export default function useScraperTitleAnalysisConfigs(): ScraperTitleAnalysisConfigState {
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
      setConfigsByScraperId(buildScraperTitleAnalysisConfigs(
        Array.isArray(response) ? response as ScraperRecord[] : [],
      ));
    } catch (error) {
      console.warn("Failed to load scraper title analysis rules", error);
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
