import {
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
  ScraperDetailsFeatureConfig,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from '@/shared/scraper';
import type { Manga } from '@/renderer/types';
import {
  extractScraperDetailsFromDocument,
  hasRenderableDetails,
  resolveScraperPageUrls,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';
import { findMangaLinkedToSource } from '@/renderer/utils/mangaSource';
import generateId from '@/utils/id';

type SaveScraperMangaToLibraryOptions = {
  scraper: ScraperRecord;
  details: ScraperRuntimeDetailsResult;
  pageUrls: string[];
  chapter?: ScraperRuntimeChapterResult | null;
  libraryMangas?: Manga[];
};

type SaveScraperMangaToLibraryResult = {
  manga: Manga | null;
  created: boolean;
};

type FetchScraperDocumentApi = (
  request: FetchScraperDocumentRequest,
) => Promise<FetchScraperDocumentResult>;

type SaveStandaloneScraperCardToLibraryOptions = {
  scraper: ScraperRecord;
  detailsConfig: ScraperDetailsFeatureConfig | null;
  pagesConfig: ScraperPagesFeatureConfig | null;
  sourceUrl: string;
  fallbackTitle?: string | null;
  libraryMangas?: Manga[];
};

const getRendererApi = (): Record<string, unknown> => {
  if (typeof window === 'undefined') {
    return {};
  }

  return (window as any).api ?? {};
};

const notifyMangasUpdated = () => {
  try {
    window.dispatchEvent(new CustomEvent('mangas-updated'));
  } catch {
    // noop
  }
};

const getFetchScraperDocumentApi = (): FetchScraperDocumentApi => {
  const fetchScraperDocument = getRendererApi().fetchScraperDocument;
  if (typeof fetchScraperDocument !== 'function') {
    throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
  }

  return fetchScraperDocument as FetchScraperDocumentApi;
};

const normalizeTitle = (
  details: ScraperRuntimeDetailsResult,
  fallbackSourceUrl: string,
  chapter?: ScraperRuntimeChapterResult | null,
): string => {
  const baseTitle = String(details.title || fallbackSourceUrl || 'manga').trim() || 'manga';
  const chapterLabel = String(chapter?.label || '').trim();

  return chapterLabel ? `${baseTitle} - ${chapterLabel}` : baseTitle;
};

const normalizeFallbackTitle = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'manga';
};

export async function saveScraperMangaToLibrary({
  scraper,
  details,
  pageUrls,
  chapter = null,
  libraryMangas = [],
}: SaveScraperMangaToLibraryOptions): Promise<SaveScraperMangaToLibraryResult> {
  if (!Array.isArray(pageUrls) || pageUrls.length === 0) {
    throw new Error('Aucune page n\'a ete resolue pour ce manga.');
  }

  const api = getRendererApi();
  const addManga = api.addManga;
  const updateManga = api.updateManga;

  if (typeof addManga !== 'function' || typeof updateManga !== 'function') {
    throw new Error('La mise a jour de la bibliotheque est indisponible dans cette version.');
  }

  const sourceUrl = String(details.finalUrl || details.requestedUrl || '').trim();
  if (!sourceUrl) {
    throw new Error('Aucune URL source n\'est disponible pour ce manga.');
  }

  const linkedManga = findMangaLinkedToSource(libraryMangas, {
    scraperId: scraper.id,
    sourceUrl,
    sourceChapterUrl: chapter?.url ?? null,
    sourceChapterLabel: chapter?.label ?? null,
  });
  const title = normalizeTitle(details, sourceUrl, chapter);
  const thumbnailUrl = String(pageUrls[0] || chapter?.image || details.cover || '').trim() || undefined;
  const fallbackTagIds = Array.isArray(scraper.globalConfig.defaultTagIds)
    ? [...scraper.globalConfig.defaultTagIds]
    : [];

  if (linkedManga) {
    const updatedMangas = await (updateManga as (manga: Record<string, unknown>) => Promise<Manga[]>)({
      id: linkedManga.id,
      title,
      pages: pageUrls.length,
      language: linkedManga.language || scraper.globalConfig.defaultLanguage || null,
      tagIds: Array.isArray(linkedManga.tagIds) && linkedManga.tagIds.length > 0
        ? [...linkedManga.tagIds]
        : fallbackTagIds,
      chapters: chapter?.label ?? linkedManga.chapters ?? undefined,
      sourceKind: 'scraper',
      scraperId: scraper.id,
      sourceUrl,
      sourceChapterUrl: chapter?.url ?? null,
      sourceChapterLabel: chapter?.label ?? null,
      thumbnailUrl,
    });

    notifyMangasUpdated();
    return {
      manga: Array.isArray(updatedMangas)
        ? updatedMangas.find((manga) => manga.id === linkedManga.id) ?? null
        : null,
      created: false,
    };
  }

  const createdMangaId = generateId();
  const createdMangas = await (addManga as (manga: Record<string, unknown>) => Promise<Manga[]>)({
    id: createdMangaId,
    title,
    path: '',
    createdAt: new Date().toISOString(),
    currentPage: null,
    pages: pageUrls.length,
    language: scraper.globalConfig.defaultLanguage || null,
    authorIds: [],
    tagIds: fallbackTagIds,
    seriesId: null,
    chapters: chapter?.label ?? undefined,
    sourceKind: 'scraper',
    scraperId: scraper.id,
    sourceUrl,
    sourceChapterUrl: chapter?.url ?? null,
    sourceChapterLabel: chapter?.label ?? null,
    thumbnailUrl,
  });

  notifyMangasUpdated();
  return {
    manga: Array.isArray(createdMangas)
      ? createdMangas.find((manga) => manga.id === createdMangaId) ?? null
      : null,
    created: true,
  };
}

export async function saveStandaloneScraperCardToLibrary({
  scraper,
  detailsConfig,
  pagesConfig,
  sourceUrl,
  fallbackTitle,
  libraryMangas = [],
}: SaveStandaloneScraperCardToLibraryOptions): Promise<SaveScraperMangaToLibraryResult> {
  if (!sourceUrl.trim()) {
    throw new Error('Aucune URL source n\'est disponible pour ce manga.');
  }

  if (!detailsConfig?.titleSelector || !pagesConfig) {
    throw new Error('L\'ajout direct depuis une card requiert `Fiche` et `Pages`.');
  }

  const fetchScraperDocument = getFetchScraperDocumentApi();
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
  const details = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
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
    pagesConfig,
    async (request) => fetchScraperDocument(request),
  );
  const normalizedDetails = details.title
    ? details
    : {
      ...details,
      title: normalizeFallbackTitle(fallbackTitle),
    };

  return saveScraperMangaToLibrary({
    scraper,
    details: normalizedDetails,
    pageUrls,
    libraryMangas,
  });
}
