import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScraperDownloadJob,
  ScraperDownloadQueueStatus,
} from '@/shared/scraper';
import './OcrModalContent.scss';

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
    <div className="ocr-queue-job download-queue-job">
      <div className="ocr-queue-job-header">
        <h4>{job.title}</h4>
        <span className={`ocr-job-badge ${job.status}`}>{formatJobStatus(job.status)}</span>
      </div>

      <div className="ocr-job-meta">
        <div>Type: {formatJobMode(job)}</div>
        {job.scraperName ? <div>Scraper: {job.scraperName}</div> : null}
        {job.chapterLabel ? <div>Chapitre: {job.chapterLabel}</div> : null}
        <div>Progression: {job.downloadedPages || 0}/{job.totalPages || 0}</div>
        {typeof job.currentPage === 'number' ? <div>Page en cours: {job.currentPage}</div> : null}
        {job.folderPath ? <div>Dossier: {job.folderPath}</div> : null}
        {job.message ? <div>Info: {job.message}</div> : null}
        {job.error ? <div className="download-queue-job-error">Erreur: {job.error}</div> : null}
      </div>

      <div className="download-queue-progress" aria-hidden="true">
        <span
          className={`download-queue-progress__bar ${job.status}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="download-queue-progress-label">
        {progressPercent}% termine
      </div>

      <div className="ocr-queue-actions">
        {canCancel ? (
          <button
            type="button"
            className="secondary"
            onClick={() => onCancel(job.id)}
          >
            Annuler
          </button>
        ) : null}
      </div>
    </div>
  );
};

const ScraperDownloadQueueModalContent: React.FC = () => {
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

  const handleCancelAll = useCallback(async () => {
    if (!window.api || typeof window.api.cancelAllScraperDownloadJobs !== 'function') {
      setError('API de telechargement indisponible');
      return;
    }

    if ((queue.counts?.active || 0) <= 0) {
      return;
    }

    const confirmed = window.confirm(`Annuler ${queue.counts.active} telechargement(s) actif(s) ?`);
    if (!confirmed) {
      return;
    }

    try {
      await window.api.cancelAllScraperDownloadJobs();
      await loadQueue();
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible d\'annuler la file de telechargements'));
    }
  }, [loadQueue, queue.counts?.active]);

  const summaryItems = useMemo(() => ([
    { label: 'Actifs', value: queue.counts?.active || 0 },
    { label: 'En attente', value: queue.counts?.queued || 0 },
    { label: 'En cours', value: queue.counts?.running || 0 },
    { label: 'Termines', value: queue.counts?.completed || 0 },
    { label: 'Erreurs', value: queue.counts?.error || 0 },
    { label: 'Annules', value: queue.counts?.cancelled || 0 },
  ]), [queue.counts]);

  return (
    <div className="ocr-modal-content download-queue-modal-content">
      <div className="download-queue-top">
        {loading ? <div>Chargement de la file de telechargements...</div> : null}
        {error ? <div className="ocr-feedback">{error}</div> : null}

        <div className="ocr-status-grid download-queue-summary-grid">
          {summaryItems.map((item) => (
            <div key={item.label} className="ocr-status-card download-queue-summary-card">
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="ocr-queue-actions">
          <button type="button" className="secondary" onClick={() => { void loadQueue(); }}>
            Actualiser
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => { void handleCancelAll(); }}
            disabled={(queue.counts?.active || 0) === 0}
          >
            Tout annuler ({queue.counts?.active || 0})
          </button>
        </div>
      </div>

      <div className="ocr-queue-list">
        {queue.jobs.length === 0 ? (
          <div className="ocr-status-card">Aucun telechargement dans la file.</div>
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
    </div>
  );
};

export default ScraperDownloadQueueModalContent;
