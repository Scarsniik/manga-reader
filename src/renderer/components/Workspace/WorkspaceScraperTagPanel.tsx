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
  extractScraperSearchPageFromDocumentWithImageFallbacks,
  formatScraperValueForDisplay,
  getScraperFeature,
  getScraperTagFeatureConfig,
  isScraperFeatureConfigured,
  resolveScraperTagTargetUrl,
} from "@/renderer/utils/scraperRuntime";

type Props = {
  tabId: string;
  scraperId: string;
  query: string;
  title?: string;
  onOpenReaderTarget?: (target: ReaderWorkspaceTarget, options?: { returnTarget?: WorkspaceTarget }) => void;
  onTitleChange: (title: string) => void;
};

const getWorkspaceApi = () => window.api ?? {};

export default function WorkspaceScraperTagPanel({
  tabId,
  scraperId,
  query,
  title,
  onOpenReaderTarget,
  onTitleChange,
}: Props) {
  const targetKey = `scraper.tag:${scraperId}:${query}`;
  const cachedEntry = readWorkspaceBrowserTabCache(tabId, targetKey);
  const requestIdRef = useRef(0);
  const [scraper, setScraper] = useState<ScraperRecord | null>(cachedEntry?.scraper ?? null);
  const [initialState, setInitialState] = useState<ScraperBrowserInitialState | null>(cachedEntry?.initialState ?? null);
  const [loading, setLoading] = useState(!cachedEntry);
  const [error, setError] = useState<string | null>(null);

  const loadTagPage = useCallback(async (options?: { forceRefresh?: boolean }) => {
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
      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextScraper = Array.isArray(scrapers)
        ? scrapers.find((candidate: ScraperRecord) => candidate.id === scraperId) || null
        : null;

      if (!nextScraper) {
        setScraper(null);
        setInitialState(null);
        setError("Ce scrapper n'existe plus.");
        return;
      }

      const tagFeature = getScraperFeature(nextScraper, "tag");
      const tagConfig = getScraperTagFeatureConfig(tagFeature);
      if (!isScraperFeatureConfigured(tagFeature)
        || !tagConfig
        || !hasScraperFieldSelectorValue(tagConfig.titleSelector)
        || !tagConfig.resultItemSelector) {
        setScraper(nextScraper);
        setInitialState(null);
        setError("Le composant Tag de ce scrapper n'est pas assez configure pour ouvrir cette page.");
        return;
      }

      const targetUrl = resolveScraperTagTargetUrl(nextScraper.baseUrl, tagConfig, query, {
        pageIndex: 0,
      });
      const documentResult = await api.fetchScraperDocument({
        baseUrl: nextScraper.baseUrl,
        targetUrl,
      });

      if (!documentResult?.ok || !documentResult.html) {
        setScraper(nextScraper);
        setInitialState(null);
        setError(
          documentResult?.error
          || (typeof documentResult?.status === "number"
            ? `La page tag a repondu avec le code HTTP ${documentResult.status}.`
            : "Impossible de charger la page tag demandee."),
        );
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, "text/html");
      const tagPage = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, tagConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
      }, async (request) => api.fetchScraperDocument(request));
      const displayQuery = formatScraperValueForDisplay(query);
      const resolvedTagName = tagPage.listingNames?.[0] || title || displayQuery;
      const nextInitialState: ScraperBrowserInitialState = {
        query: displayQuery,
        listingMode: "tag",
        listingPage: tagPage,
        listingVisitedPageUrls: [tagPage.currentPageUrl],
        listingPageIndex: 0,
        listingResults: tagPage.items,
        hasExecutedListing: true,
        listingReturnState: null,
        tagDisplayName: resolvedTagName,
      };
      const resolvedTitle = resolvedTagName || "Page tag";

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
      if (requestId !== requestIdRef.current) {
        return;
      }

      setScraper(null);
      setInitialState(null);
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger la page tag.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [onTitleChange, query, scraperId, tabId, targetKey, title]);

  useEffect(() => {
    void loadTagPage();

    const handleScrapersUpdated = () => {
      requestIdRef.current += 1;
      void loadTagPage({ forceRefresh: true });
    };

    window.addEventListener("scrapers-updated", handleScrapersUpdated);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("scrapers-updated", handleScrapersUpdated);
    };
  }, [loadTagPage]);

  if (loading) {
    return (
      <div className="workspace-placeholder">
        Chargement de la page tag...
      </div>
    );
  }

  if (error || !scraper || !initialState) {
    return (
      <div className="workspace-placeholder is-error">
        {error || "Impossible de charger cette page tag."}
      </div>
    );
  }

  return (
    <div className="workspace-scraper-tag">
      <ScraperBrowser
        scraper={scraper}
        initialState={initialState}
        onOpenReaderTarget={onOpenReaderTarget}
        routeSyncEnabled={false}
      />
    </div>
  );
}
