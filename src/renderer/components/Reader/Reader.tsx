import React from 'react';
import {
    type NavigateFunction,
    type NavigateOptions,
    type To,
    useLocation,
    useNavigate,
} from 'react-router-dom';
import './style.scss';
import OcrPanel from './OcrPanel';
import ReaderControls from './ReaderControls';
import ReaderHeader from './ReaderHeader';
import ReaderStage from './ReaderStage';
import { CloseXIcon } from '@/renderer/components/icons';
import useParams from '@/renderer/hooks/useParams';
import useTags from '@/renderer/hooks/useTags';
import { useScraperBookmarks } from '@/renderer/stores/scraperBookmarks';
import { useScraperViewHistory } from '@/renderer/stores/scraperViewHistory';
import type {
    ScraperReaderProgressRecord,
    ScraperRecord,
} from '@/shared/scraper';
import {
    DEFAULT_READER_IMAGE_MAX_WIDTH,
    DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES,
    DEFAULT_READER_OCR_AUTO_PLAY_VOICE,
    DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE,
    DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK,
    DEFAULT_READER_OCR_NAVIGATION_OFFSET,
    DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION,
    DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS,
    DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH,
    DEFAULT_READER_OCR_VOICEVOX_AUDIO_DOWNLOAD_DIRECTORY,
    DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK,
    DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE,
    DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE,
    DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO,
    DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE,
    DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE,
    DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH,
    DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH,
    DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE,
    DEFAULT_READER_OCR_VOICEVOX_SPEED_STEP,
    DEFAULT_READER_OCR_VOICEVOX_STYLE_ID,
    DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE,
    DEFAULT_READER_SCROLL_HOLD_SPEED,
    DEFAULT_READER_SCROLL_START_BOOST,
    DEFAULT_READER_SCROLL_STRENGTH,
    normalizeReaderImageMaxWidth,
    normalizeReaderImagePreloadPageCount,
    normalizeReaderOcrAutoAnalyzeBubbles,
    normalizeReaderOcrAutoPlayVoice,
    normalizeReaderOcrNavigationDeadZone,
    normalizeReaderOcrNavigationLooseFallback,
    normalizeReaderOcrNavigationOffset,
    normalizeReaderOcrNavigationStrictDirection,
    normalizeReaderOcrPreloadPageCount,
    normalizeReaderOcrPreloadTokenDetails,
    normalizeReaderOcrVoicevoxEnableKatakanaEnglish,
    normalizeReaderOcrVoicevoxAudioDownloadDirectory,
    normalizeReaderOcrVoicevoxInterrogativeUpspeak,
    normalizeReaderOcrVoicevoxIntonationScale,
    normalizeReaderOcrVoicevoxOutputSamplingRate,
    normalizeReaderOcrVoicevoxOutputStereo,
    normalizeReaderOcrVoicevoxPauseLengthScale,
    normalizeReaderOcrVoicevoxPitchScale,
    normalizeReaderOcrVoicevoxPostPhonemeLength,
    normalizeReaderOcrVoicevoxPrePhonemeLength,
    normalizeReaderOcrVoicevoxSpeedScale,
    normalizeReaderOcrVoicevoxSpeedStep,
    normalizeReaderOcrVoicevoxStyleId,
    normalizeReaderOcrVoicevoxVolumeScale,
    normalizeReaderScrollHoldSpeed,
    normalizeReaderScrollStartBoost,
    normalizeReaderScrollStrength,
} from '@/shared/readerSettings';
import {
    ReaderLocationState,
    ReaderMangaSourceRequest,
    ReaderReadingListNavigation,
} from './types';
import {
    normalizeBooleanSetting,
} from './utils';
import useReaderData from './hooks/useReaderData';
import useReaderFullscreen from './hooks/useReaderFullscreen';
import useReaderNavigation from './hooks/useReaderNavigation';
import useReaderOcr from './hooks/useReaderOcr';
import useReaderOcrPanelLayout from './hooks/useReaderOcrPanelLayout';
import useReaderShortcuts from './hooks/useReaderShortcuts';
import useReaderVoicevoxSpeech from './hooks/useReaderVoicevoxSpeech';
import { buildBookmarkRecommendationMangas } from '@/renderer/components/Reader/readerBookmarkRecommendations';

