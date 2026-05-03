import React, { useCallback, useEffect, useRef, useState } from "react";
import ScraperBrowser from "@/renderer/components/ScraperBrowser/ScraperBrowser";
import type { ScraperBrowserInitialState } from "@/renderer/components/ScraperBrowser/types";
import {
  readWorkspaceBrowserTabCache,
  writeWorkspaceBrowserTabCache,
} from "@/renderer/components/Workspace/workspaceBrowserTabCache";
import { hasScraperFieldSelectorValue, type ScraperRecord } from "@/shared/scraper";
import {
  extractScraperSearchPageFromDocument,
  formatScraperValueForDisplay,
  getScraperAuthorFeatureConfig,
  getScraperFeature,
  isScraperFeatureConfigured,
  resolveScraperAuthorTargetUrl,
} from "@/renderer/utils/scraperRuntime";
import type { ScraperTemplateContext } from "@/renderer/utils/scraperTemplateContext";

type Props = {
  tabId: string;
  scraperId: string;
  query: string;
  title?: string;
  templateContext?: ScraperTemplateContext;
  onTitleChange: (title: string) => void;
};

const getWorkspaceApi = () => window.api ?? {};

export default function WorkspaceScraperAuthorPanel({
  tabId,
  scraperId,
  query,
  title,
  templateContext,
  onTitleChange,
}: Props) {
  const targetKey = `scraper.author:${scraperId}:${JSON.stringify({
    query,
    templateContext: templateContext ?? null,
  })}`;
  const cachedEntry = readWorkspaceBrowserTabCache(tabId, targetKey);
  const requestIdRef = useRef(0);
  const [scraper, setScraper] = useState<ScraperRecord | null>(cachedEntry?.scraper ?? null);
  const [initialState, setInitialState] = useState<ScraperBrowserInitialState | null>(cachedEntry?.initialState ?? null);
  const [loading, setLoading] = useState(!cachedEntry);
  const [error, setError] = useState<string | null>(null);

  const loadAuthorPage = useCallback(async (options?: { forceRefresh?: boolean }) => {
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

      const authorFeature = getScraperFeature(nextScraper, "author");
      const authorConfig = getScraperAuthorFeatureConfig(authorFeature);
      if (!isScraperFeatureConfigured(authorFeature)
        || !authorConfig
        || !hasScraperFieldSelectorValue(authorConfig.titleSelector)
        || !authorConfig.resultItemSelector) {
        setScraper(nextScraper);
        setInitialState(null);
        setError("Le composant Auteur de ce scrapper n'est pas assez configure pour ouvrir cette page.");
        return;
      }

      const targetUrl = resolveScraperAuthorTargetUrl(nextScraper.baseUrl, authorConfig, query, {
        pageIndex: 0,
        templateContext,
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
            ? `La page auteur a repondu avec le code HTTP ${documentResult.status}.`
            : "Impossible de charger la page auteur demandee."),
        );
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, "text/html");
      const authorPage = extractScraperSearchPageFromDocument(documentNode, authorConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
      });
      const displayQuery = formatScraperValueForDisplay(query);
      const nextInitialState: ScraperBrowserInitialState = {
        query: displayQuery,
        listingMode: "author",
        listingPage: authorPage,
        listingVisitedPageUrls: [authorPage.currentPageUrl],
        listingPageIndex: 0,
        listingResults: authorPage.items,
        hasExecutedListing: true,
        listingReturnState: null,
        authorTemplateContext: templateContext ?? null,
      };
      const resolvedTitle = title || displayQuery || "Page auteur";

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
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger la page auteur.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [onTitleChange, query, scraperId, tabId, targetKey, templateContext, title]);

  useEffect(() => {
    void loadAuthorPage();

    const handleScrapersUpdated = () => {
      requestIdRef.current += 1;
      void loadAuthorPage({ forceRefresh: true });
    };

    window.addEventListener("scrapers-updated", handleScrapersUpdated);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("scrapers-updated", handleScrapersUpdated);
    };
  }, [loadAuthorPage]);

  if (loading) {
    return (
      <div className="workspace-placeholder">
        Chargement de la page auteur...
      </div>
    );
  }

  if (error || !scraper || !initialState) {
    return (
      <div className="workspace-placeholder is-error">
        {error || "Impossible de charger cette page auteur."}
      </div>
    );
  }

  return (
    <div className="workspace-scraper-author">
      <ScraperBrowser
        scraper={scraper}
        initialState={initialState}
      />
    </div>
  );
}
