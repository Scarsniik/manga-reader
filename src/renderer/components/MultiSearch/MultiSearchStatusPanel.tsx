import React from "react";
import type { MultiSearchScraperRun } from "@/renderer/components/MultiSearch/types";

type Props = {
  runs: MultiSearchScraperRun[];
  query: string;
  isSearching: boolean;
  canLoadMore: boolean;
  onLoadMoreForAll: (query: string) => void;
  onLoadMoreForScraper: (scraperId: string, query: string) => void;
};

const getStatusLabel = (status: MultiSearchScraperRun["status"]): string => {
  const labels: Record<MultiSearchScraperRun["status"], string> = {
    idle: "Inactif",
    waiting: "En attente",
    loading: "En cours",
    success: "Charge",
    done: "Termine",
    error: "Erreur",
  };

  return labels[status];
};

const formatLoadedPagesLabel = (run: MultiSearchScraperRun): string => {
  if (run.searchTerms.length <= 1) {
    return `Page ${run.loadedPages || 0} chargee`;
  }

  return `${run.loadedPages || 0} page(s) chargee(s) sur ${run.searchTerms.length} terme(s)`;
};

export default function MultiSearchStatusPanel({
  runs,
  query,
  isSearching,
  canLoadMore,
  onLoadMoreForAll,
  onLoadMoreForScraper,
}: Props) {
  if (!runs.length) {
    return null;
  }

  return (
    <section className="multi-search__panel multi-search__statuses">
      <div className="multi-search__section-head">
        <div>
          <h3>Statut des scrappers</h3>
          <p>
            Resultats fusionnes a partir des pages actuellement chargees.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onLoadMoreForAll(query)}
          disabled={!canLoadMore || isSearching}
        >
          Charger plus
        </button>
      </div>

      <div className="multi-search__status-list">
        {runs.map((run) => (
          <div key={run.scraper.id} className={`multi-search__status is-${run.status}`}>
            <div>
              <strong>{run.scraper.name}</strong>
              <span>{getStatusLabel(run.status)}</span>
            </div>
            <div>
              <span>{run.results.length} resultat(s)</span>
              <span>{formatLoadedPagesLabel(run)}</span>
              <span>{run.hasNextPage ? "Page suivante disponible" : "Pas de page suivante connue"}</span>
              {run.currentPageUrl ? (
                <span className="multi-search__status-url">Adresse : {run.currentPageUrl}</span>
              ) : null}
            </div>
            {run.error ? <p>{run.error}</p> : null}
            <button
              type="button"
              onClick={() => onLoadMoreForScraper(run.scraper.id, query)}
              disabled={!run.hasNextPage || run.status === "loading"}
            >
              Charger plus pour ce scrapper
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
