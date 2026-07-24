import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchJobMetadata,
  BackgroundSearchQueueSummary,
} from "@/shared/backgroundSearch";
import {
  CloseXIcon,
  LoadingSpinnerIcon,
  MagnifyingGlassIcon,
  TrashCanIcon,
} from "@/renderer/components/icons";
import { useModal } from "@/renderer/hooks/useModal";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import {
  buildBackgroundSearchWorkspaceTarget,
  requestBackgroundSearchOpenInCurrentView,
} from "@/renderer/backgroundSearch/backgroundSearchNavigation";
import "./BackgroundSearchQueueModalContent.scss";

const EMPTY_QUEUE: BackgroundSearchQueueSummary = {
  jobs: [],
  counts: { total: 0, active: 0, queued: 0, running: 0, completed: 0, error: 0, cancelled: 0 },
};

const TERMINAL_STATUSES = new Set(["completed", "error", "cancelled", "interrupted", "expired"]);

const formatStatus = (status: string): string => ({
  queued: "En attente",
  running: "En cours",
  completed: "Terminée",
  error: "Erreur",
  cancelled: "Annulée",
  interrupted: "Interrompue",
  expired: "Expirée",
}[status] ?? "Inconnue");

const formatKind = (kind: string): string => ({
  multiSearch: "Multi-sources",
  mangaCorrespondence: "Correspondances manga",
  authorCorrespondence: "Correspondances auteur",
  scraperAuthor: "Auteur",
  latestSources: "Nouveautés · sources",
  latestAuthors: "Nouveautés · auteurs",
  authorFavoriteRefresh: "Mise à jour auteur favori",
}[kind] ?? kind);

const formatDate = (value: string): string => new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
}).format(new Date(value));

const formatResultCount = (job: BackgroundSearchJobMetadata): string => {
  const count = job.progress.resultCount;
  if (job.kind === "mangaCorrespondence" || job.kind === "authorCorrespondence") {
    return `${count} correspondance(s)`;
  }
  if (job.kind === "latestSources" && (job.progress.excludedResultCount ?? 0) > 0) {
    return `${count} résultat(s) hors blacklist`;
  }
  return `${count} résultat(s) avant fusion`;
};

const getProgressPercent = (job: BackgroundSearchJobMetadata): number | null => {
  if (!job.progress.totalUnits) return null;
  return Math.max(0, Math.min(100, Math.round(
    (job.progress.completedUnits / job.progress.totalUnits) * 100,
  )));
};

