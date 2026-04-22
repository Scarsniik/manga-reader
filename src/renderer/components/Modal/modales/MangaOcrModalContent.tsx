import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Manga } from '@/renderer/types';
import useModal from '@/renderer/hooks/useModal';
import { notifyOcrRuntimeMissing } from '@/renderer/utils/ocrRuntimeUi';
import buildSettingsModal from './SettingsModal';
import './OcrModalContent.scss';

type Props = {
  manga: Manga;
};

type VocabularyMode = 'unique' | 'all';
type ConfirmationContext = 'ocr' | 'extract' | null;
type VocabularyChunk = {
  text: string;
  tokenCount: number;
  charCount: number;
  overflow: boolean;
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

const formatVocabularyMode = (mode?: VocabularyMode | null) => {
  if (!mode) {
    return 'Non extrait';
  }

  return mode === 'all' ? 'Tous les tokens' : 'Tokens uniques';
};

const formatOcrPassLabel = (heavyPass?: boolean | null) => (
  heavyPass ? 'Passe lourde' : 'Standard rapide'
);

const formatDateTime = (value?: string) => {
  if (!value) {
    return 'Jamais';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const buildDefaultChunkCharacterLimit = (csv: string) => (
  csv.length > 0 ? Math.max(1, Math.floor(csv.length / 2)) : 0
);

const splitVocabularyIntoChunks = (tokens: string[], maxChars: number): VocabularyChunk[] => {
  if (!Array.isArray(tokens) || tokens.length === 0 || maxChars <= 0) {
    return [];
  }

  const chunks: VocabularyChunk[] = [];
  let currentTokens: string[] = [];
  let currentCharCount = 0;
  let currentOverflow = false;

  const flushChunk = () => {
    if (currentTokens.length === 0) {
      return;
    }

    chunks.push({
      text: currentTokens.join(','),
      tokenCount: currentTokens.length,
      charCount: currentCharCount,
      overflow: currentOverflow,
    });

    currentTokens = [];
    currentCharCount = 0;
    currentOverflow = false;
  };

  tokens.forEach((token) => {
    const normalizedToken = typeof token === 'string' ? token : '';
    if (!normalizedToken) {
      return;
    }

    const tokenLength = normalizedToken.length;
    const nextCharCount = currentTokens.length === 0
      ? tokenLength
      : currentCharCount + 1 + tokenLength;

    if (currentTokens.length > 0 && nextCharCount > maxChars) {
      flushChunk();
    }

    currentTokens.push(normalizedToken);
    currentCharCount = currentTokens.length === 1
      ? tokenLength
      : currentCharCount + 1 + tokenLength;
    if (tokenLength > maxChars) {
      currentOverflow = true;
    }
  });

  flushChunk();
  return chunks;
};

const MangaOcrModalContent: React.FC<Props> = ({ manga }) => {
  const { openModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [confirmationContext, setConfirmationContext] = useState<ConfirmationContext>(null);
  const [confirmationOverwrite, setConfirmationOverwrite] = useState(false);
  const [confirmationHeavyPass, setConfirmationHeavyPass] = useState(false);
  const [extractMode, setExtractMode] = useState<VocabularyMode>('unique');
  const [heavyPass, setHeavyPass] = useState(false);
  const [vocabularyData, setVocabularyData] = useState<any>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [hasJpdbKey, setHasJpdbKey] = useState<boolean | null>(null);
  const [chunkCharacterLimit, setChunkCharacterLimit] = useState<string>('');
  const [debouncedChunkCharacterLimit, setDebouncedChunkCharacterLimit] = useState<string>('');

  const loadStatus = useCallback(async () => {
    if (!window.api || typeof window.api.ocrGetMangaStatus !== 'function') {
      setLoading(false);
      return;
    }

    try {
      const nextStatus = await window.api.ocrGetMangaStatus(manga.id);
      setStatus(nextStatus);
      setStatusError(null);
    } catch (err: any) {
      setStatusError(String(err?.message || err || 'Impossible de charger le statut OCR'));
    } finally {
      setLoading(false);
    }
  }, [manga.id]);

  const loadVocabulary = useCallback(async () => {
    if (!window.api || typeof window.api.ocrReadMangaVocabulary !== 'function') {
      return;
    }

    try {
      const nextVocabulary = await window.api.ocrReadMangaVocabulary(manga.id);
      setVocabularyData(nextVocabulary);
      setStatusError(null);
    } catch (err: any) {
      setStatusError(String(err?.message || err || 'Impossible de lire le vocabulaire extrait'));
    }
  }, [manga.id]);

  const loadJpdbConfiguration = useCallback(async () => {
    if (!window.api || typeof window.api.getSettings !== 'function') {
      setHasJpdbKey(null);
      return;
    }

    try {
      const settings = await window.api.getSettings();
      setHasJpdbKey(!!String(settings?.jpdbApiKey || '').trim());
    } catch {
      setHasJpdbKey(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadVocabulary();
    void loadJpdbConfiguration();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [loadJpdbConfiguration, loadStatus, loadVocabulary]);

  useEffect(() => {
    if (status?.vocabulary?.extractedAt) {
      void loadVocabulary();
    }
  }, [loadVocabulary, status?.vocabulary?.extractedAt]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedChunkCharacterLimit(chunkCharacterLimit);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [chunkCharacterLimit]);

  const startMangaOcr = useCallback(async (
    overwrite: boolean,
    confirmLanguage: boolean = false,
    nextHeavyPass: boolean = heavyPass,
  ) => {
    if (!window.api || typeof window.api.ocrStartManga !== 'function') {
      setActionError('API OCR indisponible');
      return;
    }

    setStarting(true);
    setCopyFeedback(null);
    setActionError(null);
    try {
      const result = await window.api.ocrStartManga(manga.id, {
        overwrite,
        confirmLanguage,
        heavyPass: !!nextHeavyPass,
      });
      if (result?.requiresConfirmation) {
        setConfirmation(result);
        setConfirmationContext('ocr');
        setConfirmationOverwrite(overwrite);
        setConfirmationHeavyPass(!!nextHeavyPass);
      } else {
        setConfirmation(null);
        setConfirmationContext(null);
        setConfirmationOverwrite(false);
        setConfirmationHeavyPass(false);
        await loadStatus();
        try {
          window.dispatchEvent(new CustomEvent('mangas-updated'));
        } catch {
          // noop
        }
      }
    } catch (err: any) {
      if (notifyOcrRuntimeMissing(err, {
        title: "Installer l'OCR",
        message: "Installe le runtime OCR pour lancer l'OCR ou extraire le vocabulaire de ce manga.",
      })) {
        setActionError("Runtime OCR absent.");
        return;
      }

      setActionError(String(err?.message || err || 'Impossible de lancer l\'OCR'));
    } finally {
      setStarting(false);
    }
  }, [heavyPass, loadStatus, manga.id]);

  const extractVocabulary = useCallback(async (confirmLanguage: boolean = false) => {
    if (!window.api || typeof window.api.ocrExtractMangaVocabulary !== 'function') {
      setActionError('API d\'extraction indisponible. Redemarre Electron pour recharger le preload et les handlers.');
      return;
    }

    setExtracting(true);
    setCopyFeedback(null);
    setActionError(null);
    try {
      const result = await window.api.ocrExtractMangaVocabulary(manga.id, {
        mode: extractMode,
        confirmLanguage,
      });

      if (result?.requiresConfirmation) {
        setConfirmation(result);
        setConfirmationContext('extract');
        setConfirmationOverwrite(false);
        setConfirmationHeavyPass(false);
        return;
      }

      setConfirmation(null);
      setConfirmationContext(null);
      setConfirmationOverwrite(false);
      setConfirmationHeavyPass(false);
      if (result?.vocabulary) {
        setVocabularyData(result.vocabulary);
      }
      await loadStatus();
      await loadVocabulary();
    } catch (err: any) {
      if (notifyOcrRuntimeMissing(err, {
        title: "Installer l'OCR",
        message: "Installe le runtime OCR pour extraire le vocabulaire depuis les pages du manga.",
      })) {
        setActionError("Runtime OCR absent.");
        return;
      }

      setActionError(String(err?.message || err || 'Impossible d\'extraire le vocabulaire'));
    } finally {
      setExtracting(false);
    }
  }, [extractMode, loadStatus, loadVocabulary, manga.id]);

  const copyTextToClipboard = useCallback(async (text: string, successMessage: string) => {
    setCopyFeedback(null);
    setActionError(null);

    try {
      if (window.api && typeof window.api.copyTextToClipboard === 'function') {
        const result = await window.api.copyTextToClipboard(text);
        if (!result?.ok) {
          throw new Error(result?.error || 'Copie impossible');
        }
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Presse-papiers indisponible');
      }

      setCopyFeedback(successMessage);
    } catch (err: any) {
      setActionError(String(err?.message || err || 'Impossible de copier le vocabulaire'));
    }
  }, []);

  const handleCopyVocabulary = useCallback(async () => {
    let nextVocabulary = vocabularyData;
    if ((!nextVocabulary || !Array.isArray(nextVocabulary.tokens) || nextVocabulary.tokens.length === 0)
      && window.api
      && typeof window.api.ocrReadMangaVocabulary === 'function') {
      nextVocabulary = await window.api.ocrReadMangaVocabulary(manga.id);
      setVocabularyData(nextVocabulary);
    }

    const csv = typeof nextVocabulary?.csv === 'string'
      ? nextVocabulary.csv
      : (Array.isArray(nextVocabulary?.tokens) ? nextVocabulary.tokens.join(',') : '');

    if (!csv) {
      setActionError('Aucun vocabulaire extrait a copier');
      return;
    }

    await copyTextToClipboard(csv, 'Chaîne copiée dans le presse-papiers');
  }, [copyTextToClipboard, manga.id, vocabularyData]);

  const progressLabel = useMemo(() => {
    const activeJob = status?.activeJob;
    if (activeJob && ['queued', 'detecting_language', 'running', 'paused'].includes(activeJob.status)) {
      return `${activeJob.completedPages || 0}/${activeJob.totalPages || 0}`;
    }

    if (!status?.progress) {
      return '0/0';
    }
    return `${status.progress.completedPages || 0}/${status.progress.totalPages || 0}`;
  }, [status]);

  const activeJob = status?.activeJob;
  const visibleError = actionError || statusError;
  const extractApiReady = !!window.api && typeof window.api.ocrExtractMangaVocabulary === 'function';
  const jpdbConfigLoading = hasJpdbKey === null;
  const jpdbMissing = hasJpdbKey === false;
  const vocabularyTokens = useMemo(
    () => (Array.isArray(vocabularyData?.tokens)
      ? vocabularyData.tokens.filter((token: unknown): token is string => typeof token === 'string' && token.length > 0)
      : []),
    [vocabularyData]
  );
  const vocabularyCsv = useMemo(
    () => (typeof vocabularyData?.csv === 'string'
      ? vocabularyData.csv
      : vocabularyTokens.join(',')),
    [vocabularyData, vocabularyTokens]
  );
  const defaultChunkCharacterLimit = useMemo(
    () => buildDefaultChunkCharacterLimit(vocabularyCsv),
    [vocabularyCsv]
  );
  const outputTokenCount = Number(vocabularyData?.outputTokens || vocabularyData?.tokens?.length || status?.vocabulary?.outputTokens || 0);
  const uniqueTokenCount = Number(vocabularyData?.uniqueTokens || status?.vocabulary?.uniqueTokens || 0);
  const allTokenCount = Number(vocabularyData?.allTokens || status?.vocabulary?.allTokens || 0);
  const vocabularyPreview = useMemo(() => {
    const tokens = Array.isArray(vocabularyData?.tokens) ? vocabularyData.tokens : [];
    if (tokens.length === 0) {
      return '';
    }

    const preview = tokens.slice(0, 40).join(',');
    return tokens.length > 40 ? `${preview}, ...` : preview;
  }, [vocabularyData]);
  const parsedChunkCharacterLimit = useMemo(() => {
    const parsed = Number(debouncedChunkCharacterLimit);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }, [debouncedChunkCharacterLimit]);
  const vocabularyChunks = useMemo(
    () => splitVocabularyIntoChunks(vocabularyTokens, parsedChunkCharacterLimit),
    [parsedChunkCharacterLimit, vocabularyTokens]
  );

  useEffect(() => {
    const nextValue = defaultChunkCharacterLimit > 0 ? String(defaultChunkCharacterLimit) : '';
    setChunkCharacterLimit(nextValue);
    setDebouncedChunkCharacterLimit(nextValue);
  }, [defaultChunkCharacterLimit]);

  const feedbackMessage = useMemo(() => {
    if (copyFeedback) {
      return copyFeedback;
    }

    if (extracting) {
      if (activeJob?.status === 'queued') {
        return 'Extraction en attente dans la file OCR prioritaire...';
      }
      if (activeJob?.status === 'detecting_language') {
        return 'Detection de la langue avant OCR...';
      }
      if (activeJob?.status === 'running') {
        return `OCR en cours (${progressLabel}) avant l'analyse JPDB...`;
      }
      if (activeJob?.status === 'paused') {
        return 'Le job OCR est en pause.';
      }
      return 'Analyse JPDB en cours...';
    }

    if (starting) {
      return activeJob?.status === 'queued' ? 'OCR ajoute a la file...' : 'Lancement du job OCR...';
    }

    return null;
  }, [activeJob?.status, copyFeedback, extracting, progressLabel, starting]);

  return (
    <div className="ocr-modal-content">
      {loading ? <div>Chargement du statut OCR...</div> : null}
      {visibleError ? <div>{visibleError}</div> : null}
      {feedbackMessage ? <div className="ocr-feedback">{feedbackMessage}</div> : null}

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
                <strong>Etat file OCR</strong>
                <span>{activeJob ? formatJobStatus(activeJob.status) : 'Aucun job'}</span>
              </div>
              <div className="ocr-status-item">
                <strong>Profil OCR</strong>
                <span>{formatOcrPassLabel(activeJob?.heavyPass)}</span>
              </div>
              <div className="ocr-status-item">
                <strong>Fichier vocabulaire</strong>
                <span>{status.vocabulary?.exists ? 'Present' : 'Absent'}</span>
              </div>
              <div className="ocr-status-item">
                <strong>Derniere extraction</strong>
                <span>{formatDateTime(status.vocabulary?.extractedAt)}</span>
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
                    if (confirmationContext === 'extract') {
                      void extractVocabulary(true);
                    } else {
                      void startMangaOcr(confirmationOverwrite, true, confirmationHeavyPass);
                    }
                  }}
                  disabled={starting || extracting}
                >
                  Lancer quand meme
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setConfirmation(null);
                    setConfirmationContext(null);
                    setConfirmationOverwrite(false);
                    setConfirmationHeavyPass(false);
                  }}
                  disabled={starting || extracting}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          <div className="ocr-status-card ocr-run-options-card">
            <label className="ocr-run-option-toggle">
              <input
                type="checkbox"
                checked={heavyPass}
                onChange={(event) => setHeavyPass(event.target.checked)}
                disabled={starting || extracting}
              />
              <span>
                <strong>Passe lourde</strong>
                <small>
                  Désactivée par défaut. Le mode standard utilise seulement base + adaptive pour aller plus vite.
                </small>
              </span>
            </label>
          </div>

          <div className="ocr-modal-actions-row">
            <button
              type="button"
              onClick={() => {
                void startMangaOcr(false);
              }}
              disabled={starting || extracting}
            >
              {status.exists ? 'Reprendre' : 'Lancer l\'OCR'}
            </button>
            <button
              type="button"
              onClick={() => {
                void startMangaOcr(true);
              }}
              disabled={starting || extracting}
            >
              Relancer en ecrasant
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                void loadStatus();
                void loadVocabulary();
                void loadJpdbConfiguration();
              }}
              disabled={starting || extracting}
            >
              Actualiser
            </button>
          </div>

          <div className="ocr-status-card ocr-vocabulary-card">
            <div className="ocr-vocabulary-hero">
              <div className="ocr-vocabulary-kicker">JPDB</div>
              <div className="ocr-vocabulary-head">
                <div className="ocr-vocabulary-title-group">
                  <h3>Extraction vocabulaire</h3>
                  <p>
                    Si l&apos;OCR complet n&apos;existe pas encore, on repasse par la meme file d&apos;attente OCR
                    avec une priorite plus haute, puis on parse les phrases avec JPDB.
                  </p>
                </div>
                <div className="ocr-vocabulary-mode-pill">
                  {jpdbConfigLoading
                    ? 'Verification...'
                    : jpdbMissing
                      ? 'Configuration requise'
                      : formatVocabularyMode((vocabularyData?.mode || status.vocabulary?.mode) as VocabularyMode | null)}
                </div>
              </div>
            </div>

            {jpdbConfigLoading ? (
              <div className="ocr-vocabulary-empty">
                Verification de la configuration JPDB en cours...
              </div>
            ) : !extractApiReady ? (
              <div className="ocr-vocabulary-warning">
                <div className="ocr-vocabulary-warning-copy">
                  <strong>Extraction non chargee dans cette session</strong>
                  <p>
                    Le renderer est a jour, mais le bridge Electron n&apos;expose pas encore la nouvelle action.
                    Redemarre l&apos;application pour recharger le preload et les handlers OCR.
                  </p>
                </div>
              </div>
            ) : jpdbMissing ? (
              <div className="ocr-vocabulary-warning">
                <div className="ocr-vocabulary-warning-copy">
                  <strong>Clé JPDB manquante</strong>
                  <p>
                    Elle sert a parser les phrases OCR et a recuperer les tokens du manga.
                    Ajoute-la dans les parametres pour activer l&apos;extraction automatique.
                  </p>
                </div>
                <div className="ocr-modal-actions-row">
                  <button
                    type="button"
                    onClick={() => {
                      openModal(buildSettingsModal());
                    }}
                  >
                    Ouvrir les parametres
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void loadJpdbConfiguration();
                    }}
                  >
                    Verifier a nouveau
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void handleCopyVocabulary();
                    }}
                    disabled={starting || extracting || outputTokenCount <= 0}
                  >
                    Copier l&apos;existant
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="ocr-vocabulary-options">
                  <label className={`ocr-vocabulary-option-card${extractMode === 'unique' ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name={`vocabulary-mode-${manga.id}`}
                      value="unique"
                      checked={extractMode === 'unique'}
                      onChange={() => setExtractMode('unique')}
                      disabled={extracting}
                    />
                    <span className="ocr-vocabulary-option-title">Tokens uniques</span>
                    <span className="ocr-vocabulary-option-copy">
                      Une seule occurrence par label, ideal pour une liste de vocabulaire propre.
                    </span>
                  </label>
                  <label className={`ocr-vocabulary-option-card${extractMode === 'all' ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name={`vocabulary-mode-${manga.id}`}
                      value="all"
                      checked={extractMode === 'all'}
                      onChange={() => setExtractMode('all')}
                      disabled={extracting}
                    />
                    <span className="ocr-vocabulary-option-title">Tous les tokens</span>
                    <span className="ocr-vocabulary-option-copy">
                      Garde chaque occurrence pour conserver la repetition reelle du manga.
                    </span>
                  </label>
                </div>

                <div className="ocr-vocabulary-actions-bar">
                  <button
                    type="button"
                    onClick={() => {
                      void extractVocabulary(false);
                    }}
                    disabled={starting || extracting}
                  >
                    {extracting ? 'Extraction en cours...' : 'Extraire vocabulaire'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void handleCopyVocabulary();
                    }}
                    disabled={starting || extracting || outputTokenCount <= 0}
                  >
                    Copier en chaine CSV
                  </button>
                  <div className="ocr-vocabulary-actions-copy">
                    Format de copie: `token1,token2,token3`
                  </div>
                </div>
              </>
            )}

            <div className="ocr-vocabulary-stats">
              <div className="ocr-vocabulary-stat">
                <strong>Tokens sortis</strong>
                <span>{outputTokenCount}</span>
              </div>
              <div className="ocr-vocabulary-stat">
                <strong>Tous les tokens</strong>
                <span>{allTokenCount}</span>
              </div>
              <div className="ocr-vocabulary-stat">
                <strong>Tokens uniques</strong>
                <span>{uniqueTokenCount}</span>
              </div>
              <div className="ocr-vocabulary-stat">
                <strong>Phrases parsees</strong>
                <span>{vocabularyData?.phraseCount || 0}</span>
              </div>
              <div className="ocr-vocabulary-stat">
                <strong>Pages OCR utilisees</strong>
                <span>{vocabularyData?.processedPages || 0}</span>
              </div>
              <div className="ocr-vocabulary-stat">
                <strong>Derniere extraction</strong>
                <span>{formatDateTime(status.vocabulary?.extractedAt)}</span>
              </div>
            </div>

            {vocabularyPreview ? (
              <div className="ocr-vocabulary-preview-card">
                <div className="ocr-vocabulary-preview-header">
                  <strong>Apercu CSV</strong>
                  <span>{outputTokenCount} token{outputTokenCount > 1 ? 's' : ''}</span>
                </div>
                <div className="ocr-vocabulary-preview">{vocabularyPreview}</div>
              </div>
            ) : (
              <div className="ocr-vocabulary-empty">
                Lance l&apos;extraction pour generer le JSON et preparer une chaine copiables des tokens.
              </div>
            )}

            <div className="ocr-vocabulary-file">
              <strong>Fichier JSON</strong>
              <span>{status.vocabulary?.filePath || vocabularyData?.filePath || 'Non cree'}</span>
            </div>

            {vocabularyTokens.length > 0 ? (
              <div className="ocr-vocabulary-chunk-section">
                <div className="ocr-vocabulary-chunk-head">
                  <div className="ocr-vocabulary-chunk-copy">
                    <strong>Découpage en paquets</strong>
                    <p>
                      Valeur par défaut: la moitié de la chaîne actuelle, soit {defaultChunkCharacterLimit} caractères.
                    </p>
                  </div>
                  <label className="ocr-vocabulary-chunk-input">
                    <span>Caractères max par paquet</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={chunkCharacterLimit}
                      onChange={(event) => {
                        setChunkCharacterLimit(event.target.value);
                      }}
                    />
                  </label>
                </div>

                {parsedChunkCharacterLimit > 0 ? (
                  <>
                    <div className="ocr-result-summary">
                      {vocabularyChunks.length} paquet{vocabularyChunks.length > 1 ? 's' : ''} généré{vocabularyChunks.length > 1 ? 's' : ''}
                      avec une limite de {parsedChunkCharacterLimit} caractères.
                    </div>
                    <div className="ocr-vocabulary-chunk-grid">
                      {vocabularyChunks.map((chunk, index) => (
                        <button
                          key={`vocabulary-chunk-${index}`}
                          type="button"
                          onClick={() => {
                            void copyTextToClipboard(chunk.text, `Paquet ${index + 1} copié dans le presse-papiers`);
                          }}
                        >
                          <strong>Copier paquet {index + 1}</strong>
                          <span>
                            {chunk.charCount} car. • {chunk.tokenCount} token{chunk.tokenCount > 1 ? 's' : ''}
                            {chunk.overflow ? ' • dépasse la limite (token trop long)' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="ocr-vocabulary-empty">
                    Renseigne une limite de caractères strictement positive pour générer les paquets.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {activeJob ? (
            <div className="ocr-result-summary">
              Job file OCR: {formatJobStatus(activeJob.status)}
              {typeof activeJob.heavyPass === 'boolean' ? `, ${formatOcrPassLabel(activeJob.heavyPass)}` : ''}
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
