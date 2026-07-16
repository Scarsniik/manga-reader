import React, { useCallback, useEffect, useMemo, useState } from 'react';
import buildConfirmActionModal from '@/renderer/components/Modal/modales/ConfirmActionModal';
import {
  CloseXIcon,
  DownloadArrowIcon,
  FolderExternalLinkIcon,
  LoadingSpinnerIcon,
  OpenBookIcon,
} from '@/renderer/components/icons';
import { useModal } from '@/renderer/hooks/useModal';
import {
  ScraperDownloadJob,
  ScraperDownloadQueueStatus,
} from '@/shared/scraper';
import './OcrModalContent.scss';
import './ScraperDownloadQueueModalContent.scss';
import './ScraperDownloadQueueActivity.scss';

const EMPTY_COUNTS = {
  total: 0,
  active: 0,
  queued: 0,
  running: 0,
  completed: 0,
  error: 0,
  cancelled: 0,
};

const EMPTY_QUEUE: ScraperDownloadQueueStatus = {
  jobs: [],
  counts: EMPTY_COUNTS,
};

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'error']);

const formatJobStatus = (status?: string | null) => {
  switch (status) {
    case 'queued':
      return 'En attente';
    case 'running':
      return 'En cours';
    case 'completed':
      return 'Termine';
    case 'error':
      return 'Erreur';
    case 'cancelled':
      return 'Annule';
    default:
      return 'Inconnu';
  }
};

const formatJobMode = (job: ScraperDownloadJob) => (
  job.mode === 'chapter' ? 'Chapitre' : 'Manga complet'
);

const getProgressPercent = (job: ScraperDownloadJob) => {
  if (!job.totalPages) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((job.downloadedPages / job.totalPages) * 100)));
};

