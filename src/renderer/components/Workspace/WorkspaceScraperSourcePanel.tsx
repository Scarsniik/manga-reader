import React, { useCallback, useEffect, useRef, useState } from "react";
import ScraperBrowser from "@/renderer/components/ScraperBrowser/ScraperBrowser";
import type { ScraperBrowserInitialState } from "@/renderer/components/ScraperBrowser/types";
import {
  readWorkspaceBrowserTabCache,
  writeWorkspaceBrowserTabCache,
} from "@/renderer/components/Workspace/workspaceBrowserTabCache";
import type { ReaderWorkspaceTarget, WorkspaceTarget } from "@/renderer/types/workspace";
import { hasScraperFieldSelectorValue, type ScraperRecord } from "@/shared/scraper";
import {
  fetchResolvedScraperListingPage,
  formatScraperValueForDisplay,
  getScraperFeature,
  getScraperSourceFeatureConfig,
  hasSourcePagePlaceholder,
  isScraperFeatureConfigured,
  resolveScraperSourceTargetUrl,
} from "@/renderer/utils/scraperRuntime";

type Props = {
  tabId: string;
  scraperId: string;
  query: string;
  title?: string;
  onOpenReaderTarget?: (target: ReaderWorkspaceTarget, options?: { returnTarget?: WorkspaceTarget }) => void;
  onOpenWorkspaceTarget?: (target: WorkspaceTarget, options?: { returnTarget?: WorkspaceTarget }) => void;
  onTitleChange: (title: string) => void;
};

const getWorkspaceApi = () => window.api ?? {};

export default function WorkspaceScraperSourcePanel({
  tabId,
  scraperId,
  query,
  title,
  onOpenReaderTarget,
  onOpenWorkspaceTarget,
  onTitleChange,
}: Props) {
  const targetKey = `scraper.source:${scraperId}:${query}`;
  const cachedEntry = readWorkspaceBrowserTabCache(tabId, targetKey);
  const requestIdRef = useRef(0);
  const [scraper, setScraper] = useState<ScraperRecord | null>(cachedEntry?.scraper ?? null);
  const [initialState, setInitialState] = useState<ScraperBrowserInitialState | null>(cachedEntry?.initialState ?? null);
  const [loading, setLoading] = useState(!cachedEntry);
  const [error, setError] = useState<string | null>(null);

  const loadSourcePage = useCallback(async (options?: { forceRefresh?: boolean }) => {
    const api = getWorkspaceApi();
    if (!api || typeof api.getScrapers !== "function" || typeof api.fetchScraperDocument !== "function") {
      setError("Le runtime du scrapper n'est pas disponible dans cette version.");
      setLoading(false);
      return;
    }

    const cachedState = options?.forceRefresh
      ? null
      : readWorkspaceBrowserTabCache(tabId, targetKey);

    if (cachedState) {
      setScraper(cachedState.scraper);
      setInitialState(cachedState.initialState);
      setError(null);
      setLoading(false);
      onTitleChange(cachedState.resolvedTitle);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const scrapers = await api.getScrapers();
      if (requestId !== requestIdRef.current) return;

      const nextScraper = Array.isArray(scrapers)
        ? scrapers.find((candidate: ScraperRecord) => candidate.id === scraperId) || null
        : null;
      if (!nextScraper) {
        setScraper(null);
        setInitialState(null);
        setError("Ce scrapper n'existe plus.");
        return;
      }

      const sourceFeature = getScraperFeature(nextScraper, "source");
      const sourceConfig = getScraperSourceFeatureConfig(sourceFeature);
      if (!isScraperFeatureConfigured(sourceFeature)
        || !sourceConfig
        || !hasScraperFieldSelectorValue(sourceConfig.titleSelector)
        || !sourceConfig.resultItemSelector) {
        setScraper(nextScraper);
        setInitialState(null);
        setError("Le composant Source de ce scrapper n'est pas assez configure pour ouvrir cette page.");
        return;
      }

      const targetUrl = resolveScraperSourceTargetUrl(nextScraper.baseUrl, sourceConfig, query, {
        pageIndex: 0,
      });
      const sourcePage = await fetchResolvedScraperListingPage({
        scraper: nextScraper,
        config: sourceConfig,
        targetUrl,
        pageIndex: 0,
        usesTemplatePaging: hasSourcePagePlaceholder(sourceConfig),
        responseLabel: "La page source",
        failureMessage: "Impossible de charger la page source demandee.",
      });
      const displayQuery = formatScraperValueForDisplay(query);
      const resolvedSourceName = sourcePage.listingNames?.[0] || title || displayQuery;
      const nextInitialState: ScraperBrowserInitialState = {
        query: displayQuery,
        listingMode: "source",
        listingPage: sourcePage,
        listingVisitedPageUrls: [sourcePage.currentPageUrl],
        listingPageIndex: 0,
        listingResults: sourcePage.items,
        hasExecutedListing: true,
        listingReturnState: null,
        sourceDisplayName: resolvedSourceName,
      };
      const resolvedTitle = resolvedSourceName || "Page source";

      setScraper(nextScraper);
      setInitialState(nextInitialState);
      writeWorkspaceBrowserTabCache(tabId, {
        targetKey,
        scraper: nextScraper,
        initialState: nextInitialState,
        resolvedTitle,
      });
      onTitleChange(resolvedTitle);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setScraper(null);
      setInitialState(null);
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger la page source.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [onTitleChange, query, scraperId, tabId, targetKey, title]);

  useEffect(() => {
    void loadSourcePage();

    const handleScrapersUpdated = () => {
      requestIdRef.current += 1;
      void loadSourcePage({ forceRefresh: true });
    };

    window.addEventListener("scrapers-updated", handleScrapersUpdated);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("scrapers-updated", handleScrapersUpdated);
    };
  }, [loadSourcePage]);

  if (loading) {
    return <div className="workspace-placeholder">Chargement de la page source...</div>;
  }

  if (error || !scraper || !initialState) {
    return (
      <div className="workspace-placeholder is-error">
        {error || "Impossible de charger cette page source."}
      </div>
    );
  }

  return (
    <div className="workspace-scraper-source">
      <ScraperBrowser
        scraper={scraper}
        initialState={initialState}
        onOpenReaderTarget={onOpenReaderTarget}
        onOpenWorkspaceTarget={onOpenWorkspaceTarget}
        routeSyncEnabled={false}
      />
    </div>
  );
}