type ReaderProps = {
    initialLocationSearch?: string;
    initialLocationState?: ReaderLocationState;
    onBack?: () => void;
    onOpenMangaSource?: (request: ReaderMangaSourceRequest) => boolean | void | Promise<boolean | void>;
    showBackButton?: boolean;
    syncWindowPageParam?: boolean;
    readingListNavigation?: ReaderReadingListNavigation;
};

type LocalReaderLocation = {
    pathname: string;
    search: string;
    state: ReaderLocationState;
};

const normalizeReaderSearch = (search: string | undefined): string => {
    if (!search) {
        return '';
    }

    return search.startsWith('?') ? search : `?${search}`;
};

const Reader: React.FC<ReaderProps> = ({
    initialLocationSearch,
    initialLocationState = null,
    onBack,
    onOpenMangaSource,
    showBackButton = true,
    syncWindowPageParam = true,
    readingListNavigation,
}) => {
    const [ocrEnabled, setOcrEnabled] = React.useState<boolean>(false);
    const readerHeaderRef = React.useRef<HTMLDivElement | null>(null);
    const ocrPanelRef = React.useRef<HTMLElement | null>(null);
    const routerLocation = useLocation();
    const routerNavigate = useNavigate();
    const usesLocalLocation = typeof initialLocationSearch === 'string';
    const [localLocation, setLocalLocation] = React.useState<LocalReaderLocation>(() => ({
        pathname: '/reader',
        search: normalizeReaderSearch(initialLocationSearch),
        state: initialLocationState,
    }));
    const locationSearch = usesLocalLocation ? localLocation.search : routerLocation.search;
    const locationState = usesLocalLocation
        ? localLocation.state
        : routerLocation.state as ReaderLocationState;
    const navigate = React.useMemo<NavigateFunction>(() => {
        if (!usesLocalLocation) {
            return routerNavigate;
        }

        return ((to: To | number, options?: NavigateOptions) => {
            if (typeof to === 'number') {
                return;
            }

            setLocalLocation((currentLocation) => {
                if (typeof to === 'string') {
                    const separatorIndex = to.indexOf('?');
                    const pathname = separatorIndex >= 0
                        ? to.slice(0, separatorIndex) || currentLocation.pathname
                        : to || currentLocation.pathname;
                    const search = separatorIndex >= 0
                        ? normalizeReaderSearch(to.slice(separatorIndex + 1))
                        : '';

                    return {
                        pathname,
                        search,
                        state: (options?.state as ReaderLocationState) ?? null,
                    };
                }

                return {
                    pathname: to.pathname ?? currentLocation.pathname,
                    search: normalizeReaderSearch(to.search),
                    state: (options?.state as ReaderLocationState) ?? null,
                };
            });
        }) as NavigateFunction;
    }, [routerNavigate, usesLocalLocation]);
    const { params, loading: settingsLoading, setParams } = useParams();
    const { tags } = useTags();
    const { bookmarks: scraperBookmarks } = useScraperBookmarks();
    const { recordsById: scraperViewHistoryRecordsById } = useScraperViewHistory();
    const [scrapers, setScrapers] = React.useState<ScraperRecord[]>([]);
    const [scraperReaderProgressRecords, setScraperReaderProgressRecords] = React.useState<ScraperReaderProgressRecord[]>([]);
    const ocrPreloadPageCount = settingsLoading
        ? null
        : normalizeReaderOcrPreloadPageCount(params?.readerOcrPreloadPageCount ?? params?.readerPreloadPageCount);
    const imagePreloadPageCount = settingsLoading
        ? null
        : normalizeReaderImagePreloadPageCount(params?.readerImagePreloadPageCount);
    const readerImageMaxWidth = settingsLoading
        ? DEFAULT_READER_IMAGE_MAX_WIDTH
        : normalizeReaderImageMaxWidth(params?.readerImageMaxWidth);
    const readerScrollStrength = settingsLoading
        ? DEFAULT_READER_SCROLL_STRENGTH
        : normalizeReaderScrollStrength(params?.readerScrollStrength);
    const readerScrollHoldSpeed = settingsLoading
        ? DEFAULT_READER_SCROLL_HOLD_SPEED
        : normalizeReaderScrollHoldSpeed(params?.readerScrollHoldSpeed);
    const readerScrollStartBoost = settingsLoading
        ? DEFAULT_READER_SCROLL_START_BOOST
        : normalizeReaderScrollStartBoost(params?.readerScrollStartBoost);
    const showProgressIndicator = normalizeBooleanSetting(params?.readerShowProgressIndicator, true);
    const openOcrPanelForJapaneseManga = normalizeBooleanSetting(params?.readerOpenOcrPanelForJapaneseManga, false);
    const recommendBookmarks = normalizeBooleanSetting(params?.readerRecommendBookmarks, false);
    const surpriseNextOnCompletion = normalizeBooleanSetting(params?.readerSurpriseNextOnCompletion, false);
    const readerOcrAutoAnalyzeBubbles = settingsLoading
        ? DEFAULT_READER_OCR_AUTO_ANALYZE_BUBBLES
        : normalizeReaderOcrAutoAnalyzeBubbles(params?.readerOcrAutoAnalyzeBubbles);
    const readerOcrPreloadTokenDetails = settingsLoading
        ? DEFAULT_READER_OCR_PRELOAD_TOKEN_DETAILS
        : normalizeReaderOcrPreloadTokenDetails(params?.readerOcrPreloadTokenDetails);
    const readerOcrAutoPlayVoice = settingsLoading
        ? DEFAULT_READER_OCR_AUTO_PLAY_VOICE
        : normalizeReaderOcrAutoPlayVoice(params?.readerOcrAutoPlayVoice);
    const readerOcrVoicevoxSpeedStep = settingsLoading
        ? DEFAULT_READER_OCR_VOICEVOX_SPEED_STEP
        : normalizeReaderOcrVoicevoxSpeedStep(params?.readerOcrVoicevoxSpeedStep);
    const readerOcrVoicevoxAudioDownloadDirectory = settingsLoading
        ? DEFAULT_READER_OCR_VOICEVOX_AUDIO_DOWNLOAD_DIRECTORY
        : normalizeReaderOcrVoicevoxAudioDownloadDirectory(params?.readerOcrVoicevoxAudioDownloadDirectory);
    const readerOcrVoicevoxSpeechSettings = React.useMemo(() => ({
        speakerId: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_STYLE_ID
            : normalizeReaderOcrVoicevoxStyleId(params?.readerOcrVoicevoxStyleId),
        speedScale: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_SPEED_SCALE
            : normalizeReaderOcrVoicevoxSpeedScale(params?.readerOcrVoicevoxSpeedScale),
        pitchScale: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_PITCH_SCALE
            : normalizeReaderOcrVoicevoxPitchScale(params?.readerOcrVoicevoxPitchScale),
        intonationScale: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_INTONATION_SCALE
            : normalizeReaderOcrVoicevoxIntonationScale(params?.readerOcrVoicevoxIntonationScale),
        volumeScale: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_VOLUME_SCALE
            : normalizeReaderOcrVoicevoxVolumeScale(params?.readerOcrVoicevoxVolumeScale),
        prePhonemeLength: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_PRE_PHONEME_LENGTH
            : normalizeReaderOcrVoicevoxPrePhonemeLength(params?.readerOcrVoicevoxPrePhonemeLength),
        postPhonemeLength: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_POST_PHONEME_LENGTH
            : normalizeReaderOcrVoicevoxPostPhonemeLength(params?.readerOcrVoicevoxPostPhonemeLength),
        pauseLengthScale: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_PAUSE_LENGTH_SCALE
            : normalizeReaderOcrVoicevoxPauseLengthScale(params?.readerOcrVoicevoxPauseLengthScale),
        outputSamplingRate: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_OUTPUT_SAMPLING_RATE
            : normalizeReaderOcrVoicevoxOutputSamplingRate(params?.readerOcrVoicevoxOutputSamplingRate),
        outputStereo: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_OUTPUT_STEREO
            : normalizeReaderOcrVoicevoxOutputStereo(params?.readerOcrVoicevoxOutputStereo),
        interrogativeUpspeak: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_INTERROGATIVE_UPSPEAK
            : normalizeReaderOcrVoicevoxInterrogativeUpspeak(params?.readerOcrVoicevoxInterrogativeUpspeak),
        enableKatakanaEnglish: settingsLoading
            ? DEFAULT_READER_OCR_VOICEVOX_ENABLE_KATAKANA_ENGLISH
            : normalizeReaderOcrVoicevoxEnableKatakanaEnglish(params?.readerOcrVoicevoxEnableKatakanaEnglish),
    }), [params, settingsLoading]);
    const readerOcrNavigationOffset = settingsLoading
        ? DEFAULT_READER_OCR_NAVIGATION_OFFSET
        : normalizeReaderOcrNavigationOffset(params?.readerOcrNavigationOffset);
    const readerOcrNavigationDeadZone = settingsLoading
        ? DEFAULT_READER_OCR_NAVIGATION_DEAD_ZONE
        : normalizeReaderOcrNavigationDeadZone(params?.readerOcrNavigationDeadZone);
    const readerOcrNavigationStrictDirection = settingsLoading
        ? DEFAULT_READER_OCR_NAVIGATION_STRICT_DIRECTION
        : normalizeReaderOcrNavigationStrictDirection(params?.readerOcrNavigationStrictDirection);
    const readerOcrNavigationLooseFallback = settingsLoading
        ? DEFAULT_READER_OCR_NAVIGATION_LOOSE_FALLBACK
        : normalizeReaderOcrNavigationLooseFallback(params?.readerOcrNavigationLooseFallback);
    const detectedSectionOpen = normalizeBooleanSetting(params?.readerOcrDetectedSectionOpen, true);
    const manualSectionOpen = normalizeBooleanSetting(params?.readerOcrManualSectionOpen, true);
    const autoOpenedOcrMangaIdRef = React.useRef<string | null>(null);
    const hiddenTagIds = React.useMemo(
        () => tags.filter((tag) => tag.hidden).map((tag) => tag.id),
        [tags],
    );

    const loadScrapersForRecommendations = React.useCallback(async () => {
        if (!recommendBookmarks || !window.api || typeof window.api.getScrapers !== 'function') {
            setScrapers([]);
            return;
        }

        try {
            const data = await window.api.getScrapers();
            setScrapers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.warn('Reader: failed to load scrapers for bookmark recommendations', error);
            setScrapers([]);
        }
    }, [recommendBookmarks]);

    const loadScraperReaderProgressRecords = React.useCallback(async () => {
        if (!recommendBookmarks || !window.api || typeof window.api.getScraperReaderProgressRecords !== 'function') {
            setScraperReaderProgressRecords([]);
            return;
        }

        try {
            const data = await window.api.getScraperReaderProgressRecords();
            setScraperReaderProgressRecords(Array.isArray(data) ? data : []);
        } catch (error) {
            console.warn('Reader: failed to load scraper reader progress for bookmark recommendations', error);
            setScraperReaderProgressRecords([]);
        }
    }, [recommendBookmarks]);

    React.useEffect(() => {
        void loadScrapersForRecommendations();

        if (!recommendBookmarks) {
            return undefined;
        }

        const onScrapersUpdated = () => {
            void loadScrapersForRecommendations();
        };

        window.addEventListener('scrapers-updated', onScrapersUpdated as EventListener);
        return () => window.removeEventListener('scrapers-updated', onScrapersUpdated as EventListener);
    }, [loadScrapersForRecommendations, recommendBookmarks]);

    React.useEffect(() => {
        void loadScraperReaderProgressRecords();
    }, [loadScraperReaderProgressRecords, locationSearch]);

    const {
        images,
        currentIndex,
        setCurrentIndex,
        manga,
        libraryMangas,
        bookmarkExcludedFields,
        imgRef,
        containerRef,
        debugList,
        debugError,
        coverData,
        runDebugListPages,
    } = useReaderData({
        locationSearch,
        locationState,
        preloadPageCount: imagePreloadPageCount,
        syncWindowPageParam,
    });
    const fullscreen = useReaderFullscreen(containerRef);
    const ocrPanelLayoutStyle = useReaderOcrPanelLayout(readerHeaderRef, ocrPanelRef);
    const scrapersById = React.useMemo(
        () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
        [scrapers],
    );
    const bookmarkRecommendationMangas = React.useMemo(
        () => recommendBookmarks
            ? buildBookmarkRecommendationMangas({
                bookmarks: scraperBookmarks,
                scrapersById,
                tags,
                viewHistoryRecordsById: scraperViewHistoryRecordsById,
                progressRecords: scraperReaderProgressRecords,
                libraryMangas,
                currentManga: manga,
            })
            : [],
        [
            libraryMangas,
            manga,
            recommendBookmarks,
            scraperBookmarks,
            scraperReaderProgressRecords,
            scraperViewHistoryRecordsById,
            scrapersById,
            tags,
        ],
    );

    const navigation = useReaderNavigation({
        locationSearch,
        locationState,
        manga,
        libraryMangas,
        hiddenTagIds,
        showHiddenContent: Boolean(params?.showHiddens),
        surpriseNextOnCompletion,
        bookmarkRecommendationMangas,
        bookmarkRecommendationScrapersById: scrapersById,
        images,
        currentIndex,
        setCurrentIndex,
        bookmarkExcludedFields,
        imgRef,
        containerRef,
        navigate,
        onOpenMangaSource,
        readingListNavigation,
    });
    const handleBack = onBack ?? navigation.handleBack;

    const activeOcrEnabled = ocrEnabled && !navigation.isTransitionPage && !navigation.isCompletionPage;
    const ocr = useReaderOcr({
        activeOcrEnabled,
        currentImageSrc: navigation.currentImageSrc,
        currentIndex,
        images,
        manga,
        preloadPageCount: ocrPreloadPageCount,
        analysisPreloadEnabled: readerOcrAutoAnalyzeBubbles,
        preloadTokenDetails: readerOcrPreloadTokenDetails,
        navigationOffset: readerOcrNavigationOffset,
        navigationDeadZone: readerOcrNavigationDeadZone,
        navigationStrictDirection: readerOcrNavigationStrictDirection,
        navigationLooseFallback: readerOcrNavigationLooseFallback,
        imgRef,
    });
    const voiceSpeech = useReaderVoicevoxSpeech({
        activeOcrEnabled,
        allOcrBoxes: ocr.allOcrBoxes,
        selectedBoxes: ocr.selectedBoxes,
        autoPlayEnabled: readerOcrAutoPlayVoice,
        speechSettings: readerOcrVoicevoxSpeechSettings,
        speedStep: readerOcrVoicevoxSpeedStep,
        audioDownloadDirectory: readerOcrVoicevoxAudioDownloadDirectory,
    });

    React.useEffect(() => {
        if (!navigation.ocrAvailable && ocrEnabled) {
            setOcrEnabled(false);
        }
    }, [navigation.ocrAvailable, ocrEnabled]);

    useReaderShortcuts({
        copyCurrentImage: navigation.copyCurrentImage,
        selectedBoxes: ocr.selectedBoxes,
        requestTokenCycle: ocr.requestTokenCycle,
        navigateOcrBox: ocr.navigateOcrBox,
        navigateOrderedOcrBox: ocr.navigateOrderedOcrBox,
        toggleManualSelection: ocr.toggleManualSelection,
        toggleOrderSelection: ocr.toggleOrderSelection,
        openOcrPanel: () => setOcrEnabled(true),
        toggleOcrPanel: () => setOcrEnabled((value) => !value),
        toggleFullscreen: fullscreen.toggleFullscreen,
        playSelectedOcrVoice: voiceSpeech.playSelectedText,
        playSelectedOcrVoiceSlower: voiceSpeech.playSelectedTextSlower,
        playSelectedOcrVoiceFaster: voiceSpeech.playSelectedTextFaster,
        readerBodyRef: containerRef,
        next: navigation.next,
        prev: navigation.prev,
        activeOcrEnabled,
        ocrPanelAvailable: navigation.ocrAvailable,
        fullscreenAvailable: fullscreen.fullscreenAvailable,
        requireFreshNavigationInput: navigation.isTransitionPage || navigation.isCompletionPage,
        scrollStrength: readerScrollStrength,
        scrollHoldSpeed: readerScrollHoldSpeed,
        scrollStartBoost: readerScrollStartBoost,
    });

    React.useEffect(() => {
        if (
            settingsLoading
            || !openOcrPanelForJapaneseManga
            || !navigation.ocrAvailable
            || !manga
        ) {
            return;
        }

        const mangaLanguage = String(manga.language || '').trim().toLowerCase();
        if (mangaLanguage !== 'ja') {
            return;
        }

        if (autoOpenedOcrMangaIdRef.current === manga.id) {
            return;
        }

        autoOpenedOcrMangaIdRef.current = manga.id;
        setOcrEnabled(true);
    }, [
        manga,
        navigation.ocrAvailable,
        openOcrPanelForJapaneseManga,
        settingsLoading,
    ]);

    const readerStyle = React.useMemo(() => ({
        ...ocrPanelLayoutStyle,
        '--reader-image-max-width': `${readerImageMaxWidth}px`,
    } as React.CSSProperties), [ocrPanelLayoutStyle, readerImageMaxWidth]);
    const completionBookmarkTarget = React.useMemo(() => {
        const scraperId = String(manga?.scraperId ?? '').trim();
        const sourceUrl = String(manga?.sourceUrl ?? '').trim();

        if (!scraperId || !sourceUrl) {
            return null;
        }

        return {
            scraperId,
            sourceUrl,
            title: manga?.title || "ce manga",
        };
    }, [manga?.scraperId, manga?.sourceUrl, manga?.title]);

    return (
        <div className="reader" style={readerStyle}>
            <ReaderHeader
                ref={readerHeaderRef}
                manga={manga}
                bookmarkExcludedFields={bookmarkExcludedFields}
                pageCounterLabel={navigation.pageCounterLabel}
                ocrEnabled={ocrEnabled}
                ocrAvailable={navigation.ocrAvailable}
                fullscreenAvailable={fullscreen.fullscreenAvailable}
                isFullscreen={fullscreen.isFullscreen}
                canCopyImage={images.length > 0 && !navigation.isTransitionPage && !navigation.isCompletionPage}
                copyFeedback={navigation.copyFeedback}
                onBack={handleBack}
                onCopyImage={() => {
                    void navigation.copyCurrentImage();
                }}
                showBackButton={showBackButton}
                onToggleFullscreen={fullscreen.toggleFullscreen}
                onToggleOcr={() => setOcrEnabled((value) => !value)}
            />

            <div
                className={[
                    'reader-body',
                    activeOcrEnabled ? 'ocr-on' : '',
                    fullscreen.isFullscreen ? 'is-reader-fullscreen' : '',
                ].filter(Boolean).join(' ')}
                ref={containerRef}
            >
                {fullscreen.isFullscreen ? (
                    <button
                        type="button"
                        className="reader-fullscreen-floating-button"
                        onClick={fullscreen.exitFullscreen}
                        title="Quitter le plein écran (F ou Échap)"
                        aria-label="Quitter le plein écran"
                    >
                        <CloseXIcon aria-hidden="true" focusable="false" />
                    </button>
                ) : null}
                <ReaderStage
                    totalPages={navigation.totalPages}
                    currentPage={navigation.currentPage}
                    readingProgress={navigation.readingProgress}
                    showProgressIndicator={showProgressIndicator}
                    progressAriaText={navigation.progressAriaText}
                    isLastPage={navigation.isLastPage}
                    isTransitionPage={navigation.isTransitionPage}
                    isCompletionPage={navigation.isCompletionPage}
                    transitionDirection={navigation.transitionDirection}
                    activeTransitionTarget={navigation.activeTransitionTarget}
                    completionRecommendations={navigation.completionRecommendations}
                    completionRandomRecommendation={navigation.completionRandomRecommendation}
                    completionSourceUrl={navigation.completionSourceUrl}
                    completionBookmarkTarget={completionBookmarkTarget}
                    continuationCoverSrc={navigation.continuationCoverSrc}
                    continuationLoading={navigation.continuationLoading}
                    continuationError={navigation.continuationError}
                    onContinue={(direction) => {
                        void navigation.continueToAdjacentChapter(direction);
                    }}
                    onOpenReadingListDetails={readingListNavigation
                        ? () => {
                            void readingListNavigation.onOpenCurrentDetails();
                        }
                        : undefined}
                    onFinishReadingList={readingListNavigation
                        ? () => {
                            void readingListNavigation.onFinished();
                        }
                        : undefined}
                    onReturnToLibrary={navigation.returnToLibrary}
                    onOpenSource={() => {
                        void navigation.openMangaSource();
                    }}
                    onOpenRecommendation={(targetManga) => {
                        void navigation.openRecommendation(targetManga);
                    }}
                    onOpenRandomRecommendation={(targetManga) => {
                        void navigation.openRecommendation(targetManga);
                    }}
                    currentImageSrc={navigation.currentImageSrc}
                    currentImageRefererUrl={manga?.sourceUrl ?? locationState?.scraperReader?.sourceUrl ?? null}
                    activeOcrEnabled={activeOcrEnabled}
                    showBoxes={ocr.showBoxes}
                    allOcrBoxes={ocr.allOcrBoxes}
                    selectedBoxes={ocr.selectedBoxes}
                    orderSelectionEnabled={ocr.orderSelectionEnabled}
                    orderedBoxIds={ocr.orderedBoxIds}
                    onSelectBox={ocr.updateSelectedBoxes}
                    manualSelectionEnabled={ocr.manualSelectionEnabled}
                    manualSelectionLoading={ocr.manualSelectionLoading}
                    onManualSelectionComplete={ocr.handleManualSelectionComplete}
                    imgRef={imgRef}
                    emptyState={{
                        mangaPath: manga?.path,
                        hasGetMangasApi: !!(window.api && typeof window.api.getMangas === 'function'),
                        hasListPagesApi: !!(window.api && typeof window.api.listPages === 'function'),
                        hasGetCoverDataApi: !!(window.api && typeof window.api.getCoverData === 'function'),
                        canRunDebug: !!(manga && manga.path),
                        onRunDebug: () => {
                            void runDebugListPages();
                        },
                        debugError,
                        debugList,
                        coverData,
                    }}
                />

                {activeOcrEnabled ? (
                    <OcrPanel
                        ref={ocrPanelRef}
                        detectedBoxes={ocr.detectedBoxes}
                        manualBoxes={ocr.manualBoxes}
                        selectedBoxes={ocr.selectedBoxes}
                        orderSelectionEnabled={ocr.orderSelectionEnabled}
                        orderedBoxIds={ocr.orderedBoxIds}
                        orderedTranslationEnabled={ocr.orderedTranslationEnabled}
                        orderedTranslationRevision={ocr.orderedTranslationRevision}
                        tokenCycleRequestNonce={ocr.tokenCycleRequest.nonce}
                        tokenCycleSelectionKey={ocr.tokenCycleRequest.selectionKey}
                        onSimulate={() => {
                            void ocr.refreshOcr();
                        }}
                        onClear={ocr.clearOcr}
                        onSelectBox={ocr.updateSelectedBoxes}
                        onFocusBox={ocr.focusOcrBox}
                        manualSelectionEnabled={ocr.manualSelectionEnabled}
                        manualSelectionLoading={ocr.manualSelectionLoading}
                        detectedSectionOpen={detectedSectionOpen}
                        manualSectionOpen={manualSectionOpen}
                        onToggleDetectedSection={() => {
                            setParams(
                                { readerOcrDetectedSectionOpen: !detectedSectionOpen },
                                { broadcast: false }
                            );
                        }}
                        onToggleManualSection={() => {
                            setParams(
                                { readerOcrManualSectionOpen: !manualSectionOpen },
                                { broadcast: false }
                            );
                        }}
                        onToggleManualSelection={ocr.toggleManualSelection}
                        onToggleOrderSelection={ocr.toggleOrderSelection}
                        onRemoveManualBox={(boxId) => {
                            void ocr.handleRemoveManualBox(boxId);
                        }}
                        onUpdateBoxText={ocr.updateOcrBoxText}
                        loading={ocr.ocrLoading}
                        error={ocr.ocrError}
                        statusNote={ocr.ocrStatusNote}
                        voicePlaybackAvailable={voiceSpeech.voicePlaybackAvailable}
                        voicePlaybackStatusLoading={voiceSpeech.voicePlaybackStatusLoading}
                        voicePlaybackLoading={voiceSpeech.voicePlaybackLoading}
                        voicePlaybackPlaying={voiceSpeech.voicePlaybackPlaying}
                        voicePlaybackError={voiceSpeech.voicePlaybackError}
                        voicePlaybackUnavailableMessage={voiceSpeech.voicePlaybackUnavailableMessage}
                        onPlaySelectedText={voiceSpeech.playSelectedText}
                        onPlayTokenText={voiceSpeech.playText}
                        voiceAudioDownloadLoading={voiceSpeech.voiceAudioDownloadLoading}
                        voiceAudioDownloadPath={voiceSpeech.voiceAudioDownloadPath}
                        voiceAudioDownloadError={voiceSpeech.voiceAudioDownloadError}
                        onDownloadSelectedAudio={voiceSpeech.downloadSelectedAudio}
                        showBoxes={ocr.showBoxes}
                        onToggleShowBoxes={ocr.setShowBoxes}
                    />
                ) : null}
            </div>

            <ReaderControls
                canGoPrev={navigation.canGoPrev}
                canGoNext={navigation.canGoNext}
                isTransitionPage={navigation.isTransitionPage}
                isCompletionPage={navigation.isCompletionPage}
                continuationLoading={navigation.continuationLoading}
                transitionDirection={navigation.transitionDirection}
                onPrev={navigation.prev}
                onNext={navigation.next}
            />
        </div>
    );
};

export default Reader;
