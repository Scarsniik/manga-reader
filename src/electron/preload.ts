import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from "electron";
import type {
    DownloadScraperMangaRequest,
    FetchScraperDocumentRequest,
    RecordScraperCardsSeenRequest,
    RemoveScraperAuthorFavoriteRequest,
    RemoveScraperAuthorFavoriteSourceRequest,
    RemoveScraperBookmarkRequest,
    SaveScraperAuthorFavoriteRequest,
    SaveScraperBookmarkRequest,
    SaveScraperGlobalConfigRequest,
    SaveScraperReaderProgressRequest,
    SaveScraperDraftRequest,
    SaveScraperFeatureRequest,
    ScraperAccessValidationRequest,
    SetScraperCardReadRequest,
} from './scraper';

type WindowState = {
    isFocused: boolean;
    isFullScreen: boolean;
    isMaximized: boolean;
    isMinimized: boolean;
};

type WindowStateChangeListener = (state: WindowState) => void;

type ScraperConfigWorkspaceTarget = {
    kind: "scraper.config";
    scraperId: string;
    title?: string;
};

type ScraperDetailsWorkspaceTarget = {
    kind: "scraper.details";
    scraperId: string;
    sourceUrl: string;
    title?: string;
};

type ScraperAuthorWorkspaceTarget = {
    kind: "scraper.author";
    scraperId: string;
    query: string;
    title?: string;
    templateContext?: Record<string, string | undefined>;
};

type WorkspaceTarget =
    | ScraperConfigWorkspaceTarget
    | ScraperDetailsWorkspaceTarget
    | ScraperAuthorWorkspaceTarget;

type WorkspaceTargetListener = (target: WorkspaceTarget) => void;

const workspaceTargetListeners = new Set<WorkspaceTargetListener>();
const queuedWorkspaceTargets: WorkspaceTarget[] = [];

const onWindowStateChanged = (callback: WindowStateChangeListener) => {
    const handler = (_event: IpcRendererEvent, state: WindowState) => {
        callback(state);
    };

    ipcRenderer.on("window-state-changed", handler);

    return () => {
        ipcRenderer.removeListener("window-state-changed", handler);
    };
};

const onWorkspaceOpenTarget = (callback: WorkspaceTargetListener) => {
    workspaceTargetListeners.add(callback);

    const queuedTargets = queuedWorkspaceTargets.splice(0, queuedWorkspaceTargets.length);
    queuedTargets.forEach(callback);

    return () => {
        workspaceTargetListeners.delete(callback);
    };
};

ipcRenderer.on("workspace-open-target", (_event: IpcRendererEvent, target: WorkspaceTarget) => {
    if (workspaceTargetListeners.size === 0) {
        queuedWorkspaceTargets.push(target);
        return;
    }

    workspaceTargetListeners.forEach((listener) => listener(target));
});

ipcRenderer.on('mangas-updated', () => {
    try {
        window.dispatchEvent(new CustomEvent('mangas-updated'));
    } catch (error) {
        console.warn('preload: failed to dispatch mangas-updated event', error);
    }
});

ipcRenderer.on('scrapers-updated', () => {
    try {
        window.dispatchEvent(new CustomEvent('scrapers-updated'));
    } catch (error) {
        console.warn('preload: failed to dispatch scrapers-updated event', error);
    }
});

ipcRenderer.on('scraper-bookmarks-updated', () => {
    try {
        window.dispatchEvent(new CustomEvent('scraper-bookmarks-updated'));
    } catch (error) {
        console.warn('preload: failed to dispatch scraper-bookmarks-updated event', error);
    }
});

ipcRenderer.on('scraper-author-favorites-updated', () => {
    try {
        window.dispatchEvent(new CustomEvent('scraper-author-favorites-updated'));
    } catch (error) {
        console.warn('preload: failed to dispatch scraper-author-favorites-updated event', error);
    }
});

ipcRenderer.on('scraper-view-history-updated', () => {
    try {
        window.dispatchEvent(new CustomEvent('scraper-view-history-updated'));
    } catch (error) {
        console.warn('preload: failed to dispatch scraper-view-history-updated event', error);
    }
});

