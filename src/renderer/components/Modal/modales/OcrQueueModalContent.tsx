import React, { useCallback, useEffect, useState } from 'react';
import './OcrModalContent.scss';

type Props = {
  selectedMangaIds: string[];
  filteredMangaIds: string[];
};

const formatJobStatus = (status?: string | null) => {
  switch (status) {
    case 'queued':
      return 'En attente';
    case 'detecting_language':
      return 'Detection langue';
    case 'running':
      return 'En cours';
    case 'paused':
      return 'En pause';
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

const OcrQueueModalContent: React.FC<Props> = ({ selectedMangaIds, filteredMangaIds }) => {
  const [queue, setQueue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choiceScope, setChoiceScope] = useState<'library' | 'selection' | 'filtered' | null>(null);
  const [lastLibraryResult, setLastLibraryResult] = useState<any>(null);

  const loadQueue = useCallback(async () => {
    if (!window.api || typeof window.api.ocrQueueStatus !== 'function') {
      return;
    }

    try {
      const nextQueue = await window.api.ocrQueueStatus();
      setQueue(nextQueue);
      setError(null);
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible de charger la file OCR'));
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

  const startLibrary = useCallback(async (
    mode: 'missing_only' | 'overwrite_all',
    scope: 'library' | 'selection' | 'filtered'
  ) => {
    if (!window.api || typeof window.api.ocrStartLibrary !== 'function') {
      setError('API OCR indisponible');
      return;
    }

    try {
      const mangaIds = scope === 'selection'
        ? selectedMangaIds
        : scope === 'filtered'
          ? filteredMangaIds
          : undefined;
      const result = await window.api.ocrStartLibrary({ mode, mangaIds });
      setLastLibraryResult(result);
      setChoiceScope(null);
      await loadQueue();
      try {
        window.dispatchEvent(new CustomEvent('mangas-updated'));
      } catch {
        // noop
      }
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible de lancer l\'OCR de la bibliotheque'));
    }
  }, [filteredMangaIds, loadQueue, selectedMangaIds]);

  const runJobAction = useCallback(async (action: 'pause' | 'resume' | 'cancel', jobId: string) => {
    const apiName = action === 'pause'
      ? 'ocrPauseJob'
      : action === 'resume'
        ? 'ocrResumeJob'
        : 'ocrCancelJob';
    const api = window.api?.[apiName];
    if (typeof api !== 'function') {
      return;
    }

    try {
      await api(jobId);
      await loadQueue();
    } catch (err: any) {
      setError(String(err?.message || err || 'Action OCR impossible'));
    }
  }, [loadQueue]);

  const cancelAllJobs = useCallback(async () => {
    if (!window.api) {
      setError('API OCR indisponible');
      return;
    }

    const activeJobs = (queue?.jobs || []).filter((job: any) => !['completed', 'cancelled', 'error'].includes(job.status));
    if (activeJobs.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Annuler ${activeJobs.length} job(s) OCR encore actifs ?`);
    if (!confirmed) {
      return;
    }

    try {
      setQueue((prev: any) => ({
        ...(prev || {}),
        jobs: (prev?.jobs || []).map((job: any) => (
          ['completed', 'cancelled', 'error'].includes(job.status)
            ? job
            : {
              ...job,
              status: 'cancelled',
              message: 'Annulation demandee',
            }
        )),
      }));

      if (typeof window.api.ocrCancelJob === 'function') {
        for (const job of activeJobs) {
          await window.api.ocrCancelJob(job.id);
        }
      } else if (typeof window.api.ocrCancelAllJobs === 'function') {
        const result = await window.api.ocrCancelAllJobs();
        if (result?.status) {
          setQueue(result.status);
        }
      } else {
        throw new Error('API OCR indisponible');
      }

      await loadQueue();
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible d\'annuler toute la file OCR'));
    }
  }, [loadQueue, queue?.jobs]);

  const activeJobCount = (queue?.jobs || []).filter((job: any) => !['completed', 'cancelled', 'error'].includes(job.status)).length;

  return (
    <div className="ocr-modal-content ocr-queue-modal-content">
      <div className="ocr-queue-top">
        {loading ? <div>Chargement de la file OCR...</div> : null}
        {error ? <div>{error}</div> : null}

        <div className="ocr-queue-actions">
          <button type="button" onClick={() => setChoiceScope((value) => value === 'library' ? null : 'library')}>
            OCR toute la bibliotheque
          </button>
          <button
            type="button"
            onClick={() => setChoiceScope((value) => value === 'selection' ? null : 'selection')}
            disabled={selectedMangaIds.length === 0}
          >
            OCR selection ({selectedMangaIds.length})
          </button>
          <button
            type="button"
            onClick={() => setChoiceScope((value) => value === 'filtered' ? null : 'filtered')}
            disabled={filteredMangaIds.length === 0}
          >
            OCR mangas affiches ({filteredMangaIds.length})
          </button>
          <button type="button" className="secondary" onClick={() => { void loadQueue(); }}>
            Actualiser
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => { void cancelAllJobs(); }}
            disabled={activeJobCount === 0}
          >
            Tout annuler ({activeJobCount})
          </button>
        </div>

        {choiceScope ? (
          <div className="ocr-library-choice">
            <div>
              {choiceScope === 'library'
                ? 'Choisis comment lancer l\'OCR sur toute la bibliotheque.'
                : choiceScope === 'selection'
                  ? 'Choisis comment lancer l\'OCR sur la selection courante.'
                  : 'Choisis comment lancer l\'OCR sur les mangas actuellement affiches par les filtres.'}
            </div>
            <div className="ocr-queue-actions">
              <button type="button" onClick={() => { void startLibrary('missing_only', choiceScope); }}>
                Seulement sans OCR
              </button>
              <button type="button" onClick={() => { void startLibrary('overwrite_all', choiceScope); }}>
                Refaire en ecrasant
              </button>
              <button type="button" className="secondary" onClick={() => setChoiceScope(null)}>
                Annuler
              </button>
            </div>
          </div>
        ) : null}

        {lastLibraryResult ? (
          <div className="ocr-result-summary">
            {lastLibraryResult.scope === 'subset'
              ? `${lastLibraryResult.requestedCount || 0} manga(s) cibles. `
              : ''}
            {lastLibraryResult.queuedCount || 0} manga(s) ajoutes a la file.
            {(lastLibraryResult.skippedExisting || []).length > 0 ? ` ${lastLibraryResult.skippedExisting.length} deja OCRises ignores.` : ''}
            {(lastLibraryResult.skippedNonJapanese || []).length > 0 ? ` ${lastLibraryResult.skippedNonJapanese.length} non japonais ignores.` : ''}
            {(lastLibraryResult.uncertain || []).length > 0 ? ` ${lastLibraryResult.uncertain.length} incertains ignores.` : ''}
          </div>
        ) : null}
      </div>

      <div className="ocr-queue-list">
        {(queue?.jobs || []).length === 0 ? (
          <div className="ocr-status-card">Aucun job OCR dans la file.</div>
        ) : (
          (queue.jobs || []).map((job: any) => (
            <div key={job.id} className="ocr-queue-job">
              <div className="ocr-queue-job-header">
                <h4>{job.mangaTitle}</h4>
                <span className={`ocr-job-badge ${job.status}`}>{formatJobStatus(job.status)}</span>
              </div>
              <div className="ocr-job-meta">
                <div>Mode: {job.mode === 'full_manga' ? 'Manga complet' : 'A la volee'}</div>
                <div>Progression: {job.completedPages || 0}/{job.totalPages || 0}</div>
                {typeof job.currentPage === 'number' ? <div>Page en cours: {job.currentPage}</div> : null}
                {job.languageDetection?.status ? <div>Langue: {job.languageDetection.status}</div> : null}
                {job.message ? <div>Info: {job.message}</div> : null}
              </div>
              <div className="ocr-queue-actions">
                {job.status === 'running' ? (
                  <button type="button" className="secondary" onClick={() => { void runJobAction('pause', job.id); }}>
                    Pause
                  </button>
                ) : null}
                {job.status === 'paused' ? (
                  <button type="button" onClick={() => { void runJobAction('resume', job.id); }}>
                    Reprendre
                  </button>
                ) : null}
                {!['completed', 'cancelled'].includes(job.status) ? (
                  <button type="button" className="secondary" onClick={() => { void runJobAction('cancel', job.id); }}>
                    Annuler
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default OcrQueueModalContent;
