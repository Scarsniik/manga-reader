import React, { useCallback, useEffect, useRef, useState } from "react";
import ScraperConfigWizard from "@/renderer/components/ScraperConfig/ScraperConfigWizard";
import ScraperBrowser from "@/renderer/components/ScraperBrowser/ScraperBrowser";
import type { ScraperBrowserInitialState } from "@/renderer/components/ScraperBrowser/types";
import WorkspaceScraperAuthorPanel from "@/renderer/components/Workspace/WorkspaceScraperAuthorPanel";
import {
  readWorkspaceBrowserTabCache,
  writeWorkspaceBrowserTabCache,
} from "@/renderer/components/Workspace/workspaceBrowserTabCache";
import type { WorkspaceTarget } from "@/renderer/types/workspace";
import type { ScraperRecord } from "@/shared/scraper";
import {
  extractScraperDetailsFromDocument,
  getScraperChaptersFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  hasRenderableDetails,
  isScraperFeatureConfigured,
  resolveScraperChapters,
} from "@/renderer/utils/scraperRuntime";
import { buildScraperTemplateContextFromDetails } from "@/renderer/utils/scraperTemplateContext";

type Props = {
  tabId: string;
  target: WorkspaceTarget;
  onTitleChange: (title: string) => void;
};

type ScraperConfigPanelProps = {
  scraperId: string;
  onTitleChange: (title: string) => void;
};

type ScraperDetailsPanelProps = {
  tabId: string;
  scraperId: string;
  sourceUrl: string;
  title?: string;
  onTitleChange: (title: string) => void;
};

const getWorkspaceApi = () => window.api ?? {};

function ScraperConfigPanel({ scraperId, onTitleChange }: ScraperConfigPanelProps) {
  const [scraper, setScraper] = useState<ScraperRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadScraper = useCallback(async () => {
    const api = getWorkspaceApi();
    if (!api || typeof api.getScrapers !== "function") {
      setError("La liste des scrappers n'est pas disponible dans cette version.");
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
        setError("Ce scrapper n'existe plus.");
        return;
      }

      setScraper(nextScraper as ScraperRecord);
      onTitleChange(nextScraper.name);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger le scrapper.");
    } finally {
      setLoading(false);
    }
  }, [onTitleChange, scraperId]);

  useEffect(() => {
    void loadScraper();

    window.addEventListener("scrapers-updated", loadScraper);
    return () => {
      window.removeEventListener("scrapers-updated", loadScraper);
    };
  }, [loadScraper]);

  const handleScraperChange = useCallback((nextScraper: ScraperRecord) => {
    setScraper(nextScraper);
    onTitleChange(nextScraper.name);
  }, [onTitleChange]);

  if (loading) {
    return (
      <div className="workspace-placeholder">
        Chargement du scrapper...
      </div>
    );
  }

  if (error || !scraper) {
    return (
      <div className="workspace-placeholder is-error">
        {error || "Impossible de charger ce scrapper."}
      </div>
    );
  }

  return (
    <div className="workspace-scraper-config">
      <ScraperConfigWizard
        initialScraper={scraper}
        onScraperChange={handleScraperChange}
      />
    </div>
  );
}

