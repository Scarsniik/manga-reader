import useRefresh from '@/renderer/hooks/useRefresh';
import { useEffect, useState, useCallback } from 'react';

export type AppParams = {
    libraryPath?: string;
    showPageNumbers?: boolean;
    showHiddens?: boolean;
    titleLineCount?: number;
    readerPreloadPageCount?: number;
    readerOcrDetectedSectionOpen?: boolean;
    readerOcrManualSectionOpen?: boolean;
    ocrAutoRunOnImport?: boolean;
    ocrAutoAssignJapaneseLanguage?: boolean;
    persistMangaFilters?: boolean;
    mangaListFilters?: {
        query: string;
        selectedTags: string[];
        selectedLanguageIds: string[];
        sortBy: string;
        expanded: boolean;
        statusFilter: string[];
        unfinishedFirst: boolean;
        selectedSeriesId: string | null;
    } | null;
    [key: string]: any;
};

type SetParamsOptions = {
    broadcast?: boolean;
};

export function useParams() {
    const [params, setParamsState] = useState<AppParams | null>(null);
    const [loading, setLoading] = useState(true);

    const {refresh} = useRefresh();

    const dispatchSettingsUpdated = useCallback(() => {
        try {
            window.dispatchEvent(new CustomEvent('settings-updated'));
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

    const save = useCallback(async (next: AppParams) => {
        try {
            if (window.api && typeof window.api.saveSettings === 'function') {
                await window.api.saveSettings(next);
                setParamsState(next);
                dispatchSettingsUpdated();
                refresh();
                return next;
            }
            // Fallback: store in-memory
            setParamsState(next);
            return next;
        } catch (err) {
            console.error('useParams: failed to save settings', err);
            throw err;
        }
    }, [dispatchSettingsUpdated, refresh]);

    // setParams accepts a Partial of AppParams, applies an optimistic update and saves in background
    const setParams = useCallback((partial: Partial<AppParams>, options?: SetParamsOptions) => {
        const { broadcast = true } = options || {};
        const current = params || {};
        const next = { ...current, ...partial } as AppParams;

        // Optimistically update local state so UI is responsive (checkboxes, inputs)
        setParamsState(next);

        // Persist in background; do not toggle loading state here
        (async () => {
            try {
                if (window.api && typeof window.api.saveSettings === 'function') {
                    await window.api.saveSettings(next);
                    if (broadcast) {
                        dispatchSettingsUpdated();
                    }
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
