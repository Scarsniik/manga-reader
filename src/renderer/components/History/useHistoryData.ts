import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppHistoryRecords } from "@/shared/history";
import type { ScraperReaderProgressRecord, ScraperRecord } from "@/shared/scraper";
import type { Manga } from "@/renderer/types";
import {
  buildScraperProgressIndexes,
  EMPTY_HISTORY_RECORDS,
} from "@/renderer/components/History/historyUtils";

const getHistoryApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export const useHistoryData = (scrapers: ScraperRecord[]) => {
  const [historyRecords, setHistoryRecords] = useState<AppHistoryRecords>(EMPTY_HISTORY_RECORDS);
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [scraperProgressRecords, setScraperProgressRecords] = useState<ScraperReaderProgressRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const mangaById = useMemo(
    () => new Map(mangas.map((manga) => [manga.id, manga])),
    [mangas],
  );
  const progressIndexes = useMemo(
    () => buildScraperProgressIndexes(scraperProgressRecords),
    [scraperProgressRecords],
  );

  const loadHistoryRecords = useCallback(async () => {
    const api = getHistoryApi();
    if (!api || typeof api.getHistoryRecords !== "function") {
      setHistoryRecords(EMPTY_HISTORY_RECORDS);
      setLoading(false);
      return;
    }

    try {
      const records = await api.getHistoryRecords();
      setHistoryRecords(records && typeof records === "object" ? records as AppHistoryRecords : EMPTY_HISTORY_RECORDS);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Impossible de charger l'historique.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMangas = useCallback(async () => {
    const api = getHistoryApi();
    if (!api || typeof api.getMangas !== "function") {
      setMangas([]);
      return;
    }

    try {
      const nextMangas = await api.getMangas();
      setMangas(Array.isArray(nextMangas) ? nextMangas : []);
    } catch (error) {
      console.warn("Failed to load mangas for history", error);
      setMangas([]);
    }
  }, []);

  const loadScraperProgressRecords = useCallback(async () => {
    const api = getHistoryApi();
    if (!api || typeof api.getScraperReaderProgressRecords !== "function") {
      setScraperProgressRecords([]);
      return;
    }

    try {
      const records = await api.getScraperReaderProgressRecords();
      setScraperProgressRecords(Array.isArray(records) ? records : []);
    } catch (error) {
      console.warn("Failed to load scraper progress for history", error);
      setScraperProgressRecords([]);
    }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.all([
      loadHistoryRecords(),
      loadMangas(),
      loadScraperProgressRecords(),
    ]);
  }, [loadHistoryRecords, loadMangas, loadScraperProgressRecords]);

  useEffect(() => {
    void refreshData();

    const reloadHistory = () => {
      void refreshData();
    };

    window.addEventListener("history-updated", reloadHistory as EventListener);
    window.addEventListener("mangas-updated", reloadHistory as EventListener);
    return () => {
      window.removeEventListener("history-updated", reloadHistory as EventListener);
      window.removeEventListener("mangas-updated", reloadHistory as EventListener);
    };
  }, [refreshData]);

  return {
    historyRecords,
    setHistoryRecords,
    mangas,
    mangaById,
    progressIndexes,
    scrapersById,
    loading,
    loadError,
    refreshData,
  };
};
