import { Dispatch, SetStateAction, useCallback, useMemo } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  hasScraperFieldSelectorValue,
  ScraperChaptersFeatureConfig,
  ScraperDetailsFeatureConfig,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from '@/shared/scraper';
import type {
  ScraperListingReturnState,
  ScraperOpenReaderOptions,
} from '@/renderer/components/ScraperBrowser/types';
import { isScraperRuntimeChapterResult } from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import { buildScraperTemplateContextFromDetails } from '@/renderer/utils/scraperTemplateContext';
import { recordDetailsHistorySafe } from '@/renderer/utils/history';
import { resolveScraperReaderPageUrls } from '@/renderer/utils/scraperReaderPages';
import {
  buildReaderWorkspaceTarget,
  buildReaderPath,
  openWorkspaceTarget,
} from '@/renderer/utils/workspaceTargets';
import type { ReaderWorkspaceTarget, WorkspaceTarget } from '@/renderer/types/workspace';
import {
  createScraperMangaId,
  createScraperRuntimeImageThumbnail,
  extractScraperDetailsFromDocumentWithImageFallbacks,
  extractScraperDetailsThumbnailsPageFromDocument,
  getScraperRuntimeThumbnailKey,
  hasRenderableDetails,
  resolveScraperChapters,
  resolveScraperDetailsTargetUrl,
  resolveScraperPageUrls,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeThumbnail,
} from '@/renderer/utils/scraperRuntime';

type UseScraperBrowserDetailsOptions = {
  scraper: ScraperRecord;
  query: string;
  detailsConfig: ScraperDetailsFeatureConfig | null;
  chaptersConfig: ScraperChaptersFeatureConfig | null;
  pagesConfig: ScraperPagesFeatureConfig | null;
  usesChaptersForPages: boolean;
  locationPathname: string;
  locationSearch: string;
  navigate: NavigateFunction;
  onOpenReaderTarget?: (target: ReaderWorkspaceTarget, options?: { returnTarget?: WorkspaceTarget }) => void;
  listingReturnState: ScraperListingReturnState | null;
  detailsResult: ScraperRuntimeDetailsResult | null;
  chaptersResult: ScraperRuntimeChapterResult[];
  clearFeedback: () => void;
  resetListingState: () => void;
  resetDetailsState: () => void;
  setListingReturnState: Dispatch<SetStateAction<ScraperListingReturnState | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  setDownloadError: Dispatch<SetStateAction<string | null>>;
  setDownloadMessage: Dispatch<SetStateAction<string | null>>;
  setDownloading: Dispatch<SetStateAction<boolean>>;
  setOpeningReader: Dispatch<SetStateAction<boolean>>;
  setLoadingMoreThumbnails: Dispatch<SetStateAction<boolean>>;
  setDetailsResult: Dispatch<SetStateAction<ScraperRuntimeDetailsResult | null>>;
  setChaptersResult: Dispatch<SetStateAction<ScraperRuntimeChapterResult[]>>;
};

type DetailsLookupOptions = {
  canCommit?: () => boolean;
};

type DownloadOptions = {
  replaceMangaId?: string | null;
};

const normalizeRequestedReaderPage = (
  value: number | undefined,
  totalPages: number,
): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || totalPages <= 0) {
    return null;
  }

  return Math.max(1, Math.min(totalPages, Math.floor(value)));
};

