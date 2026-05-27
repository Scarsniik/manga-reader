import React, { useMemo, useState } from "react";
import {
  type FetchScraperDocumentResult,
  type ScraperRecord,
  type ScraperTitleAnalysisConfig,
  type ScraperTitleAnalysisResult,
} from "@/shared/scraper";
import {
  extractScraperSearchPageFromDocument,
  getScraperFeature,
  getScraperSearchFeatureConfig,
  isScraperFeatureConfigured,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
} from "@/renderer/utils/scraperRuntime";

type Props = {
  scraper: ScraperRecord;
  config: ScraperTitleAnalysisConfig;
  manualTitlesText: string;
  results: ScraperTitleAnalysisResult[];
  disabled?: boolean;
  onManualTitlesTextChange: (value: string) => void;
  onConfigChange: (config: ScraperTitleAnalysisConfig) => void;
  onSearchTitlesLoaded: (titles: string[]) => void;
};

const formatList = (values: string[], fallback = "-"): string => (
  values.length ? values.join(", ") : fallback
);

const formatSequence = (result: ScraperTitleAnalysisResult): string => (
  result.sequenceMarkers.length
    ? result.sequenceMarkers.map((marker) => `${marker.label} ${marker.value}`).join(", ")
    : "-"
);

export default function TitleAnalysisTestPanel({
  scraper,
  config,
  manualTitlesText,
  results,
  disabled = false,
  onManualTitlesTextChange,
  onConfigChange,
  onSearchTitlesLoaded,
}: Props) {
  const [searchTitles, setSearchTitles] = useState<string[]>([]);
  const [loadingSearchTitles, setLoadingSearchTitles] = useState(false);
  const [searchLoadError, setSearchLoadError] = useState<string | null>(null);
  const searchFeature = useMemo(() => getScraperFeature(scraper, "search"), [scraper]);
  const searchConfig = useMemo(() => getScraperSearchFeatureConfig(searchFeature), [searchFeature]);
  const canLoadSearchTitles = Boolean(searchConfig && isScraperFeatureConfigured(searchFeature));

  const updateConfig = (partial: Partial<ScraperTitleAnalysisConfig>) => {
    onConfigChange({
      ...config,
      ...partial,
    });
  };

  const handleLoadSearchTitles = async () => {
    if (!searchConfig || !canLoadSearchTitles) {
      setSearchLoadError("Configure d'abord le composant Recherche pour charger des exemples.");
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== "function") {
      setSearchLoadError("Le chargement de recherche n'est pas disponible dans cette version.");
      return;
    }

    setLoadingSearchTitles(true);
    setSearchLoadError(null);

    try {
      const query = (config.searchTestQuery || searchConfig.testQuery || "").trim();
      const targetUrl = resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig, query, {
        pageIndex: 0,
      });
      const documentResult = await (window as any).api.fetchScraperDocument({
        baseUrl: scraper.baseUrl,
        targetUrl,
        requestConfig: resolveScraperSearchRequestConfig(searchConfig, query, { pageIndex: 0 }),
      });
      const typedDocumentResult = documentResult as FetchScraperDocumentResult;

      if (!typedDocumentResult.ok || !typedDocumentResult.html) {
        throw new Error(
          typedDocumentResult.error
          || "Impossible de charger la recherche de test.",
        );
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(typedDocumentResult.html, "text/html");
      const page = extractScraperSearchPageFromDocument(documentNode, searchConfig, {
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
      });
      const limit = Math.max(1, Math.min(100, config.searchTestLimit ?? 20));
      const titles = Array.from(new Set(
        page.items
          .map((item) => item.title.trim())
          .filter(Boolean),
      )).slice(0, limit);

      setSearchTitles(titles);
      onSearchTitlesLoaded(titles);
      if (!titles.length) {
        setSearchLoadError("La recherche de test n'a retourne aucun titre exploitable.");
      }
    } catch (error) {
      setSearchTitles([]);
      onSearchTitlesLoaded([]);
      setSearchLoadError(error instanceof Error ? error.message : "Impossible de charger les exemples.");
    } finally {
      setLoadingSearchTitles(false);
    }
  };

  return (
    <>
      <div className="title-analysis-test-grid">
        <label>
          <span>Titres manuels</span>
          <textarea
            value={manualTitlesText}
            onChange={(event) => onManualTitlesTextChange(event.target.value)}
            disabled={disabled}
            rows={6}
          />
        </label>

        <div className="title-analysis-search-tests">
          <label>
            <span>Requete de recherche test</span>
            <input
              type="text"
              value={config.searchTestQuery ?? ""}
              onChange={(event) => updateConfig({ searchTestQuery: event.target.value })}
              placeholder={searchConfig?.testQuery || "Requete du module Recherche"}
              disabled={disabled || !canLoadSearchTitles}
            />
          </label>

          <label>
            <span>Nombre de titres</span>
            <input
              type="number"
              min={1}
              max={100}
              value={config.searchTestLimit ?? 20}
              onChange={(event) => updateConfig({ searchTestLimit: Number(event.target.value) })}
              disabled={disabled || !canLoadSearchTitles}
            />
          </label>

          <button
            type="button"
            className="secondary"
            onClick={() => void handleLoadSearchTitles()}
            disabled={disabled || loadingSearchTitles || !canLoadSearchTitles}
          >
            {loadingSearchTitles ? "Chargement..." : "Charger depuis Recherche"}
          </button>

          {searchTitles.length ? (
            <div className="scraper-config-preview">
              <span>Exemples charges</span>
              <strong>{searchTitles.length} titre(s)</strong>
            </div>
          ) : null}

          {searchLoadError ? (
            <div className="scraper-validation-result__message is-warning">
              {searchLoadError}
            </div>
          ) : null}
        </div>
      </div>

      {results.length ? (
        <div className="title-analysis-results">
          <div className="title-analysis-results__header">
            <strong>Resultats de test</strong>
            <span>{results.length}</span>
          </div>

          <div className="title-analysis-results__table">
            <div className="title-analysis-results__row title-analysis-results__row--head">
              <span>Titre brut</span>
              <span>Variante</span>
              <span>Titre recherche</span>
              <span>Titres alternatifs</span>
              <span>Auteurs</span>
              <span>Cercle</span>
              <span>Parodie</span>
              <span>Langue</span>
              <span>Tags</span>
              <span>Chapitre/tome</span>
              <span>Non reconnu</span>
            </div>
            {results.map((result, index) => (
              <div
                key={`${result.rawTitle}-${index}`}
                className={[
                  "title-analysis-results__row",
                  result.matched ? "is-matched" : "is-unmatched",
                ].join(" ")}
              >
                <span>{result.rawTitle}</span>
                <span>{result.variantName ?? "Aucune"}</span>
                <span>{result.title || "-"}</span>
                <span>{formatList(result.alternativeTitles)}</span>
                <span>{formatList(result.authors)}</span>
                <span>{result.circle || "-"}</span>
                <span>{result.parody || "-"}</span>
                <span>{result.languageLabel || result.languageCode || "-"}</span>
                <span>{formatList(result.suffixTags)}</span>
                <span>{formatSequence(result)}</span>
                <span>{formatList(result.unmatchedParts)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="scraper-config-placeholder">
          Aucun exemple a tester pour le moment.
        </div>
      )}
    </>
  );
}
