export interface MangaManagerViewState {
    focusMangaId: string | null;
    scrollTop: number;
}

const MANGA_MANAGER_VIEW_STATE_KEY = 'manga-helper:manga-manager-view-state';

const canUseSessionStorage = (): boolean => {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
};

export const readMangaManagerViewState = (): MangaManagerViewState | null => {
    if (!canUseSessionStorage()) return null;

    try {
        const raw = window.sessionStorage.getItem(MANGA_MANAGER_VIEW_STATE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<MangaManagerViewState>;
        const scrollTop = typeof parsed.scrollTop === 'number' && Number.isFinite(parsed.scrollTop)
            ? parsed.scrollTop
            : 0;
        const focusMangaId = typeof parsed.focusMangaId === 'string' && parsed.focusMangaId.length > 0
            ? parsed.focusMangaId
            : null;

        return {
            focusMangaId,
            scrollTop,
        };
    } catch (err) {
        console.warn('Failed to read manga manager view state', err);
        return null;
    }
};

export const writeMangaManagerViewState = (
    partialState: Partial<MangaManagerViewState>
): MangaManagerViewState | null => {
    if (!canUseSessionStorage()) return null;

    const currentState = readMangaManagerViewState() ?? {
        focusMangaId: null,
        scrollTop: 0,
    };
    const nextState: MangaManagerViewState = {
        focusMangaId: partialState.focusMangaId === undefined
            ? currentState.focusMangaId
            : partialState.focusMangaId ?? null,
        scrollTop: typeof partialState.scrollTop === 'number' && Number.isFinite(partialState.scrollTop)
            ? partialState.scrollTop
            : currentState.scrollTop,
    };

    try {
        window.sessionStorage.setItem(MANGA_MANAGER_VIEW_STATE_KEY, JSON.stringify(nextState));
        return nextState;
    } catch (err) {
        console.warn('Failed to write manga manager view state', err);
        return currentState;
    }
};