const DownloadQueueJobCard: React.FC<{
  job: ScraperDownloadJob;
  onCancel: (jobId: string) => void;
}> = ({ job, onCancel }) => {
  const progressPercent = getProgressPercent(job);
  const canCancel = !TERMINAL_STATUSES.has(job.status);

  return (
    <article className={`download-queue-card status-${job.status}`}>
      <div className="download-queue-card__header">
        <div className="download-queue-card__title">
          <span aria-hidden="true"><OpenBookIcon /></span>
          <div>
            <h4>{job.title}</h4>
            <small>{formatJobMode(job)}{job.scraperName ? ` · ${job.scraperName}` : ''}</small>
          </div>
        </div>
        <span className={`download-queue-badge ${job.status}`}>{formatJobStatus(job.status)}</span>
      </div>

      <div className="download-queue-progress-row">
        <div className="download-queue-progress" aria-label={`Progression ${progressPercent}%`}>
          <span
            className={`download-queue-progress__bar ${job.status}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <strong>{progressPercent}%</strong>
      </div>

      <div className="download-queue-card__meta">
        <span>{job.downloadedPages || 0}/{job.totalPages || 0} pages</span>
        {job.chapterLabel ? <span>{job.chapterLabel}</span> : null}
        {typeof job.currentPage === 'number' ? <span>Page {job.currentPage}</span> : null}
        {job.message ? <span>{job.message}</span> : null}
      </div>

      {job.folderPath ? (
        <div className="download-queue-card__path" title={job.folderPath}>
          <FolderExternalLinkIcon aria-hidden="true" /> <span>{job.folderPath}</span>
        </div>
      ) : null}
      {job.error ? <div className="download-queue-card__error">{job.error}</div> : null}

      {canCancel ? (
        <button type="button" className="download-queue-card__cancel" onClick={() => onCancel(job.id)}>
          <CloseXIcon aria-hidden="true" /> Annuler
        </button>
      ) : null}
    </article>
  );
};

const ScraperDownloadQueueModalContent: React.FC = () => {
  const { openModal } = useModal();
  const [queue, setQueue] = useState<ScraperDownloadQueueStatus>(EMPTY_QUEUE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!window.api || typeof window.api.getScraperDownloadQueueStatus !== 'function') {
      setLoading(false);
      setError('API de telechargement indisponible');
      return;
    }

    try {
      const nextQueue = await window.api.getScraperDownloadQueueStatus();
      setQueue(nextQueue || EMPTY_QUEUE);
      setError(null);
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible de charger la file de telechargements'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => {
      void loadQueue();
    }, 1200);

    return () => window.clearInterval(timer);
  }, [loadQueue]);

  const handleCancelJob = useCallback(async (jobId: string) => {
    if (!window.api || typeof window.api.cancelScraperDownloadJob !== 'function') {
      setError('API de telechargement indisponible');
      return;
    }

    try {
      await window.api.cancelScraperDownloadJob(jobId);
      await loadQueue();
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible d\'annuler ce telechargement'));
    }
  }, [loadQueue]);

  const cancelAllActiveJobs = useCallback(async () => {
    try {
      await window.api.cancelAllScraperDownloadJobs();
      await loadQueue();
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible d\'annuler la file de telechargements'));
    }
  }, [loadQueue]);

  const handleCancelAll = useCallback(() => {
    if (!window.api || typeof window.api.cancelAllScraperDownloadJobs !== 'function') {
      setError('API de telechargement indisponible');
      return;
    }

    if ((queue.counts?.active || 0) <= 0) {
      return;
    }

    openModal(buildConfirmActionModal({
      title: 'Annuler les telechargements',
      message: `Annuler ${queue.counts.active} telechargement(s) actif(s) ?`,
      details: 'Les telechargements en cours et en attente recevront une demande d\'annulation.',
      confirmLabel: 'Tout annuler',
      confirmVariant: 'danger',
      onConfirm: () => {
        void cancelAllActiveJobs();
      },
    }));
  }, [cancelAllActiveJobs, openModal, queue.counts?.active]);

  const summaryItems = useMemo(() => ([
    { label: 'Actifs', value: queue.counts?.active || 0 },
    { label: 'En attente', value: queue.counts?.queued || 0 },
    { label: 'Termines', value: queue.counts?.completed || 0 },
    { label: 'Erreurs', value: queue.counts?.error || 0 },
  ]), [queue.counts]);

  return (
    <div className="download-queue-modal-content">
      <div className="download-queue-top">
        <div className="download-queue-overview">
          <div className="download-queue-overview__copy">
            <span>File de telechargement</span>
            <h3>
              {queue.counts.active > 0
                ? `${queue.counts.active} telechargement${queue.counts.active > 1 ? 's' : ''} actif${queue.counts.active > 1 ? 's' : ''}`
                : 'Aucun telechargement actif'}
            </h3>
            <p>Les nouveaux telechargements demarrent automatiquement et apparaissent ici.</p>
          </div>
          <div className="download-queue-controls">
            <button type="button" onClick={() => { void loadQueue(); }}>
              {loading ? <LoadingSpinnerIcon className="is-spinning" aria-hidden="true" /> : null}
              Actualiser
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => { void handleCancelAll(); }}
              disabled={(queue.counts?.active || 0) === 0}
            >
              <CloseXIcon aria-hidden="true" /> Tout annuler
              {queue.counts.active > 0 ? <span>{queue.counts.active}</span> : null}
            </button>
          </div>
        </div>

        <div className="download-queue-summary" aria-label="Resume des telechargements">
          {summaryItems.map((item) => (
            <div key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {loading && queue.jobs.length === 0 ? (
          <div className="download-queue-feedback"><LoadingSpinnerIcon className="is-spinning" aria-hidden="true" /> Chargement de la file...</div>
        ) : null}
        {error ? <div className="download-queue-feedback is-error">{error}</div> : null}
      </div>

      <section className="download-queue-activity">
        <div className="download-queue-activity__heading">
          <div>
            <h3>Activite recente</h3>
            <span>{queue.jobs.length} telechargement{queue.jobs.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="download-queue-list">
        {queue.jobs.length === 0 ? (
          <div className="download-queue-empty">
            <span><DownloadArrowIcon aria-hidden="true" /></span>
            <strong>Aucun telechargement pour le moment</strong>
            <p>Les mangas et chapitres ajoutes a la file apparaitront ici.</p>
          </div>
        ) : (
          queue.jobs.map((job) => (
            <DownloadQueueJobCard
              key={job.id}
              job={job}
              onCancel={(jobId) => { void handleCancelJob(jobId); }}
            />
          ))
        )}
        </div>
      </section>
    </div>
  );
};

export default ScraperDownloadQueueModalContent;
