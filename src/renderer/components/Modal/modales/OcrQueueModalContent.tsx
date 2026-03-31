import React, { useCallback, useEffect, useState } from 'react';
import './OcrModalContent.scss';

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

const OcrQueueModalContent: React.FC = () => {
  const [queue, setQueue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryChoiceOpen, setLibraryChoiceOpen] = useState(false);
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

  const startLibrary = useCallback(async (mode: 'missing_only' | 'overwrite_all') => {
    if (!window.api || typeof window.api.ocrStartLibrary !== 'function') {
      setError('API OCR indisponible');
      return;
    }

    try {
      const result = await window.api.ocrStartLibrary({ mode });
      setLastLibraryResult(result);
      setLibraryChoiceOpen(false);
      await loadQueue();
      try {
        window.dispatchEvent(new CustomEvent('mangas-updated'));
      } catch {
        // noop
      }
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible de lancer l\'OCR de la bibliotheque'));
    }
  }, [loadQueue]);

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

  return (
    <div className="ocr-modal-content">
      {loading ? <div>Chargement de la file OCR...</div> : null}
      {error ? <div>{error}</div> : null}

      <div className="ocr-queue-actions">
        <button type="button" onClick={() => setLibraryChoiceOpen((value) => !value)}>
          OCR toute la bibliotheque
        </button>
        <button type="button" className="secondary" onClick={() => { void loadQueue(); }}>
          Actualiser
        </button>
      </div>

      {libraryChoiceOpen ? (
        <div className="ocr-library-choice">
          <div>Choisis comment lancer l'OCR sur la bibliotheque.</div>
          <div className="ocr-queue-actions">
            <button type="button" onClick={() => { void startLibrary('missing_only'); }}>
              Seulement sans OCR
            </button>
            <button type="button" onClick={() => { void startLibrary('overwrite_all'); }}>
              Refaire en ecrasant
            </button>
            <button type="button" className="secondary" onClick={() => setLibraryChoiceOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {lastLibraryResult ? (
        <div className="ocr-result-summary">
          {lastLibraryResult.queuedCount || 0} manga(s) ajoutes a la file.
          {(lastLibraryResult.skippedExisting || []).length > 0 ? ` ${lastLibraryResult.skippedExisting.length} deja OCRises ignores.` : ''}
          {(lastLibraryResult.skippedNonJapanese || []).length > 0 ? ` ${lastLibraryResult.skippedNonJapanese.length} non japonais ignores.` : ''}
          {(lastLibraryResult.uncertain || []).length > 0 ? ` ${lastLibraryResult.uncertain.length} incertains ignores.` : ''}
        </div>
      ) : null}

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
