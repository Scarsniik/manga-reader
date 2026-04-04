import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ScraperRecord } from '@/shared/scraper';
import {
  extractScraperDetailsFromDocument,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  hasRenderableDetails,
  isScraperFeatureConfigured,
  resolveScraperDetailsTargetUrl,
  resolveScraperPageUrls,
  ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';
import './style.scss';

type Props = {
  scraper: ScraperRecord;
};

type ScraperBrowseMode = 'search' | 'manga';

const FEATURE_STATUS_LABELS = {
  not_configured: 'Non configure',
  configured: 'Configure',
  validated: 'Valide',
} as const;

const buildQueryPlaceholder = (
  mode: ScraperBrowseMode,
  hasDetails: boolean,
  detailsMode: 'template' | 'result_url' | null,
): string => {
  if (mode === 'search') {
    return 'Rechercher un manga...';
  }

  if (!hasDetails) {
    return 'La fiche n\'est pas encore configuree.';
  }

  if (detailsMode === 'template') {
    return 'Exemple : slug, id ou valeur attendue par le template';
  }

  return 'Exemple : URL complete, chemin relatif ou slug';
};

export default function ScraperBrowser({ scraper }: Props) {
  const searchFeature = useMemo(() => getScraperFeature(scraper, 'search'), [scraper]);
  const detailsFeature = useMemo(() => getScraperFeature(scraper, 'details'), [scraper]);
  const pagesFeature = useMemo(() => getScraperFeature(scraper, 'pages'), [scraper]);
  const detailsConfig = useMemo(() => getScraperDetailsFeatureConfig(detailsFeature), [detailsFeature]);
  const pagesConfig = useMemo(() => getScraperPagesFeatureConfig(pagesFeature), [pagesFeature]);

  const hasSearch = isScraperFeatureConfigured(searchFeature);
  const hasDetails = isScraperFeatureConfigured(detailsFeature);
  const hasPages = isScraperFeatureConfigured(pagesFeature);
  const availableModes = useMemo<ScraperBrowseMode[]>(() => {
    const nextModes: ScraperBrowseMode[] = [];
    if (hasSearch) {
      nextModes.push('search');
    }
    if (hasDetails) {
      nextModes.push('manga');
    }
    return nextModes;
  }, [hasDetails, hasSearch]);

  const defaultMode = useMemo<ScraperBrowseMode>(() => {
    if (availableModes.includes('manga')) {
      return 'manga';
    }

    return availableModes[0] ?? 'manga';
  }, [availableModes]);

  const [mode, setMode] = useState<ScraperBrowseMode>(defaultMode);
  const [query, setQuery] = useState('');
  const [detailsResult, setDetailsResult] = useState<ScraperRuntimeDetailsResult | null>(null);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setMode((previous) => (availableModes.includes(previous) ? previous : defaultMode));
  }, [availableModes, defaultMode]);

  useEffect(() => {
    setQuery('');
    setDetailsResult(null);
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setLoading(false);
    setDownloading(false);
  }, [scraper.id]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuery = query.trim();
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setDetailsResult(null);

    if (!trimmedQuery) {
      setRuntimeError('Saisis une valeur avant de lancer le scrapper.');
      return;
    }

    if (mode === 'search') {
      setRuntimeMessage('La vue de resultats de recherche n\'est pas encore branchee. La vue manga sert pour le moment de test runtime.');
      return;
    }

    if (!detailsConfig || !detailsConfig.titleSelector) {
      setRuntimeError('Le composant Fiche n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setRuntimeError('Le runtime du scrapper n\'est pas disponible dans cette version.');
      return;
    }

    setLoading(true);

    try {
      const targetUrl = resolveScraperDetailsTargetUrl(scraper.baseUrl, detailsConfig, trimmedQuery);
      const documentResult = await (window as any).api.fetchScraperDocument({
        baseUrl: scraper.baseUrl,
        targetUrl,
      });

      if (!documentResult?.ok || !documentResult.html) {
        setRuntimeError(
          documentResult?.error
            || (typeof documentResult?.status === 'number'
              ? `La fiche a repondu avec le code HTTP ${documentResult.status}.`
              : 'Impossible de charger la fiche demandee.'),
        );
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, 'text/html');
      const extractedDetails = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
        status: documentResult.status,
        contentType: documentResult.contentType,
      });

      if (!hasRenderableDetails(extractedDetails)) {
        setRuntimeError('La fiche a bien ete chargee, mais aucun contenu exploitable n\'a ete extrait avec la configuration actuelle.');
        return;
      }

      setDetailsResult(extractedDetails);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Echec temporaire du scrapper.');
    } finally {
      setLoading(false);
    }
  }, [detailsConfig, mode, query, scraper.baseUrl]);

  const handleDownload = useCallback(async () => {
    if (!detailsResult) {
      setDownloadError('Charge d\'abord une fiche avant de lancer le telechargement.');
      return;
    }

    if (!pagesConfig) {
      setDownloadError('Le composant Pages n\'est pas encore configure pour ce scrapper.');
      return;
    }

    if (!(window as any).api
      || typeof (window as any).api.fetchScraperDocument !== 'function'
      || typeof (window as any).api.downloadScraperManga !== 'function') {
      setDownloadError('Le telechargement du scrapper n\'est pas disponible dans cette version.');
      return;
    }

    setDownloading(true);
    setDownloadError(null);
    setDownloadMessage(null);

    try {
      const pageUrls = await resolveScraperPageUrls(
        scraper,
        detailsResult,
        pagesConfig,
        async (request) => (window as any).api.fetchScraperDocument(request),
      );

      const downloadResult = await (window as any).api.downloadScraperManga({
        title: detailsResult.title || query.trim() || 'manga',
        pageUrls,
        refererUrl: detailsResult.finalUrl || detailsResult.requestedUrl,
      });

      setDownloadMessage(
        `${downloadResult.downloadedCount} page(s) telechargee(s) dans ${downloadResult.folderPath}. Le manga a ete ajoute a la bibliotheque.`,
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Le telechargement du manga a echoue.');
    } finally {
      setDownloading(false);
    }
  }, [detailsResult, pagesConfig, query, scraper]);

  const activePlaceholder = useMemo(
    () => buildQueryPlaceholder(mode, hasDetails, detailsConfig?.urlStrategy ?? null),
    [detailsConfig?.urlStrategy, hasDetails, mode],
  );

  const capabilities = useMemo(() => ([
    { label: 'Recherche', feature: searchFeature, enabled: hasSearch },
    { label: 'Fiche', feature: detailsFeature, enabled: hasDetails },
    { label: 'Pages', feature: pagesFeature, enabled: hasPages },
  ]), [detailsFeature, hasDetails, hasPages, hasSearch, pagesFeature, searchFeature]);

  return (
    <section className="scraper-browser">
      <div className="scraper-browser__hero">
        <div className="scraper-browser__intro">
          <span className="scraper-browser__eyebrow">Scrapper actif</span>
          <h2>{scraper.name}</h2>
          <p>{scraper.description || 'Affichage temporaire pour executer la configuration du scrapper sans passer par la bibliotheque.'}</p>
        </div>

        <div className="scraper-browser__meta">
          <span>{scraper.baseUrl}</span>
          <div className="scraper-browser__caps">
            {capabilities.map((capability) => (
              <span
                key={capability.label}
                className={[
                  'scraper-browser__capability',
                  capability.enabled ? 'is-enabled' : 'is-disabled',
                ].join(' ')}
                title={capability.feature ? FEATURE_STATUS_LABELS[capability.feature.status] : 'Non configure'}
              >
                {capability.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {availableModes.length === 0 ? (
        <div className="scraper-browser__panel scraper-browser__message is-warning">
          Aucun composant executable n&apos;est encore configure sur ce scrapper. Configure au moins `Fiche`
          ou `Recherche` pour afficher une vue temporaire ici.
        </div>
      ) : (
        <div className="scraper-browser__panel">
          <form className="scraper-browser__toolbar" onSubmit={handleSubmit}>
            {availableModes.length > 1 ? (
              <select
                className="scraper-browser__mode-select"
                value={mode}
                onChange={(event) => setMode(event.target.value as ScraperBrowseMode)}
              >
                <option value="search">Recherche</option>
                <option value="manga">Manga</option>
              </select>
            ) : null}

            <input
              className="scraper-browser__query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={activePlaceholder}
            />

            <button type="submit" className="scraper-browser__submit" disabled={loading}>
              {loading ? 'Chargement...' : mode === 'manga' ? 'Ouvrir' : 'Lancer'}
            </button>
          </form>

          <div className="scraper-browser__helper">
            {mode === 'manga'
              ? 'Cette vue charge une fiche a partir de la configuration `Fiche` et affiche un rendu temporaire.'
              : 'La recherche sera branchee ensuite. Le mode est deja present pour fixer la structure de l\'interface.'}
          </div>
        </div>
      )}

      {runtimeMessage ? (
        <div className="scraper-browser__message is-info">{runtimeMessage}</div>
      ) : null}

      {runtimeError ? (
        <div className="scraper-browser__message is-error">{runtimeError}</div>
      ) : null}

      {downloadMessage ? (
        <div className="scraper-browser__message is-success">{downloadMessage}</div>
      ) : null}

      {downloadError ? (
        <div className="scraper-browser__message is-error">{downloadError}</div>
      ) : null}

      {detailsResult ? (
        <article className="scraper-browser__details">
          <div className="scraper-browser__details-media">
            {detailsResult.cover ? (
              <img src={detailsResult.cover} alt={detailsResult.title || 'Couverture'} />
            ) : (
              <div className="scraper-browser__details-placeholder">Pas d&apos;image</div>
            )}
          </div>

          <div className="scraper-browser__details-body">
            <div className="scraper-browser__details-head">
              <h3>{detailsResult.title || 'Titre non detecte'}</h3>
              <div className="scraper-browser__details-actions">
                {detailsResult.mangaStatus ? (
                  <span className="scraper-browser__status-pill">{detailsResult.mangaStatus}</span>
                ) : null}
                {hasPages ? (
                  <button
                    type="button"
                    className="scraper-browser__download"
                    onClick={() => void handleDownload()}
                    disabled={downloading}
                  >
                    {downloading ? 'Telechargement...' : 'Telecharger'}
                  </button>
                ) : null}
              </div>
            </div>

            {detailsResult.authors.length ? (
              <div className="scraper-browser__chips">
                {detailsResult.authors.map((author) => (
                  <span key={author} className="scraper-browser__chip is-author">{author}</span>
                ))}
              </div>
            ) : null}

            {detailsResult.tags.length ? (
              <div className="scraper-browser__chips">
                {detailsResult.tags.map((tag) => (
                  <span key={tag} className="scraper-browser__chip is-tag">{tag}</span>
                ))}
              </div>
            ) : null}

            <p className="scraper-browser__description">
              {detailsResult.description || 'Aucune description extraite pour cette fiche.'}
            </p>

            <div className="scraper-browser__links">
              <div>
                <span>URL demandee</span>
                <strong>{detailsResult.requestedUrl}</strong>
              </div>
              {detailsResult.finalUrl && detailsResult.finalUrl !== detailsResult.requestedUrl ? (
                <div>
                  <span>URL finale</span>
                  <strong>{detailsResult.finalUrl}</strong>
                </div>
              ) : null}
            </div>

            {Object.keys(detailsResult.derivedValues).length ? (
              <div className="scraper-browser__derived">
                <span className="scraper-browser__derived-title">Variables derivees</span>
                <div className="scraper-browser__derived-list">
                  {Object.entries(detailsResult.derivedValues).map(([key, value]) => (
                    <div key={key} className="scraper-browser__derived-item">
                      <code>{`{{${key}}}`}</code>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}
    </section>
  );
}
