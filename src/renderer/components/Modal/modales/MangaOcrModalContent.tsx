import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Manga } from '@/renderer/types';
import './OcrModalContent.scss';

type Props = {
  manga: Manga;
};

const formatDetectionStatus = (status?: string | null) => {
  switch (status) {
    case 'likely_japanese':
      return 'Japonais probable';
    case 'likely_non_japanese':
      return 'Non japonais probable';
    case 'uncertain':
      return 'Detection incertaine';
    default:
      return 'Non lancee';
  }
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

const MangaOcrModalContent: React.FC<Props> = ({ manga }) => {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [confirmation, setConfirmation] = useState<any>(null);

  const loadStatus = useCallback(async () => {
    if (!window.api || typeof window.api.ocrGetMangaStatus !== 'function') {
      return;
    }

    try {
      const nextStatus = await window.api.ocrGetMangaStatus(manga.id);
      setStatus(nextStatus);
      setError(null);
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible de charger le statut OCR'));
    } finally {
      setLoading(false);
    }
  }, [manga.id]);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const startMangaOcr = useCallback(async (overwrite: boolean, confirmLanguage: boolean = false) => {
    if (!window.api || typeof window.api.ocrStartManga !== 'function') {
      setError('API OCR indisponible');
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const result = await window.api.ocrStartManga(manga.id, {
        overwrite,
        confirmLanguage,
      });
      if (result?.requiresConfirmation) {
        setConfirmation(result);
      } else {
        setConfirmation(null);
        await loadStatus();
        try {
          window.dispatchEvent(new CustomEvent('mangas-updated'));
        } catch {
          // noop
        }
      }
    } catch (err: any) {
      setError(String(err?.message || err || 'Impossible de lancer l\'OCR'));
    } finally {
      setStarting(false);
    }
  }, [loadStatus, manga.id]);

  const progressLabel = useMemo(() => {
    if (!status?.progress) {
      return '0/0';
    }
    return `${status.progress.completedPages || 0}/${status.progress.totalPages || 0}`;
  }, [status]);

  const activeJob = status?.activeJob;

  return (
    <div className="ocr-modal-content">
      {loading ? <div>Chargement du statut OCR...</div> : null}
      {error ? <div>{error}</div> : null}

      {!loading && status ? (
        <>
          <div className="ocr-status-card">
            <div className="ocr-status-grid">
              <div className="ocr-status-item">
                <strong>Fichier OCR</strong>
                <span>{status.exists ? 'Present' : 'Absent'}</span>
              </div>
              <div className="ocr-status-item">
                <strong>Progression</strong>
                <span>{progressLabel}</span>
              </div>
              <div className="ocr-status-item">
                <strong>Langue detectee</strong>
                <span>{formatDetectionStatus(status.languageDetection?.status)}</span>
              </div>
              <div className="ocr-status-item">
                <strong>Job actif</strong>
                <span>{activeJob ? formatJobStatus(activeJob.status) : 'Aucun'}</span>
              </div>
            </div>
          </div>

          {confirmation ? (
            <div className="ocr-status-card">
              <div>
                {confirmation.reason === 'likely-non-japanese'
                  ? 'Le manga ne semble pas japonais. Lancer quand meme l\'OCR japonais ?'
                  : 'La langue est incertaine. Tu peux verifier quelques pages avant de lancer quand meme.'}
              </div>
              <div className="ocr-confirm-samples">
                {(confirmation?.detection?.sampleDetails || []).map((sample: any) => (
                  <div key={`${sample.pageIndex}-${sample.imagePath}`} className="ocr-confirm-sample">
                    <img src={sample.localUrl} alt={`Page ${sample.pageIndex + 1}`} />
                    <small>Page {sample.pageIndex + 1}</small>
                    <div>{sample.previewText || 'Pas assez de texte detecte'}</div>
                  </div>
                ))}
              </div>
              <div className="ocr-modal-actions-row">
                <button
                  type="button"
                  onClick={() => {
                    void startMangaOcr(!!confirmation?.status?.exists, true);
                  }}
                  disabled={starting}
                >
                  Lancer quand meme
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmation(null)}
                  disabled={starting}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          <div className="ocr-modal-actions-row">
            <button
              type="button"
              onClick={() => {
                void startMangaOcr(false);
              }}
              disabled={starting}
            >
              {status.exists ? 'Reprendre' : 'Lancer l\'OCR'}
            </button>
            <button
              type="button"
              onClick={() => {
                void startMangaOcr(true);
              }}
              disabled={starting}
            >
              Relancer en ecrasant
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                void loadStatus();
              }}
              disabled={starting}
            >
              Actualiser
            </button>
          </div>

          {activeJob ? (
            <div className="ocr-result-summary">
              Job actif: {formatJobStatus(activeJob.status)}
              {typeof activeJob.currentPage === 'number' ? `, page ${activeJob.currentPage}` : ''}
              {activeJob.message ? `, ${activeJob.message}` : ''}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default MangaOcrModalContent;
