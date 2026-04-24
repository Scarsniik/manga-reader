import useRefresh from '@/renderer/hooks/useRefresh';
import { useEffect, useState, useCallback } from 'react';
import type { LibrarySearchFilterState, SavedLibrarySearch, SavedScraperSearch } from '@/renderer/types';

export type AppParams = {
    libraryPath?: string;
    lastHomeSearch?: string | null;
    showPageNumbers?: boolean;
    showHiddens?: boolean;
    titleLineCount?: number;
    readerOcrPreloadPageCount?: number;
    readerImagePreloadPageCount?: number;
    readerImageMaxWidth?: number;
    readerShowProgressIndicator?: boolean;
    readerScrollStrength?: number;
    readerOpenOcrPanelForJapaneseManga?: boolean;
    readerPreloadPageCount?: number;
    readerOcrDetectedSectionOpen?: boolean;
    readerOcrManualSectionOpen?: boolean;
    ocrAutoRunOnImport?: boolean;
    ocrAutoAssignJapaneseLanguage?: boolean;
    persistMangaFilters?: boolean;
    showSavedLibrarySearches?: boolean;
    savedLibrarySearches?: SavedLibrarySearch[];
    showSavedScraperSearches?: boolean;
    savedScraperSearches?: SavedScraperSearch[];
    mangaListFilters?: LibrarySearchFilterState | null;
    [key: string]: any;
};

type SetParamsOptions = {
    broadcast?: boolean;
    remount?: boolean;
};

type SettingsUpdatedEventDetail = {
    settings?: AppParams;
    remount?: boolean;
};

export function useParams() {
    const [params, setParamsState] = useState<AppParams | null>(null);
    const [loading, setLoading] = useState(true);

    const {refresh} = useRefresh();

    const dispatchSettingsUpdated = useCallback((detail?: SettingsUpdatedEventDetail) => {
        try {
            window.dispatchEvent(new CustomEvent('settings-updated', { detail }));
        } catch (e) {
            /* noop */
        }
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            if (window.api && typeof window.api.getSettings === 'function') {
                const s = await window.api.getSettings();
                setParamsState(s || {});
            } else {
                // Fallback to empty
                setParamsState({});
            }
        } catch (err) {
            console.error('useParams: failed to load settings', err);
            setParamsState({});
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const onSettingsUpdated = (event: Event) => {
            const detail = event instanceof CustomEvent
                ? event.detail as SettingsUpdatedEventDetail | undefined
                : undefined;

            if (detail?.settings && typeof detail.settings === 'object') {
                setParamsState(detail.settings);
            }
        };

        window.addEventListener('settings-updated', onSettingsUpdated as EventListener);
        return () => window.removeEventListener('settings-updated', onSettingsUpdated as EventListener);
    }, []);

    const save = useCallback(async (next: AppParams) => {
        try {
            if (window.api && typeof window.api.saveSettings === 'function') {
                const persisted = await window.api.saveSettings(next);
                const nextSettings = persisted && typeof persisted === 'object'
                    ? persisted as AppParams
                    : next;
                setParamsState(nextSettings);
                dispatchSettingsUpdated({ settings: nextSettings });
                refresh();
                return nextSettings;
            }
            // Fallback: store in-memory
            setParamsState(next);
            dispatchSettingsUpdated({ settings: next, remount: false });
            return next;
        } catch (err) {
            console.error('useParams: failed to save settings', err);
            throw err;
        }
    }, [dispatchSettingsUpdated, refresh]);

    // setParams accepts a Partial of AppParams, applies an optimistic update and saves in background
    const setParams = useCallback((partial: Partial<AppParams>, options?: SetParamsOptions) => {
        const { broadcast = true, remount = true } = options || {};
        const current = params || {};
        const next = { ...current, ...partial } as AppParams;

        // Optimistically update local state so UI is responsive (checkboxes, inputs)
        setParamsState(next);

        // Persist in background; do not toggle loading state here
        (async () => {
            try {
                if (window.api && typeof window.api.saveSettings === 'function') {
                    const persisted = await window.api.saveSettings(partial);
                    if (persisted && typeof persisted === 'object') {
                        setParamsState(persisted);
                    }
                    if (broadcast) {
                        dispatchSettingsUpdated({
                            settings: persisted && typeof persisted === 'object'
                                ? persisted as AppParams
                                : next,
                            remount,
                        });
                    }
                } else if (broadcast) {
                    dispatchSettingsUpdated({ settings: next, remount });
                }
            } catch (err) {
                console.error('useParams: background save failed', err);
            }
        })();

        return next;
    }, [dispatchSettingsUpdated, params]);

    return { params, loading, reload: load, save, setParams } as const;
}

export default useParams;
