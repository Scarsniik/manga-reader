import useRefresh from '@/renderer/hooks/useRefresh';
import { useEffect, useState, useCallback } from 'react';
import type { LibrarySearchFilterState, SavedLibrarySearch, SavedScraperSearch } from '@/renderer/types';
import type { ScraperTagBlacklistByScraper } from '@/renderer/utils/scraperTagBlacklist';
import type { ScraperLatestResultLimitMode } from '@/shared/scraper';

export type ScraperTagListSortMode = 'alpha' | 'count';
export type ScraperTagListSortDirection = 'asc' | 'desc';

export type ScraperTagListViewSettings = {
    sortMode?: ScraperTagListSortMode;
    sortDirection?: ScraperTagListSortDirection;
    minCount?: number | null;
    maxCount?: number | null;
};

export type ScraperTagListViewSettingsByScraper = Record<string, ScraperTagListViewSettings>;

export type AppParams = {
    libraryPath?: string;
    lastHomeSearch?: string | null;
    showPageNumbers?: boolean;
    showHiddens?: boolean;
    titleLineCount?: number;
    readerOcrPreloadPageCount?: number;
    readerOcrAutoAnalyzeBubbles?: boolean;
    readerOcrPreloadTokenDetails?: boolean;
    readerOcrAutoPlayVoice?: boolean;
    readerOcrVoicevoxSpeakerUuid?: string;
    readerOcrVoicevoxStyleId?: number;
    readerOcrVoicevoxSpeedScale?: number;
    readerOcrVoicevoxSpeedStep?: number;
    readerOcrVoicevoxPitchScale?: number;
    readerOcrVoicevoxIntonationScale?: number;
    readerOcrVoicevoxVolumeScale?: number;
    readerOcrVoicevoxPrePhonemeLength?: number;
    readerOcrVoicevoxPostPhonemeLength?: number;
    readerOcrVoicevoxPauseLengthScale?: number;
    readerOcrVoicevoxOutputSamplingRate?: number;
    readerOcrVoicevoxOutputStereo?: boolean;
    readerOcrVoicevoxInterrogativeUpspeak?: boolean;
    readerOcrVoicevoxEnableKatakanaEnglish?: boolean;
    readerOcrVoicevoxAudioDownloadDirectory?: string;
    readerOcrNavigationOffset?: number;
    readerOcrNavigationDeadZone?: number;
    readerOcrNavigationStrictDirection?: boolean;
    readerOcrNavigationLooseFallback?: boolean;
    readerImagePreloadPageCount?: number;
    readerImageMaxWidth?: number;
    readerShowProgressIndicator?: boolean;
    readerScrollStrength?: number;
    readerScrollHoldSpeed?: number;
    readerScrollStartBoost?: number;
    readerOpenOcrPanelForJapaneseManga?: boolean;
    readerRecommendBookmarks?: boolean;
    readerSurpriseNextOnCompletion?: boolean;
    readingListKeepSourceTabs?: boolean;
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
    multiSearchShowUnseenFirst?: boolean;
    multiSearchEnableRomajiPhoneticMerge?: boolean;
    multiSearchMergedTitleLanguagePriority?: string[];
    multiSearchSelectedScraperIds?: string[];
    multiSearchSelectedLanguageCodes?: string[];
    multiSearchIncludedLanguageCodes?: string[];
    multiSearchSelectedContentTypes?: string[];
    multiSearchDepthMode?: string;
    multiSearchAdvancedPages?: number | "maximum";
    multiSearchPaceMode?: string;
    multiSearchViewMode?: string;
    multiSearchScrapeDetailsWithCards?: boolean;
    multiSearchOriginalOnly?: boolean;
    scraperAuthorCombinedView?: boolean;
    scraperAuthorOriginalOnly?: boolean;
    scraperTagCombinedView?: boolean;
    scraperAuthorFavoriteShowUnseenFirst?: boolean;
    scraperTagFavoriteShowUnseenFirst?: boolean;
    scraperAuthorFavoritePageCount?: number;
    scraperAuthorFavoriteCacheResults?: boolean;
    scraperScrapeDetailsWithCards?: boolean;
    scraperHideBlacklistedTagCards?: boolean;
    scraperCardPotentialMatchesEnabled?: boolean;
    scraperBlacklistedTagsByScraper?: ScraperTagBlacklistByScraper;
    scraperTagListViewSettingsByScraper?: ScraperTagListViewSettingsByScraper;
    scraperLatestResultLimit?: number;
    scraperLatestScraperResultLimit?: number;
    scraperLatestTagResultLimit?: number;
    scraperLatestResultLimitMode?: ScraperLatestResultLimitMode;
    scraperLatestConcurrency?: number;
    scraperLatestDeepPageLimit?: number;
    scraperLatestContinuousPageSafetyLimit?: number;
    scraperLatestQuickConsecutiveSeenStopThreshold?: number;
    scraperLatestLanguageRejectLimit?: number;
    scraperLatestPerformanceReportsEnabled?: boolean;
    scraperPerformanceReportsEnabled?: boolean;
    scraperLatestAuthorsUseCache?: boolean;
    scraperLatestAuthorCacheMaxAgeHours?: number;
    scraperLatestIncludedLanguageCodes?: string[];
    scraperLatestAuthorIncludedLanguageCodes?: string[];
    scraperLatestOriginalOnly?: boolean;
    scraperLatestAuthorOriginalOnly?: boolean;
    scraperLatestIncludedScraperIds?: string[];
    scraperLatestIncludedAuthorFavoriteIds?: string[];
    scraperLatestIncludedTagFavoriteIds?: string[];
    scraperViewHistoryMaxRecords?: number;
    scraperViewHistorySeenRetentionDays?: number;
    scraperViewHistoryReadRetentionDays?: number;
    scraperViewHistoryVisibilityPercent?: number;
    scraperViewHistoryDwellSeconds?: number;
    backgroundSearchStorageMode?: 'memory' | 'temporaryFile';
    backgroundSearchTemporaryRetentionHours?: number;
    backgroundSearchMaxConcurrent?: number;
    mangaCorrespondenceSafetyEnabled?: boolean;
    mangaCorrespondenceEmptyPageGuardEnabled?: boolean;
    mangaCorrespondenceConsecutiveUnproductivePageLimit?: number;
    mangaCorrespondenceUnboundedPageLimitEnabled?: boolean;
    mangaCorrespondenceUnboundedPageLimit?: number;
    mangaCorrespondenceAuthorExpansionGuardEnabled?: boolean;
    mangaCorrespondenceAbnormalAuthorLimit?: number;
    mangaCorrespondenceAutoInvalidateUnproductiveTitles?: boolean;
    mangaCorrespondenceAutoInvalidateMinCandidateCount?: number;
    mangaCorrespondenceTaskExpansionGuardEnabled?: boolean;
    mangaCorrespondenceMaxDiscoveryTaskCount?: number;
    mangaCorrespondenceRetainedPotentialGuardEnabled?: boolean;
    mangaCorrespondenceRetainedPotentialCount?: number;
    backgroundSearchStallWarningEnabled?: boolean;
    backgroundSearchStallWarningMinutes?: number;
    multiSearchBackgroundEnabled?: boolean;
    scraperAuthorBackgroundEnabled?: boolean;
    scraperLatestSourcesBackgroundEnabled?: boolean;
    scraperLatestAuthorsBackgroundEnabled?: boolean;
    scraperAuthorFavoriteRefreshBackgroundEnabled?: boolean;
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

    const savePartial = useCallback(async (
        partial: Partial<AppParams>,
        options?: SetParamsOptions,
    ): Promise<AppParams> => {
        const { broadcast = true, remount = true } = options || {};
        const next = { ...(params || {}), ...partial } as AppParams;
        let persistedSettings = next;

        if (window.api && typeof window.api.saveSettings === 'function') {
            const persisted = await window.api.saveSettings(partial);
            if (persisted && typeof persisted === 'object') {
                persistedSettings = persisted as AppParams;
            }
        }

        setParamsState(persistedSettings);
        if (broadcast) {
            dispatchSettingsUpdated({
                settings: persistedSettings,
                remount,
            });
        }

        return persistedSettings;
    }, [dispatchSettingsUpdated, params]);

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

    return { params, loading, reload: load, save, savePartial, setParams } as const;
}

export default useParams;