function ScraperDetailsPanel({
  tabId,
  scraperId,
  sourceUrl,
  title,
  onTitleChange,
}: ScraperDetailsPanelProps) {
  const targetKey = `scraper.details:${scraperId}:${sourceUrl}`;
  const cachedEntry = readWorkspaceBrowserTabCache(tabId, targetKey);
  const requestIdRef = useRef(0);
  const [scraper, setScraper] = useState<ScraperRecord | null>(cachedEntry?.scraper ?? null);
  const [initialState, setInitialState] = useState<ScraperBrowserInitialState | null>(cachedEntry?.initialState ?? null);
  const [loading, setLoading] = useState(!cachedEntry);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async (options?: { forceRefresh?: boolean }) => {
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

      const detailsFeature = getScraperFeature(nextScraper, "details");
      const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);
      if (!isScraperFeatureConfigured(detailsFeature) || !detailsConfig?.titleSelector) {
        setScraper(nextScraper);
        setInitialState(null);
        setError("Le composant Fiche de ce scrapper n'est pas assez configure pour ouvrir cette card.");
        return;
      }

      const documentResult = await api.fetchScraperDocument({
        baseUrl: nextScraper.baseUrl,
        targetUrl: sourceUrl,
      });

      if (!documentResult?.ok || !documentResult.html) {
        setScraper(nextScraper);
        setInitialState(null);
        setError(
          documentResult?.error
          || (typeof documentResult?.status === "number"
            ? `La fiche a repondu avec le code HTTP ${documentResult.status}.`
            : "Impossible de charger la fiche demandee."),
        );
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, "text/html");
      const detailsResult = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
        status: documentResult.status,
        contentType: documentResult.contentType,
        html: documentResult.html,
      });

      if (!hasRenderableDetails(detailsResult)) {
        setScraper(nextScraper);
        setInitialState(null);
        setError("La fiche a ete chargee, mais aucun contenu exploitable n'a ete extrait.");
        return;
      }

      const chaptersFeature = getScraperFeature(nextScraper, "chapters");
      const chaptersConfig = isScraperFeatureConfigured(chaptersFeature)
        ? getScraperChaptersFeatureConfig(chaptersFeature)
        : null;
      const chaptersResult = chaptersConfig
        ? await (async () => {
          try {
            const chaptersResolution = await resolveScraperChapters(
              nextScraper.baseUrl,
              detailsResult.finalUrl || detailsResult.requestedUrl,
              chaptersConfig,
              buildScraperTemplateContextFromDetails(detailsResult),
              async (request) => api.fetchScraperDocument(request),
            );

            if (!chaptersResolution.sourceResult.ok || !chaptersResolution.sourceResult.html) {
              console.warn("Workspace scraper chapters source fetch failed", chaptersResolution.sourceResult);
              return [];
            }

            return chaptersResolution.chapters;
          } catch (chaptersError) {
            console.warn("Workspace scraper chapters extraction failed", chaptersError);
            return [];
          }
        })()
        : [];
      if (requestId !== requestIdRef.current) {
        return;
      }

      const canonicalDetailsQuery = detailsResult.finalUrl || detailsResult.requestedUrl || sourceUrl;
      const nextInitialState: ScraperBrowserInitialState = {
        query: canonicalDetailsQuery,
        detailsResult,
        chaptersResult,
        listingReturnState: null,
      };
      const resolvedTitle = detailsResult.title || title || sourceUrl;

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
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger la fiche.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [onTitleChange, scraperId, sourceUrl, tabId, targetKey, title]);

  useEffect(() => {
    void loadDetails();

    const handleScrapersUpdated = () => {
      requestIdRef.current += 1;
      void loadDetails({ forceRefresh: true });
    };

    window.addEventListener("scrapers-updated", handleScrapersUpdated);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("scrapers-updated", handleScrapersUpdated);
    };
  }, [loadDetails]);

  if (loading) {
    return (
      <div className="workspace-placeholder">
        Chargement de la fiche...
      </div>
    );
  }

  if (error || !scraper || !initialState) {
    return (
      <div className="workspace-placeholder is-error">
        {error || "Impossible de charger cette fiche."}
      </div>
    );
  }

  return (
    <div className="workspace-scraper-details">
      <ScraperBrowser
        scraper={scraper}
        initialState={initialState}
      />
    </div>
  );
}

export default function WorkspaceTargetPanel({ tabId, target, onTitleChange }: Props) {
  if (target.kind === "scraper.config") {
    return (
      <ScraperConfigPanel
        scraperId={target.scraperId}
        onTitleChange={onTitleChange}
      />
    );
  }

  if (target.kind === "scraper.details") {
    return (
      <ScraperDetailsPanel
        tabId={tabId}
        scraperId={target.scraperId}
        sourceUrl={target.sourceUrl}
        title={target.title}
        onTitleChange={onTitleChange}
      />
    );
  }

  if (target.kind === "scraper.author") {
    return (
      <WorkspaceScraperAuthorPanel
        tabId={tabId}
        scraperId={target.scraperId}
        query={target.query}
        title={target.title}
        templateContext={target.templateContext}
        onTitleChange={onTitleChange}
      />
    );
  }

  return (
    <div className="workspace-placeholder is-error">
      Type d'onglet non supporte.
    </div>
  );
}
