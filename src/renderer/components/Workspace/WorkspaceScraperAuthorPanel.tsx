import React, { useCallback, useEffect, useState } from "react";
import ScraperBrowser from "@/renderer/components/ScraperBrowser/ScraperBrowser";
import type { ScraperBrowserInitialState } from "@/renderer/components/ScraperBrowser/types";
import type { ScraperRecord } from "@/shared/scraper";
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
  scraperId: string;
  query: string;
  title?: string;
  templateContext?: ScraperTemplateContext;
  onTitleChange: (title: string) => void;
};

const getWorkspaceApi = () => window.api ?? {};

export default function WorkspaceScraperAuthorPanel({
  scraperId,
  query,
  title,
  templateContext,
  onTitleChange,
}: Props) {
  const [scraper, setScraper] = useState<ScraperRecord | null>(null);
  const [initialState, setInitialState] = useState<ScraperBrowserInitialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuthorPage = useCallback(async () => {
    const api = getWorkspaceApi();
    if (!api || typeof api.getScrapers !== "function" || typeof api.fetchScraperDocument !== "function") {
      setError("Le runtime du scrapper n'est pas disponible dans cette version.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const scrapers = await api.getScrapers();
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
      if (!isScraperFeatureConfigured(authorFeature) || !authorConfig?.titleSelector || !authorConfig.resultItemSelector) {
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

      setScraper(nextScraper);
      setInitialState({
        query: displayQuery,
        listingMode: "author",
        listingPage: authorPage,
        listingVisitedPageUrls: [authorPage.currentPageUrl],
        listingPageIndex: 0,
        listingResults: authorPage.items,
        hasExecutedListing: true,
        listingReturnState: null,
        authorTemplateContext: templateContext ?? null,
      });
      onTitleChange(title || displayQuery || "Page auteur");
    } catch (loadError) {
      setScraper(null);
      setInitialState(null);
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger la page auteur.");
    } finally {
      setLoading(false);
    }
  }, [onTitleChange, query, scraperId, templateContext, title]);

  useEffect(() => {
    void loadAuthorPage();

    window.addEventListener("scrapers-updated", loadAuthorPage);
    return () => {
      window.removeEventListener("scrapers-updated", loadAuthorPage);
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
