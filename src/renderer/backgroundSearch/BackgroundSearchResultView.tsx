import React from "react";
import type {
  BackgroundSearchJobMetadata,
  BackgroundSearchKind,
  ListingBackgroundInput,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import type { ScraperAuthorWorkspaceTarget } from "@/renderer/types/workspace";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import MultiSearchBrowser from "@/renderer/components/MultiSearch/MultiSearchBrowser";
import MangaCorrespondenceView from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceView";
import AuthorCorrespondenceView from "@/renderer/components/AuthorCorrespondence/AuthorCorrespondenceView";
import ScraperAuthorFavoritesView from "@/renderer/components/ScraperAuthorFavorites/ScraperAuthorFavoritesView";
import ScraperBrowser from "@/renderer/components/ScraperBrowser/ScraperBrowser";
import ScraperLatestView from "@/renderer/components/ScraperLatest/ScraperLatestView";
import "./resultView.scss";

type Props = {
  backgroundSearchJobId?: string;
  onOpenAuthorTarget?: (target: ScraperAuthorWorkspaceTarget) => void;
  scrapers: ScraperRecord[];
};

const KIND_LABELS: Record<BackgroundSearchKind, string> = {
  multiSearch: "Recherche multi-sources",
  mangaCorrespondence: "Recherche de correspondances",
  authorCorrespondence: "Correspondances auteur",
  scraperAuthor: "Recherche d’auteur",
  latestSources: "Nouveautés des sources",
  latestAuthors: "Nouveautés des auteurs favoris",
  authorFavoriteRefresh: "Mise à jour d’un auteur favori",
};

const STATUS_LABELS: Record<BackgroundSearchJobMetadata["status"], string> = {
  queued: "En attente",
  running: "En cours",
  completed: "Terminée",
  error: "En erreur",
  cancelled: "Arrêtée",
  interrupted: "Interrompue",
  expired: "Expirée",
};

const getProgressValue = (metadata: BackgroundSearchJobMetadata): string => {
  const completed = Math.max(0, metadata.progress.completedUnits);
  const total = metadata.progress.totalUnits;
  if (typeof total === "number" && total > 0) return `${completed}/${total}`;
  return String(completed);
};

const getProgressDescription = (metadata: BackgroundSearchJobMetadata): string => {
  const unitLabel = metadata.kind === "mangaCorrespondence"
    ? "recherches exécutées"
    : "étapes exécutées";
  return metadata.progress.currentLabel
    ? `${unitLabel} · ${metadata.progress.currentLabel}`
    : unitLabel;
};

export default function BackgroundSearchResultView({
  backgroundSearchJobId,
  onOpenAuthorTarget,
  scrapers,
}: Props) {
  const { job, loading, error, cancel } = useBackgroundSearchJob(backgroundSearchJobId);

  if (loading) return <div className="app-route-loading" aria-label="Chargement de la recherche" aria-busy="true" />;
  if (error || !job) return <div className="empty">{error || "Recherche en arrière-plan introuvable."}</div>;

  const metadata = job.metadata;
  const active = metadata.status === "queued" || metadata.status === "running";
  const listingInput = job.input as ListingBackgroundInput;
  const sourceScraper = listingInput.sources?.[0]?.scraper;
  const scraper = scrapers.find((candidate) => candidate.id === sourceScraper?.id) ?? sourceScraper;
  const storageLabel = metadata.storageMode === "temporaryFile" ? "Fichier temporaire" : "Cache mémoire";

  const renderResult = () => {
    if (metadata.kind === "multiSearch") {
      return <MultiSearchBrowser scrapers={scrapers} backgroundSearchJobId={metadata.id} resultOnly />;
    }
    if (metadata.kind === "mangaCorrespondence") {
      return <MangaCorrespondenceView backgroundSearchJobId={metadata.id} resultOnly />;
    }
    if (metadata.kind === "authorCorrespondence") {
      return (
        <AuthorCorrespondenceView
          backgroundSearchJobId={metadata.id}
          onOpenAuthorTarget={onOpenAuthorTarget}
          resultOnly
        />
      );
    }
    if (metadata.kind === "latestSources" || metadata.kind === "latestAuthors") {
      return <ScraperLatestView scrapers={scrapers} backgroundSearchJobId={metadata.id} resultOnly />;
    }
    if (metadata.kind === "authorFavoriteRefresh") {
      return <ScraperAuthorFavoritesView scrapers={scrapers} backgroundSearchJobId={metadata.id} resultOnly />;
    }
    if (metadata.kind === "scraperAuthor" && scraper) {
      return (
        <ScraperBrowser
          scraper={scraper}
          backgroundSearchJobId={metadata.id}
          routeSyncEnabled={false}
          resultOnly
        />
      );
    }
    return <div className="empty">Le type de cette recherche ne peut pas encore être affiché.</div>;
  };

  return (
    <section className="background-search-result-view">
      <header className="background-search-result-view__header">
        <div className="background-search-result-view__title">
          <span>Résultat enregistré</span>
          <h2>{metadata.title}</h2>
          <p>{KIND_LABELS[metadata.kind]} · terme principal : {metadata.primaryTerm || "—"}</p>
        </div>
        <div className="background-search-result-view__status">
          <span className={`is-${metadata.status}`}>{STATUS_LABELS[metadata.status]}</span>
          {active ? (
            <button type="button" onClick={() => void cancel()}>Arrêter</button>
          ) : null}
        </div>
      </header>

      <div className="background-search-result-view__facts" aria-label="Résumé de la recherche">
        <div><strong>{metadata.progress.resultCount}</strong><span>résultat(s) conservé(s)</span></div>
        {(metadata.progress.excludedResultCount ?? 0) > 0 ? (
          <div><strong>{metadata.progress.excludedResultCount}</strong><span>ignoré(s) par blacklist</span></div>
        ) : null}
        <div><strong>{getProgressValue(metadata)}</strong><span>{getProgressDescription(metadata)}</span></div>
        <div><strong>{storageLabel}</strong><span>Stockage du résultat</span></div>
      </div>

      {metadata.error ? <div className="multi-search__message is-error">{metadata.error}</div> : null}
      <div className="background-search-result-view__content">{renderResult()}</div>
    </section>
  );
}