export default function BackgroundSearchQueueModalContent() {
  const { closeModal } = useModal();
  const [queue, setQueue] = React.useState<BackgroundSearchQueueSummary>(EMPTY_QUEUE);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadQueue = React.useCallback(async () => {
    try {
      const nextQueue = await window.api?.getBackgroundSearchQueue?.();
      setQueue(nextQueue ?? EMPTY_QUEUE);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les recherches.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadQueue();
    const unsubscribe = window.api?.onBackgroundSearchChanged?.((event: BackgroundSearchChangeEvent) => {
      if (event.status !== "running") {
        void loadQueue();
        return;
      }
      setQueue((current) => {
        const existing = current.jobs.find((job) => job.id === event.jobId);
        if (!existing) return current;
        const changedFromQueued = existing.status === "queued";
        return {
          ...current,
          jobs: current.jobs.map((job) => job.id === event.jobId ? {
            ...job,
            revision: event.revision,
            status: event.status,
            progress: event.progress,
          } : job),
          counts: changedFromQueued ? {
            ...current.counts,
            queued: Math.max(0, current.counts.queued - 1),
            running: current.counts.running + 1,
          } : current.counts,
        };
      });
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [loadQueue]);

  const loadJob = React.useCallback(async (jobId: string): Promise<BackgroundSearchJob | null> => {
    try {
      const job = await window.api?.getBackgroundSearchJob?.(jobId);
      if (!job?.input) throw new Error("Les paramètres de cette recherche ne sont plus disponibles.");
      return job;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible d'ouvrir cette recherche.");
      return null;
    }
  }, []);

  const openJob = React.useCallback(async (jobId: string, inWorkspace: boolean) => {
    const job = await loadJob(jobId);
    if (!job) return;
    if (inWorkspace) {
      await openWorkspaceTarget(buildBackgroundSearchWorkspaceTarget(job));
    } else {
      closeModal();
      requestBackgroundSearchOpenInCurrentView(job);
    }
    await window.api?.markBackgroundSearchOpened?.(jobId);
  }, [closeModal, loadJob]);

  const cancelJob = React.useCallback(async (jobId: string) => {
    await window.api?.cancelBackgroundSearch?.(jobId);
    await loadQueue();
  }, [loadQueue]);

  const deleteJob = React.useCallback(async (jobId: string) => {
    await window.api?.deleteBackgroundSearch?.(jobId);
    await loadQueue();
  }, [loadQueue]);

  const retryJob = React.useCallback(async (jobId: string) => {
    await window.api?.retryBackgroundSearch?.(jobId);
    await loadQueue();
  }, [loadQueue]);

  return (
    <div className="background-search-modal-content">
      <div className="background-search-overview">
        <div>
          <span>Recherches</span>
          <h3>{queue.counts.active ? `${queue.counts.active} recherche(s) active(s)` : "Aucune recherche active"}</h3>
          <p>Clic gauche pour reprendre dans l’espace actif, clic molette pour ouvrir un onglet.</p>
        </div>
        <button type="button" onClick={() => { void loadQueue(); }}>
          {loading ? <LoadingSpinnerIcon className="is-spinning" aria-hidden="true" /> : null} Actualiser
        </button>
      </div>

      <div className="background-search-summary">
        <div><strong>{queue.counts.running}</strong><span>En cours</span></div>
        <div><strong>{queue.counts.queued}</strong><span>En attente</span></div>
        <div><strong>{queue.counts.completed}</strong><span>Terminées</span></div>
        <div><strong>{queue.counts.error}</strong><span>Erreurs</span></div>
      </div>
      {error ? <div className="background-search-feedback is-error">{error}</div> : null}

      <div className="background-search-list">
        {!loading && queue.jobs.length === 0 ? (
          <div className="background-search-empty">
            <MagnifyingGlassIcon aria-hidden="true" />
            <strong>Aucune recherche pour le moment</strong>
            <p>Active « En arrière-plan » dans un écran de recherche puis lance-la.</p>
          </div>
        ) : queue.jobs.map((job) => {
          const progressPercent = getProgressPercent(job);
          const canCancel = !TERMINAL_STATUSES.has(job.status);
          const canDelete = TERMINAL_STATUSES.has(job.status);
          const isUnopened = job.openedAt === null;
          return (
            <article
              key={job.id}
              className={`background-search-card status-${job.status}${isUnopened ? " is-unopened" : ""}`}
            >
              <button
                type="button"
                className="background-search-card__open"
                aria-label={`Ouvrir ${job.primaryTerm}${isUnopened ? ", non consultée" : ""}`}
                data-prevent-middle-click-autoscroll="true"
                onClick={() => { void openJob(job.id, false); }}
                onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  void openJob(job.id, true);
                }}
              >
                <span className="background-search-card__icon">
                  <MagnifyingGlassIcon aria-hidden="true" />
                  {isUnopened ? <span className="background-search-card__unopened-dot" title="Non consultée" /> : null}
                </span>
                <span className="background-search-card__copy">
                  <strong>{job.primaryTerm}</strong>
                  <small>{formatKind(job.kind)} · {formatDate(job.createdAt)}</small>
                  <span className="background-search-card__meta">
                    <span>{formatResultCount(job)}</span>
                    {job.progress.currentLabel ? <span>{job.progress.currentLabel}</span> : null}
                    <span>{job.storageMode === "temporaryFile" ? "Fichier temporaire" : "Cache mémoire"}</span>
                  </span>
                </span>
                <span className={`background-search-badge ${job.status}`}>{formatStatus(job.status)}</span>
              </button>
              {progressPercent !== null && !TERMINAL_STATUSES.has(job.status) ? (
                <div className="background-search-progress"><span style={{ width: `${progressPercent}%` }} /></div>
              ) : null}
              {job.error ? <div className="background-search-feedback is-error">{job.error}</div> : null}
              <div className="background-search-card__actions">
                {canCancel ? (
                  <button type="button" onClick={() => { void cancelJob(job.id); }}><CloseXIcon /> Arrêter</button>
                ) : null}
                {job.status === "error" || job.status === "interrupted" || job.status === "expired" ? (
                  <button type="button" onClick={() => { void retryJob(job.id); }}>Relancer</button>
                ) : null}
                {canDelete ? (
                  <button type="button" className="danger" onClick={() => { void deleteJob(job.id); }}>
                    <TrashCanIcon /> Supprimer
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