ipcRenderer.on('ocr-runtime-notification', (_event: IpcRendererEvent, payload: unknown) => {
    try {
        window.dispatchEvent(new CustomEvent('ocr-runtime-notification', { detail: payload }));
    } catch (error) {
        console.warn('preload: failed to dispatch ocr-runtime-notification event', error);
    }
});

ipcRenderer.on("app-update-notification", (_event: IpcRendererEvent, payload: unknown) => {
    try {
        window.dispatchEvent(new CustomEvent("app-update-notification", { detail: payload }));
    } catch (error) {
        console.warn("preload: failed to dispatch app-update-notification event", error);
    }
});

ipcRenderer.on('series-updated', () => {
    try {
        window.dispatchEvent(new CustomEvent('series-updated'));
    } catch (error) {
        console.warn('preload: failed to dispatch series-updated event', error);
    }
});

contextBridge.exposeInMainWorld('api', {
    getLinks: () => ipcRenderer.invoke('get-links'),
    addLink: (link: { url: string; title: string; description?: string }) => ipcRenderer.invoke('add-link', link),
    removeLink: (linkId: string) => ipcRenderer.invoke('remove-link', linkId),
    openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
    openJsonDocument: (request: { filename?: string; content: string }) => ipcRenderer.invoke("open-json-document", request),
    // Window controls
    getAppRuntimeInfo: () => ipcRenderer.invoke("app-runtime-info"),
    getWindowState: () => ipcRenderer.invoke("window-get-state"),
    minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
    toggleMaximizeWindow: () => ipcRenderer.invoke("window-toggle-maximize"),
    closeWindow: () => ipcRenderer.invoke("window-close"),
    toggleDevTools: () => ipcRenderer.invoke("window-toggle-devtools"),
    onWindowStateChanged,
    openWorkspaceTarget: (target: WorkspaceTarget) => ipcRenderer.invoke("workspace-open-target", target),
    onWorkspaceOpenTarget,
    // Mangas API
    getMangas: () => ipcRenderer.invoke('get-mangas'),
    addManga: (manga: any) => ipcRenderer.invoke('add-manga', manga),
    removeManga: (mangaId: string) => ipcRenderer.invoke('remove-manga', mangaId),
    updateManga: (manga: any) => ipcRenderer.invoke('update-manga', manga),
    getCover: (folderPath: string) => ipcRenderer.invoke('get-cover', folderPath),
    getCoverData: (folderPath: string) => ipcRenderer.invoke('get-cover-data', folderPath),
    countPages: (folderPath: string) => ipcRenderer.invoke('count-pages', folderPath),
    openDirectory: () => ipcRenderer.invoke('open-directory'),
    openFile: () => ipcRenderer.invoke('open-file'),
    openPath: (targetPath: string) => ipcRenderer.invoke('open-path', targetPath),
    openUserDataDirectory: () => ipcRenderer.invoke("open-user-data-directory"),
    listPages: (folderPath: string) => ipcRenderer.invoke('list-pages', folderPath),
    copyImageToClipboard: (imagePathOrUrl: string) => ipcRenderer.invoke('copy-image-to-clipboard', imagePathOrUrl),
    copyTextToClipboard: (text: string) => ipcRenderer.invoke('copy-text-to-clipboard', text),
    // OCR
    ocrRuntimeDefaults: () => ipcRenderer.invoke('ocr-runtime-defaults'),
    ocrRuntimeStatus: () => ipcRenderer.invoke('ocr-runtime-status'),
    ocrRuntimeMarkSkipped: () => ipcRenderer.invoke('ocr-runtime-mark-skipped'),
    ocrRuntimeReadManifest: (request?: Record<string, any>) => ipcRenderer.invoke('ocr-runtime-read-manifest', request),
    ocrRuntimeInstallStatus: () => ipcRenderer.invoke('ocr-runtime-install-status'),
    ocrRuntimeStartInstall: (request?: Record<string, any>) => ipcRenderer.invoke('ocr-runtime-start-install', request),
    ocrRuntimeCancelInstall: () => ipcRenderer.invoke('ocr-runtime-cancel-install'),
    ocrRuntimeOpenInstallLog: () => ipcRenderer.invoke('ocr-runtime-open-install-log'),
    ocrRuntimeVerify: () => ipcRenderer.invoke('ocr-runtime-verify'),
    ocrRuntimeRepair: (request?: Record<string, any>) => ipcRenderer.invoke('ocr-runtime-repair', request),
    ocrRuntimeUninstall: (request?: Record<string, any>) => ipcRenderer.invoke('ocr-runtime-uninstall', request),
    ocrRecognize: (imagePathOrDataUrl: string, options?: Record<string, any>) => ipcRenderer.invoke('ocr-recognize', imagePathOrDataUrl, options),
    ocrAddManualSelections: (payload?: Record<string, any>) => ipcRenderer.invoke('ocr-add-manual-selections', payload),
    ocrDeleteManualSelection: (payload?: Record<string, any>) => ipcRenderer.invoke('ocr-delete-manual-selection', payload),
    ocrGetMangaStatus: (mangaId: string) => ipcRenderer.invoke('ocr-get-manga-status', mangaId),
    ocrGetMangaCompletionMap: (mangaIds?: string[]) => ipcRenderer.invoke('ocr-get-manga-completion-map', mangaIds),
    ocrStartManga: (mangaId: string, options?: Record<string, any>) => ipcRenderer.invoke('ocr-start-manga', mangaId, options),
    ocrReadMangaVocabulary: (mangaId: string) => ipcRenderer.invoke('ocr-read-manga-vocabulary', mangaId),
    ocrExtractMangaVocabulary: (mangaId: string, options?: Record<string, any>) => ipcRenderer.invoke('ocr-extract-manga-vocabulary', mangaId, options),
    ocrStartLibrary: (options?: Record<string, any>) => ipcRenderer.invoke('ocr-start-library', options),
    ocrQueueStatus: () => ipcRenderer.invoke('ocr-queue-status'),
    ocrPauseJob: (jobId: string) => ipcRenderer.invoke('ocr-pause-job', jobId),
    ocrResumeJob: (jobId: string) => ipcRenderer.invoke('ocr-resume-job', jobId),
    ocrCancelJob: (jobId: string) => ipcRenderer.invoke('ocr-cancel-job', jobId),
    ocrCancelAllJobs: () => ipcRenderer.invoke('ocr-cancel-all-jobs'),
    ocrTerminate: () => ipcRenderer.invoke('ocr-terminate'),
    // Settings API
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
    appUpdateStatus: () => ipcRenderer.invoke("app-update-status"),
    appUpdateCheck: () => ipcRenderer.invoke("app-update-check"),
    appUpdateDownload: () => ipcRenderer.invoke("app-update-download"),
    appUpdateInstall: () => ipcRenderer.invoke("app-update-install"),
    appUpdateOpenReleasePage: () => ipcRenderer.invoke("app-update-open-release-page"),
    appUpdateGetPatchNotes: (query?: Record<string, unknown>) => ipcRenderer.invoke("app-update-get-patch-notes", query),
    // Scrapers API
    validateScraperAccess: (request: ScraperAccessValidationRequest) => ipcRenderer.invoke('validate-scraper-access', request),
    getScrapers: () => ipcRenderer.invoke('get-scrapers'),
    getScraperBookmarks: (scraperId?: string | null) => ipcRenderer.invoke('get-scraper-bookmarks', scraperId),
    saveScraperBookmark: (request: SaveScraperBookmarkRequest) => ipcRenderer.invoke('save-scraper-bookmark', request),
    removeScraperBookmark: (request: RemoveScraperBookmarkRequest) => ipcRenderer.invoke('remove-scraper-bookmark', request),
    getScraperAuthorFavorites: () => ipcRenderer.invoke('get-scraper-author-favorites'),
    saveScraperAuthorFavorite: (request: SaveScraperAuthorFavoriteRequest) => ipcRenderer.invoke('save-scraper-author-favorite', request),
    removeScraperAuthorFavorite: (request: RemoveScraperAuthorFavoriteRequest) => ipcRenderer.invoke('remove-scraper-author-favorite', request),
    removeScraperAuthorFavoriteSource: (request: RemoveScraperAuthorFavoriteSourceRequest) => ipcRenderer.invoke('remove-scraper-author-favorite-source', request),
    getScraperViewHistory: (scraperId?: string | null) => ipcRenderer.invoke('get-scraper-view-history', scraperId),
    recordScraperCardsSeen: (request: RecordScraperCardsSeenRequest) => ipcRenderer.invoke('record-scraper-cards-seen', request),
    setScraperCardRead: (request: SetScraperCardReadRequest) => ipcRenderer.invoke('set-scraper-card-read', request),
    deleteScraper: (scraperId: string) => ipcRenderer.invoke('delete-scraper', scraperId),
    saveScraperDraft: (request: SaveScraperDraftRequest) => ipcRenderer.invoke('save-scraper-draft', request),
    fetchScraperDocument: (request: FetchScraperDocumentRequest) => ipcRenderer.invoke('fetch-scraper-document', request),
    saveScraperFeatureConfig: (request: SaveScraperFeatureRequest) => ipcRenderer.invoke('save-scraper-feature-config', request),
    saveScraperGlobalConfig: (request: SaveScraperGlobalConfigRequest) => ipcRenderer.invoke('save-scraper-global-config', request),
    getScraperReaderProgress: (scraperMangaId: string) => ipcRenderer.invoke('get-scraper-reader-progress', scraperMangaId),
    getScraperReaderProgressRecords: (scraperId?: string | null) => ipcRenderer.invoke('get-scraper-reader-progress-records', scraperId),
    saveScraperReaderProgress: (request: SaveScraperReaderProgressRequest) => ipcRenderer.invoke('save-scraper-reader-progress', request),
    downloadScraperManga: (request: DownloadScraperMangaRequest) => ipcRenderer.invoke('download-scraper-manga', request),
    queueScraperDownload: (request: DownloadScraperMangaRequest) => ipcRenderer.invoke('download-scraper-manga', request),
    getScraperDownloadQueueStatus: () => ipcRenderer.invoke('scraper-download-queue-status'),
    cancelScraperDownloadJob: (jobId: string) => ipcRenderer.invoke('scraper-download-cancel-job', jobId),
    cancelAllScraperDownloadJobs: () => ipcRenderer.invoke('scraper-download-cancel-all-jobs'),
    // Authors API
    getAuthors: () => ipcRenderer.invoke('get-authors'),
    addAuthor: (author: any) => ipcRenderer.invoke('add-author', author),
    removeAuthor: (authorId: string) => ipcRenderer.invoke('remove-author', authorId),
    updateAuthor: (author: any) => ipcRenderer.invoke('update-author', author),
    // Tags API
    getTags: () => ipcRenderer.invoke('get-tags'),
    addTag: (tag: any) => ipcRenderer.invoke('add-tag', tag),
    removeTag: (tagId: string) => ipcRenderer.invoke('remove-tag', tagId),
    updateTag: (tag: any) => ipcRenderer.invoke('update-tag', tag),
    batchUpdateTags: (payload: any) => ipcRenderer.invoke('batch-update-tags', payload),
    // Series API
    getSeries: () => ipcRenderer.invoke('get-series'),
    addSeries: (series: any) => ipcRenderer.invoke('add-series', series),
    removeSeries: (seriesId: string) => ipcRenderer.invoke('remove-series', seriesId),
    updateSeries: (series: any) => ipcRenderer.invoke('update-series', series),
    // Try to obtain absolute path for a DOM File using Electron's webUtils
    getPathForFile: (file: any) => {
        try {
            // require here because preload runs in Node context
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { webUtils } = require('electron');
            if (webUtils && typeof webUtils.getPathForFile === 'function') {
                return webUtils.getPathForFile(file) || '';
            }
            return '';
        } catch (err) {
            console.error('preload.getPathForFile: webUtils not available', err);
            return '';
        }
    },
});
