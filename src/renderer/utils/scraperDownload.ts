import {
  DownloadScraperMangaRequest,
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
  QueueScraperDownloadResult,
  ScraperDetailsFeatureConfig,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from '@/shared/scraper';
import type { Manga } from '@/renderer/types';
import { findMangaLinkedToSource } from '@/renderer/utils/mangaSource';
import { usesScraperPagesChapters } from '@/renderer/utils/scraperPages';
import {
  extractScraperDetailsFromDocument,
  hasRenderableDetails,
  resolveScraperPageUrls,
  ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';

type FetchScraperDocumentApi = (
  request: FetchScraperDocumentRequest,
) => Promise<FetchScraperDocumentResult>;

type QueueScraperDownloadApi = (
  request: DownloadScraperMangaRequest,
) => Promise<QueueScraperDownloadResult>;

type QueueStandaloneScraperCardDownloadOptions = {
  scraper: ScraperRecord;
  detailsConfig: ScraperDetailsFeatureConfig | null;
  pagesConfig: ScraperPagesFeatureConfig | null;
  sourceUrl: string;
  fallbackTitle?: string | null;
  libraryMangas?: Manga[];
  replaceMangaId?: string | null;
};

export type QueueStandaloneScraperCardDownloadResult = {
  queueResult: QueueScraperDownloadResult;
  details: ScraperRuntimeDetailsResult;
  sourceUrl: string;
  replaceMangaId: string | null;
};

export type ScraperDownloadQueuedMessageOptions = {
  queueResult: QueueScraperDownloadResult;
  isReplacement?: boolean;
  isChapterDownload?: boolean;
};

const getRendererApi = (): Record<string, unknown> => {
  if (typeof window === 'undefined') {
    return {};
  }

  return (window as any).api ?? {};
};

const getFetchScraperDocumentApi = (): FetchScraperDocumentApi => {
  const fetchScraperDocument = getRendererApi().fetchScraperDocument;
  if (typeof fetchScraperDocument !== 'function') {
    throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
  }

  return fetchScraperDocument as FetchScraperDocumentApi;
};

const getQueueScraperDownloadApi = (): QueueScraperDownloadApi => {
  const api = getRendererApi();
  const queueScraperDownload = api.queueScraperDownload || api.downloadScraperManga;
  if (typeof queueScraperDownload !== 'function') {
    throw new Error('Le telechargement du scrapper n\'est pas disponible dans cette version.');
  }

  return queueScraperDownload as QueueScraperDownloadApi;
};

const normalizeFallbackTitle = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'manga';
};

export const canQueueStandaloneScraperDownload = (
  detailsConfig: ScraperDetailsFeatureConfig | null,
  pagesConfig: ScraperPagesFeatureConfig | null,
): boolean => Boolean(
  detailsConfig?.titleSelector
  && pagesConfig
  && !usesScraperPagesChapters(pagesConfig),
);

export const buildScraperDownloadQueuedMessage = ({
  queueResult,
  isReplacement = false,
  isChapterDownload = false,
}: ScraperDownloadQueuedMessageOptions): string => {
  const activeJobs = Number(queueResult.status?.counts?.active || 0);
  const statusLabel = queueResult.job?.status === 'running'
    ? 'demarre'
    : 'a ete ajoute a la file';

  return (
    `${isReplacement ? 'Le remplacement local' : isChapterDownload ? 'Le telechargement du chapitre' : 'Le telechargement du manga'} ${statusLabel}. `
    + `${activeJobs > 0 ? `${activeJobs} job(s) actif(s). ` : ''}`
    + 'Suis l\'avancement depuis "Telechargements" en haut de l\'accueil.'
  );
};

export async function queueStandaloneScraperCardDownload({
  scraper,
  detailsConfig,
  pagesConfig,
  sourceUrl,
  fallbackTitle,
  libraryMangas = [],
  replaceMangaId = null,
}: QueueStandaloneScraperCardDownloadOptions): Promise<QueueStandaloneScraperCardDownloadResult> {
  if (!sourceUrl.trim()) {
    throw new Error('Aucune URL source n\'est disponible pour ce manga.');
  }

  if (!canQueueStandaloneScraperDownload(detailsConfig, pagesConfig)) {
    throw new Error('Le telechargement direct depuis une card requiert `Fiche` et `Pages` sans liaison chapitre.');
  }

  const fetchScraperDocument = getFetchScraperDocumentApi();
  const queueScraperDownload = getQueueScraperDownloadApi();
  const documentResult = await fetchScraperDocument({
    baseUrl: scraper.baseUrl,
    targetUrl: sourceUrl,
  });

  if (!documentResult?.ok || !documentResult.html) {
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === 'number'
        ? `La fiche a repondu avec le code HTTP ${documentResult.status}.`
        : 'Impossible de charger la fiche demandee.'),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, 'text/html');
  const details = extractScraperDetailsFromDocument(documentNode, detailsConfig as ScraperDetailsFeatureConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
    status: documentResult.status,
    contentType: documentResult.contentType,
    html: documentResult.html,
  });

  if (!hasRenderableDetails(details)) {
    throw new Error('La fiche a bien ete chargee, mais aucun contenu exploitable n\'a ete extrait avec la configuration actuelle.');
  }

  const pageUrls = await resolveScraperPageUrls(
    scraper,
    details,
    pagesConfig as ScraperPagesFeatureConfig,
    async (request) => fetchScraperDocument(request),
  );
  const resolvedSourceUrl = details.finalUrl || details.requestedUrl || sourceUrl;
  const linkedManga = replaceMangaId
    ? null
    : findMangaLinkedToSource(libraryMangas, {
      scraperId: scraper.id,
      sourceUrl: resolvedSourceUrl,
    });
  const resolvedReplaceMangaId = replaceMangaId || linkedManga?.id || null;
  const title = details.title || normalizeFallbackTitle(fallbackTitle);

  const queueResult = await queueScraperDownload({
    title,
    pageUrls,
    refererUrl: resolvedSourceUrl,
    scraperId: scraper.id,
    scraperName: scraper.name,
    sourceUrl: resolvedSourceUrl,
    replaceMangaId: resolvedReplaceMangaId || undefined,
    defaultTagIds: scraper.globalConfig.defaultTagIds,
    defaultLanguage: scraper.globalConfig.defaultLanguage,
    autoAssignSeriesOnChapterDownload: scraper.globalConfig.chapterDownloads.autoAssignSeries,
    seriesTitle: title,
  });

  return {
    queueResult,
    details,
    sourceUrl: resolvedSourceUrl,
    replaceMangaId: resolvedReplaceMangaId,
  };
}
