import React, { useCallback, useEffect, useState } from 'react';
import buildConfirmActionModal from '@/renderer/components/Modal/modales/ConfirmActionModal';
import OcrQueueJobCard from '@/renderer/components/Modal/modales/OcrQueueJobCard';
import {
  CloseXIcon,
  FilterRemoveIcon,
  LoadingSpinnerIcon,
  OpenBookIcon,
  SettingsIcon,
} from '@/renderer/components/icons';
import OcrScanIcon from '@/renderer/components/MangaManger/icons/ocr-scan.svg?react';
import SelectionIcon from '@/renderer/components/MangaManger/icons/selection.svg?react';
import { useModal } from '@/renderer/hooks/useModal';
import { notifyOcrRuntimeMissing, openOcrRuntimeStatus } from '@/renderer/utils/ocrRuntimeUi';
import './OcrModalContent.scss';
import './OcrQueueModalContent.scss';
import './OcrQueueActivity.scss';

type Props = {
  selectedMangaIds: string[];
  filteredMangaIds: string[];
};

const TERMINAL_JOB_STATUSES = ['completed', 'cancelled', 'error'];

const OcrQueueModalContent: React.FC<Props> = ({ selectedMangaIds, filteredMangaIds }) => {
  const { openModal } = useModal();
  const [queue, setQueue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choiceScope, setChoiceScope] = useState<'library' | 'selection' | 'filtered' | null>(null);
  const [heavyPass, setHeavyPass] = useState(false);
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
      const result = await window.api.ocrStartLibrary({
        mode,
        mangaIds,
        heavyPass,
      });
      setLastLibraryResult(result);
      setChoiceScope(null);
      await loadQueue();
      try {
        window.dispatchEvent(new CustomEvent('mangas-updated'));
      } catch {
        // noop
      }
    } catch (err: any) {
      if (notifyOcrRuntimeMissing(err, {
        title: "Installer l'OCR",
        message: "Installe le runtime OCR pour lancer l'OCR sur la bibliotheque.",
      })) {
        setError("Runtime OCR absent.");
        return;
      }

      setError(String(err?.message || err || 'Impossible de lancer l\'OCR de la bibliotheque'));
    }
  }, [filteredMangaIds, heavyPass, loadQueue, selectedMangaIds]);

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

  const cancelActiveJobs = useCallback(async (activeJobs: any[]) => {
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
  }, [loadQueue]);

  const cancelAllJobs = useCallback(() => {
    if (!window.api) {
      setError('API OCR indisponible');
      return;
    }

    const activeJobs = (queue?.jobs || []).filter((job: any) => !['completed', 'cancelled', 'error'].includes(job.status));
    if (activeJobs.length === 0) {
      return;
    }

    openModal(buildConfirmActionModal({
      title: 'Annuler les jobs OCR',
      message: `Annuler ${activeJobs.length} job(s) OCR encore actifs ?`,
      details: 'Les jobs en cours et en attente recevront une demande d\'annulation.',
      confirmLabel: 'Tout annuler',
      confirmVariant: 'danger',
      onConfirm: () => {
        void cancelActiveJobs(activeJobs);
      },
    }));
  }, [cancelActiveJobs, openModal, queue?.jobs]);

  const jobs = queue?.jobs || [];
  const activeJobCount = jobs.filter((job: any) => !TERMINAL_JOB_STATUSES.includes(job.status)).length;
  const completedJobCount = jobs.filter((job: any) => job.status === 'completed').length;

  return (
    <div className="ocr-modal-content ocr-queue-modal-content">
      <div className="ocr-queue-top">
        <div className="ocr-queue-overview">
          <div className="ocr-queue-overview__copy">
            <span className="ocr-queue-kicker">File de traitement</span>
            <h3>{activeJobCount > 0 ? `${activeJobCount} traitement${activeJobCount > 1 ? 's' : ''} actif${activeJobCount > 1 ? 's' : ''}` : 'File OCR disponible'}</h3>
            <p>Lance un traitement puis suis sa progression page par page.</p>
          </div>
          <div className="ocr-queue-stats" aria-label="Resume de la file OCR">
            <div><strong>{activeJobCount}</strong><span>Actifs</span></div>
            <div><strong>{jobs.length}</strong><span>Total</span></div>
            <div><strong>{completedJobCount}</strong><span>Termines</span></div>
          </div>
        </div>

        <section className="ocr-queue-launcher">
          <div className="ocr-queue-section-heading">
            <div>
              <h4>Lancer un traitement</h4>
              <p>Choisis les mangas a analyser.</p>
            </div>
            <div className="ocr-queue-utilities">
              <button type="button" onClick={() => { void loadQueue(); }}>
                {loading ? <LoadingSpinnerIcon className="is-spinning" aria-hidden="true" /> : null}
                Actualiser
              </button>
              <button type="button" onClick={() => openOcrRuntimeStatus({ title: "Installation OCR" })}>
                <SettingsIcon aria-hidden="true" /> Runtime
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => { void cancelAllJobs(); }}
                disabled={activeJobCount === 0}
              >
                <CloseXIcon aria-hidden="true" /> Tout annuler
                {activeJobCount > 0 ? <span>{activeJobCount}</span> : null}
              </button>
            </div>
          </div>

          <div className="ocr-queue-scope-grid">
            <button
              type="button"
              className={choiceScope === 'library' ? 'is-active' : ''}
              aria-pressed={choiceScope === 'library'}
              onClick={() => setChoiceScope((value) => value === 'library' ? null : 'library')}
            >
              <span className="ocr-queue-scope-icon"><OpenBookIcon aria-hidden="true" /></span>
              <span><strong>Bibliotheque</strong><small>Tous les mangas enregistres</small></span>
            </button>
            <button
              type="button"
              className={choiceScope === 'selection' ? 'is-active' : ''}
              aria-pressed={choiceScope === 'selection'}
              onClick={() => setChoiceScope((value) => value === 'selection' ? null : 'selection')}
              disabled={selectedMangaIds.length === 0}
            >
              <span className="ocr-queue-scope-icon"><SelectionIcon aria-hidden="true" /></span>
              <span><strong>Selection</strong><small>{selectedMangaIds.length} manga{selectedMangaIds.length > 1 ? 's' : ''}</small></span>
            </button>
            <button
              type="button"
              className={choiceScope === 'filtered' ? 'is-active' : ''}
              aria-pressed={choiceScope === 'filtered'}
              onClick={() => setChoiceScope((value) => value === 'filtered' ? null : 'filtered')}
              disabled={filteredMangaIds.length === 0}
            >
              <span className="ocr-queue-scope-icon"><FilterRemoveIcon aria-hidden="true" /></span>
              <span><strong>Resultats affiches</strong><small>{filteredMangaIds.length} manga{filteredMangaIds.length > 1 ? 's' : ''}</small></span>
            </button>
          </div>

          <label className={`ocr-queue-heavy-toggle${heavyPass ? ' is-active' : ''}`}>
            <input
              type="checkbox"
              checked={heavyPass}
              onChange={(event) => setHeavyPass(event.target.checked)}
            />
            <span>
              <strong>Passe lourde</strong>
              <small>Plus lente et plus complete. Le mode standard rapide reste utilise par defaut.</small>
            </span>
          </label>

        {choiceScope ? (
          <div className="ocr-library-choice">
            <div className="ocr-library-choice__copy">
              <OcrScanIcon aria-hidden="true" />
              <span>
                <strong>Mode de traitement</strong>
                <small>
              {choiceScope === 'library'
                ? 'Choisis comment lancer l\'OCR sur toute la bibliotheque.'
                : choiceScope === 'selection'
                  ? 'Choisis comment lancer l\'OCR sur la selection courante.'
                  : 'Choisis comment lancer l\'OCR sur les mangas actuellement affiches par les filtres.'}
                </small>
              </span>
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
        </section>

        {loading && jobs.length === 0 ? (
          <div className="ocr-queue-feedback is-loading"><LoadingSpinnerIcon aria-hidden="true" /> Chargement de la file OCR...</div>
        ) : null}
        {error ? <div className="ocr-queue-feedback is-error">{error}</div> : null}

        {lastLibraryResult ? (
          <div className="ocr-result-summary" role="status">
            <strong>Traitement ajoute.</strong>{' '}
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

      <section className="ocr-queue-jobs">
        <div className="ocr-queue-jobs__heading">
          <div>
            <h3>Activite recente</h3>
            <span>{jobs.length} traitement{jobs.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="ocr-queue-list">
        {jobs.length === 0 ? (
          <div className="ocr-queue-empty">
            <span><OcrScanIcon aria-hidden="true" /></span>
            <strong>Aucun traitement pour le moment</strong>
            <p>Les traitements lances apparaitront ici avec leur progression.</p>
          </div>
        ) : (
          jobs.map((job: any) => (
            <OcrQueueJobCard key={job.id} job={job} onAction={runJobAction} />
          ))
        )}
        </div>
      </section>
    </div>
  );
};

export default OcrQueueModalContent;
