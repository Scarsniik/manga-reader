import useRefresh from '@/renderer/hooks/useRefresh';
import { useEffect, useState, useCallback } from 'react';

export type AppParams = {
    libraryPath?: string;
    showPageNumbers?: boolean;
    showHiddens?: boolean;
    titleLineCount?: number;
    [key: string]: any;
};

export function useParams() {
    const [params, setParamsState] = useState<AppParams | null>(null);
    const [loading, setLoading] = useState(true);

    const {refresh} = useRefresh();

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
                try { window.dispatchEvent(new CustomEvent('settings-updated')); } catch (e) { /* noop */ }
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
    }, []);

    // setParams accepts a Partial of AppParams, applies an optimistic update and saves in background
    const setParams = useCallback((partial: Partial<AppParams>) => {
        const current = params || {};
        const next = { ...current, ...partial } as AppParams;

        // Optimistically update local state so UI is responsive (checkboxes, inputs)
        setParamsState(next);

        // Persist in background; do not toggle loading state here
        (async () => {
            try {
                if (window.api && typeof window.api.saveSettings === 'function') {
                    await window.api.saveSettings(next);
                    try { window.dispatchEvent(new CustomEvent('settings-updated')); } catch (e) { /* noop */ }
                }
            } catch (err) {
                console.error('useParams: background save failed', err);
            }
        })();

        return next;
    }, [params]);

    return { params, loading, reload: load, save, setParams } as const;
}

export default useParams;