const mergeUniqueThumbnails = (values: ScraperRuntimeThumbnail[]): ScraperRuntimeThumbnail[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = getScraperRuntimeThumbnailKey(value);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export function useScraperBrowserDetails({
  scraper,
  query,
  detailsConfig,
  chaptersConfig,
  pagesConfig,
  usesChaptersForPages,
  locationPathname,
  locationSearch,
  navigate,
  onOpenReaderTarget,
  listingReturnState,
  detailsResult,
  chaptersResult,
  clearFeedback,
  resetListingState,
  resetDetailsState,
  setListingReturnState,
  setLoading,
  setRuntimeError,
  setDownloadError,
  setDownloadMessage,
  setDownloading,
  setOpeningReader,
  setLoadingMoreThumbnails,
  setDetailsResult,
  setChaptersResult,
}: UseScraperBrowserDetailsOptions) {
  const currentDetailsUrl = useMemo(
    () => detailsResult?.finalUrl || detailsResult?.requestedUrl || '',
    [detailsResult],
  );

  const loadDetailsFromTargetUrl = useCallback(async (
    targetUrl: string,
    options?: DetailsLookupOptions,
  ) => {
    const canCommit = options?.canCommit ?? (() => true);
    if (!canCommit()) {
      return;
    }

    clearFeedback();
    resetListingState();
    resetDetailsState();

    if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.titleSelector)) {
      setRuntimeError('Le composant Fiche n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
    if (typeof fetchScraperDocument !== 'function') {
      setRuntimeError('Le runtime du scrapper n\'est pas disponible dans cette version.');
      return;
    }

    setLoading(true);

    try {
      const documentResult = await fetchScraperDocument({
        baseUrl: scraper.baseUrl,
        targetUrl,
      });

      if (!canCommit()) {
        return;
      }

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
      const extractedDetails = await extractScraperDetailsFromDocumentWithImageFallbacks(documentNode, detailsConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
        status: documentResult.status,
        contentType: documentResult.contentType,
        html: documentResult.html,
      }, async (request) => fetchScraperDocument(request));
      const extractedChapters = chaptersConfig
        ? await (async () => {
          try {
            const chaptersResolution = await resolveScraperChapters(
              scraper.baseUrl,
              extractedDetails.finalUrl || extractedDetails.requestedUrl,
              chaptersConfig,
              buildScraperTemplateContextFromDetails(extractedDetails),
              async (request) => fetchScraperDocument(request),
            );

            if (!chaptersResolution.sourceResult.ok || !chaptersResolution.sourceResult.html) {
              console.warn('Scraper chapters source fetch failed', chaptersResolution.sourceResult);
              return [];
            }

            return chaptersResolution.chapters;
          } catch (error) {
            console.warn('Scraper chapters extraction failed', error);
            return [];
          }
        })()
        : [];

      if (!canCommit()) {
        return;
      }

      if (!hasRenderableDetails(extractedDetails)) {
        setRuntimeError('La fiche a bien ete chargee, mais aucun contenu exploitable n\'a ete extrait avec la configuration actuelle.');
        return;
      }

      setDetailsResult(extractedDetails);
      setChaptersResult(extractedChapters);
      void recordDetailsHistorySafe({
        scraperId: scraper.id,
        sourceUrl: extractedDetails.finalUrl || extractedDetails.requestedUrl || targetUrl,
        title: extractedDetails.title || targetUrl,
        cover: extractedDetails.cover,
      });
    } catch (error) {
      if (canCommit()) {
        setRuntimeError(error instanceof Error ? error.message : 'Echec temporaire du scrapper.');
      }
    } finally {
      if (canCommit()) {
        setLoading(false);
      }
    }
  }, [
    chaptersConfig,
    clearFeedback,
    detailsConfig,
    resetDetailsState,
    resetListingState,
    scraper.baseUrl,
    scraper.id,
    setChaptersResult,
    setDetailsResult,
    setLoading,
    setRuntimeError,
  ]);

  const runDetailsLookup = useCallback(async (
    nextQuery: string,
    options?: DetailsLookupOptions,
  ) => {
    const canCommit = options?.canCommit ?? (() => true);
    if (!canCommit()) {
      return;
    }

    setListingReturnState(null);

    if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.titleSelector)) {
      setRuntimeError('Le composant Fiche n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = resolveScraperDetailsTargetUrl(scraper.baseUrl, detailsConfig, nextQuery);
    } catch (error) {
      if (canCommit()) {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible de construire l\'URL de la fiche.');
      }
      return;
    }

    await loadDetailsFromTargetUrl(targetUrl, options);
  }, [detailsConfig, loadDetailsFromTargetUrl, scraper.baseUrl, setListingReturnState, setRuntimeError]);

  const resolveCurrentPageUrls = useCallback(async (
    chapter?: ScraperRuntimeChapterResult | null,
  ): Promise<string[]> => {
    if (!detailsResult) {
      throw new Error('Charge d\'abord une fiche avant de lire ou telecharger le manga.');
    }

    if (!pagesConfig) {
      throw new Error('Le composant Pages n\'est pas encore configure pour ce scrapper.');
    }

    const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
    if (typeof fetchScraperDocument !== 'function') {
      throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
    }

    return resolveScraperPageUrls(
      scraper,
      detailsResult,
      pagesConfig,
      async (request) => fetchScraperDocument(request),
      {
        chapter: chapter ?? null,
        thumbnailsNextPageSelector: detailsConfig?.thumbnailsNextPageSelector,
      },
    );
  }, [detailsConfig?.thumbnailsNextPageSelector, detailsResult, pagesConfig, scraper]);

  const handleDownload = useCallback(async (
    chapter?: ScraperRuntimeChapterResult,
    options?: DownloadOptions,
  ) => {
    const queueDownloadApi = (window as any).api?.queueScraperDownload
      || (window as any).api?.downloadScraperManga;
    const normalizedChapter = isScraperRuntimeChapterResult(chapter) ? chapter : undefined;

    if (typeof queueDownloadApi !== 'function') {
      setDownloadError('Le telechargement du scrapper n\'est pas disponible dans cette version.');
      return;
    }

    setDownloading(true);
    setDownloadError(null);
    setDownloadMessage(null);

    try {
      const pageUrls = await resolveCurrentPageUrls(normalizedChapter);
      const downloadTitle = normalizedChapter?.label
        ? `${detailsResult?.title || query.trim() || 'manga'} - ${normalizedChapter.label}`
        : detailsResult?.title || query.trim() || 'manga';

      const queueResult = await queueDownloadApi({
        title: downloadTitle,
        pageUrls,
        refererUrl: detailsResult?.finalUrl || detailsResult?.requestedUrl,
        scraperId: scraper.id,
        scraperName: scraper.name,
        sourceUrl: detailsResult?.finalUrl || detailsResult?.requestedUrl,
        sourceChapterUrl: normalizedChapter?.url,
        sourceChapterLabel: normalizedChapter?.label,
        replaceMangaId: options?.replaceMangaId || undefined,
        defaultTagIds: scraper.globalConfig.defaultTagIds,
        defaultLanguage: detailsResult?.languageCodes?.[0] || scraper.globalConfig.defaultLanguage,
        autoAssignSeriesOnChapterDownload: scraper.globalConfig.chapterDownloads.autoAssignSeries,
        seriesTitle: detailsResult?.title || query.trim() || 'manga',
        chapterLabel: normalizedChapter?.label,
        thumbnailUrl: normalizedChapter
          ? (detailsResult?.cover || normalizedChapter.image)
          : undefined,
      });
      const activeJobs = Number(queueResult?.status?.counts?.active || 0);
      const isChapterDownload = Boolean(normalizedChapter?.label);
      const isReplacement = Boolean(options?.replaceMangaId);
      const statusLabel = queueResult?.job?.status === 'running'
        ? 'demarre'
        : 'a ete ajoute a la file';

      setDownloadMessage(
        `${isReplacement ? 'Le remplacement local' : isChapterDownload ? 'Le telechargement du chapitre' : 'Le telechargement du manga'} ${statusLabel}. `
        + `${activeJobs > 0 ? `${activeJobs} job(s) actif(s). ` : ''}`
        + 'Suis l\'avancement depuis "Telechargements" en haut de l\'accueil.',
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Le telechargement du manga a echoue.');
    } finally {
      setDownloading(false);
    }
  }, [
    detailsResult,
    query,
    resolveCurrentPageUrls,
    scraper.globalConfig.chapterDownloads.autoAssignSeries,
    scraper.globalConfig.defaultLanguage,
    scraper.globalConfig.defaultTagIds,
    scraper.id,
    scraper.name,
    setDownloadError,
    setDownloadMessage,
    setDownloading,
  ]);

  const handleLoadMoreThumbnails = useCallback(async () => {
    setLoadingMoreThumbnails(true);
    clearFeedback();

    try {
      if (!detailsResult) {
        return;
      }

      if (!detailsResult.thumbnailsNextPageUrl) {
        if (!pagesConfig || usesChaptersForPages) {
          return;
        }

        const pageUrls = await resolveCurrentPageUrls();
        if (!pageUrls.length) {
          setRuntimeError('Aucune page supplementaire n\'a ete resolue.');
          return;
        }

        setDetailsResult((previous) => (
          previous
            ? {
              ...previous,
              thumbnails: pageUrls.map(createScraperRuntimeImageThumbnail),
              thumbnailsNextPageUrl: undefined,
            }
            : previous
        ));
        return;
      }

      if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.thumbnailsSelector)) {
        setRuntimeError('Le selecteur des vignettes est requis pour charger la suite.');
        return;
      }

      const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
      if (typeof fetchScraperDocument !== 'function') {
        setRuntimeError('Le runtime du scrapper n\'est pas disponible dans cette version.');
        return;
      }

      const documentResult = await fetchScraperDocument({
        baseUrl: scraper.baseUrl,
        targetUrl: detailsResult.thumbnailsNextPageUrl,
      });

      if (!documentResult?.ok || !documentResult.html) {
        setRuntimeError(
          documentResult?.error
            || (typeof documentResult?.status === 'number'
              ? `La page de vignettes a repondu avec le code HTTP ${documentResult.status}.`
              : 'Impossible de charger la page de vignettes suivante.'),
        );
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, 'text/html');
      const thumbnailsPage = extractScraperDetailsThumbnailsPageFromDocument(documentNode, detailsConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
      });

      if (!thumbnailsPage.thumbnails.length && !thumbnailsPage.nextPageUrl) {
        setRuntimeError('Aucune vignette supplementaire n\'a ete trouvee.');
        return;
      }

      setDetailsResult((previous) => {
        if (!previous) {
          return previous;
        }

        const currentThumbnails = previous.thumbnails ?? [];
        const nextThumbnails = mergeUniqueThumbnails([
          ...currentThumbnails,
          ...thumbnailsPage.thumbnails,
        ]);
        const nextPageUrl = thumbnailsPage.nextPageUrl === previous.thumbnailsNextPageUrl
          ? undefined
          : thumbnailsPage.nextPageUrl;

        return {
          ...previous,
          thumbnails: nextThumbnails,
          thumbnailsNextPageUrl: nextPageUrl,
        };
      });
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de charger la suite des vignettes.');
    } finally {
      setLoadingMoreThumbnails(false);
    }
  }, [
    clearFeedback,
    detailsConfig,
    detailsResult,
    pagesConfig,
    resolveCurrentPageUrls,
    scraper.baseUrl,
    setDetailsResult,
    setLoadingMoreThumbnails,
    setRuntimeError,
    usesChaptersForPages,
  ]);

  const handleOpenReader = useCallback(async (options?: ScraperOpenReaderOptions) => {
    if (!detailsResult) {
      setRuntimeError('Charge d\'abord une fiche avant d\'ouvrir le lecteur.');
      return;
    }

    const normalizedChapter = isScraperRuntimeChapterResult(options?.chapter) ? options?.chapter : undefined;

    if (!pagesConfig) {
      setRuntimeError('Le composant Pages n\'est pas encore configure pour ce scrapper.');
      return;
    }

    setOpeningReader(true);
    clearFeedback();

    try {
      const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
      if (typeof fetchScraperDocument !== 'function') {
        throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
      }

      const sourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl;
      const readerMangaId = createScraperMangaId(
        scraper.id,
        sourceUrl,
        usesChaptersForPages ? normalizedChapter?.url : null,
      );
      const savedProgress = (window as any).api
        && typeof (window as any).api.getScraperReaderProgress === 'function'
        ? await (window as any).api.getScraperReaderProgress(readerMangaId)
        : null;
      const preferredInitialPage = options?.page ?? savedProgress?.currentPage ?? 1;
      const pageUrls = await resolveScraperReaderPageUrls(
        scraper,
        detailsResult,
        pagesConfig,
        async (request) => fetchScraperDocument(request),
        {
          chapter: normalizedChapter ?? null,
          initialPage: preferredInitialPage,
          knownTotalPages: savedProgress?.totalPages,
          thumbnailsNextPageSelector: detailsConfig?.thumbnailsNextPageSelector,
        },
      );
      const requestedPage = normalizeRequestedReaderPage(options?.page, pageUrls.length);
      const initialPage = requestedPage
        ?? (typeof savedProgress?.currentPage === 'number' && savedProgress.currentPage > 0
          ? savedProgress.currentPage
          : 1);

      const readerLocationState = {
        from: {
          pathname: locationPathname,
          search: locationSearch,
        },
        mangaId: readerMangaId,
        scraperBrowserReturn: {
          scraperId: scraper.id,
          query,
          detailsResult,
          chaptersResult,
          listingReturnState,
        },
        scraperReader: {
          id: readerMangaId,
          scraperId: scraper.id,
          title: detailsResult.title || query.trim() || 'manga',
          sourceUrl,
          cover: detailsResult.cover,
          language: detailsResult.languageCodes?.[0] || scraper.globalConfig.defaultLanguage || null,
          pageUrls,
          chapter: normalizedChapter,
          bookmarkExcludedFields: scraper.globalConfig.bookmark.excludedFields,
          ignoreSavedProgress: requestedPage !== null,
        },
      };

      const readerTarget = buildReaderWorkspaceTarget({
        mangaId: readerMangaId,
        page: initialPage,
        title: readerLocationState.scraperReader.title,
        locationState: readerLocationState,
      });

      if (options?.openInWorkspace) {
        const opened = await openWorkspaceTarget(readerTarget);

        if (!opened) {
          throw new Error('L\'ouverture du lecteur dans un onglet workspace n\'est pas disponible dans cette version.');
        }
        return;
      }

      if (onOpenReaderTarget) {
        onOpenReaderTarget(readerTarget, {
          returnTarget: {
            kind: 'scraper.details',
            scraperId: scraper.id,
            sourceUrl,
            title: detailsResult.title || query.trim() || sourceUrl,
          },
        });
        return;
      }

      navigate(
        buildReaderPath(readerMangaId, initialPage),
        {
          state: readerLocationState,
        },
      );
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir le lecteur.');
    } finally {
      setOpeningReader(false);
    }
  }, [
    chaptersResult,
    clearFeedback,
    detailsConfig?.thumbnailsNextPageSelector,
    detailsResult,
    locationPathname,
    locationSearch,
    navigate,
    onOpenReaderTarget,
    pagesConfig,
    query,
    scraper.globalConfig.bookmark.excludedFields,
    scraper.id,
    scraper,
    listingReturnState,
    setOpeningReader,
    setRuntimeError,
    usesChaptersForPages,
  ]);

  return {
    currentDetailsUrl,
    loadDetailsFromTargetUrl,
    runDetailsLookup,
    resolveCurrentPageUrls,
    handleDownload,
    handleLoadMoreThumbnails,
    handleOpenReader,
  };
}

export default useScraperBrowserDetails;
