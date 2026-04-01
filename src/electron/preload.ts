import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    getLinks: () => ipcRenderer.invoke('get-links'),
    addLink: (link: { url: string; title: string; description?: string }) => ipcRenderer.invoke('add-link', link),
    removeLink: (linkId: string) => ipcRenderer.invoke('remove-link', linkId),
    // Mangas API
    getMangas: () => ipcRenderer.invoke('get-mangas'),
    addManga: (manga: any) => ipcRenderer.invoke('add-manga', manga),
    removeManga: (mangaId: string) => ipcRenderer.invoke('remove-manga', mangaId),
    updateManga: (manga: any) => ipcRenderer.invoke('update-manga', manga),
    getCover: (folderPath: string) => ipcRenderer.invoke('get-cover', folderPath),
    getCoverData: (folderPath: string) => ipcRenderer.invoke('get-cover-data', folderPath),
    countPages: (folderPath: string) => ipcRenderer.invoke('count-pages', folderPath),
    openDirectory: () => ipcRenderer.invoke('open-directory'),
    listPages: (folderPath: string) => ipcRenderer.invoke('list-pages', folderPath),
    copyImageToClipboard: (imagePathOrUrl: string) => ipcRenderer.invoke('copy-image-to-clipboard', imagePathOrUrl),
    copyTextToClipboard: (text: string) => ipcRenderer.invoke('copy-text-to-clipboard', text),
    // OCR
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
