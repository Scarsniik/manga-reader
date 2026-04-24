import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './style.scss';
import OcrPanel from './OcrPanel';
import ReaderControls from './ReaderControls';
import ReaderHeader from './ReaderHeader';
import ReaderStage from './ReaderStage';
import useParams from '@/renderer/hooks/useParams';
import useTags from '@/renderer/hooks/useTags';
import {
    DEFAULT_READER_IMAGE_MAX_WIDTH,
    DEFAULT_READER_SCROLL_STRENGTH,
    normalizeReaderImageMaxWidth,
    normalizeReaderImagePreloadPageCount,
    normalizeReaderOcrPreloadPageCount,
    normalizeReaderScrollStrength,
} from '@/shared/readerSettings';
import {
    ReaderLocationState,
} from './types';
import {
    normalizeBooleanSetting,
} from './utils';
import useReaderData from './hooks/useReaderData';
import useReaderNavigation from './hooks/useReaderNavigation';
import useReaderOcr from './hooks/useReaderOcr';
import useReaderOcrPanelLayout from './hooks/useReaderOcrPanelLayout';
import useReaderShortcuts from './hooks/useReaderShortcuts';

const Reader: React.FC = () => {
    const [ocrEnabled, setOcrEnabled] = React.useState<boolean>(false);
    const readerHeaderRef = React.useRef<HTMLDivElement | null>(null);
    const ocrPanelRef = React.useRef<HTMLElement | null>(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { params, loading: settingsLoading, setParams } = useParams();
    const { tags } = useTags();
    const locationState = location.state as ReaderLocationState;
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
    const showProgressIndicator = normalizeBooleanSetting(params?.readerShowProgressIndicator, true);
    const openOcrPanelForJapaneseManga = normalizeBooleanSetting(params?.readerOpenOcrPanelForJapaneseManga, false);
    const detectedSectionOpen = normalizeBooleanSetting(params?.readerOcrDetectedSectionOpen, true);
    const manualSectionOpen = normalizeBooleanSetting(params?.readerOcrManualSectionOpen, true);
    const autoOpenedOcrMangaIdRef = React.useRef<string | null>(null);
    const hiddenTagIds = React.useMemo(
        () => tags.filter((tag) => tag.hidden).map((tag) => tag.id),
        [tags],
    );

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
        locationSearch: location.search,
        locationState,
        preloadPageCount: imagePreloadPageCount,
    });
    const ocrPanelLayoutStyle = useReaderOcrPanelLayout(readerHeaderRef, ocrPanelRef);

    const navigation = useReaderNavigation({
        locationSearch: location.search,
        locationState,
        manga,
        libraryMangas,
        hiddenTagIds,
        showHiddenContent: Boolean(params?.showHiddens),
        images,
        currentIndex,
        setCurrentIndex,
        bookmarkExcludedFields,
        imgRef,
        containerRef,
        navigate,
    });

    const activeOcrEnabled = ocrEnabled && !navigation.isTransitionPage && !navigation.isCompletionPage;
    const ocr = useReaderOcr({
        activeOcrEnabled,
        currentImageSrc: navigation.currentImageSrc,
        currentIndex,
        images,
        manga,
        preloadPageCount: ocrPreloadPageCount,
        imgRef,
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
        toggleManualSelection: ocr.toggleManualSelection,
        openOcrPanel: () => setOcrEnabled(true),
        toggleOcrPanel: () => setOcrEnabled((value) => !value),
        next: navigation.next,
        prev: navigation.prev,
        activeOcrEnabled,
        ocrPanelAvailable: navigation.ocrAvailable,
        requireFreshNavigationInput: navigation.isTransitionPage || navigation.isCompletionPage,
        scrollStrength: readerScrollStrength,
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

    return (
        <div className="reader" style={readerStyle}>
            <ReaderHeader
                ref={readerHeaderRef}
                manga={manga}
                bookmarkExcludedFields={bookmarkExcludedFields}
                pageCounterLabel={navigation.pageCounterLabel}
                ocrEnabled={ocrEnabled}
                ocrAvailable={navigation.ocrAvailable}
                canCopyImage={images.length > 0 && !navigation.isTransitionPage && !navigation.isCompletionPage}
                copyFeedback={navigation.copyFeedback}
                onBack={navigation.handleBack}
                onCopyImage={() => {
                    void navigation.copyCurrentImage();
                }}
                onToggleOcr={() => setOcrEnabled((value) => !value)}
            />

            <div className={`reader-body${activeOcrEnabled ? ' ocr-on' : ''}`} ref={containerRef}>
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
                    completionSourceUrl={navigation.completionSourceUrl}
                    continuationCoverSrc={navigation.continuationCoverSrc}
                    continuationLoading={navigation.continuationLoading}
                    continuationError={navigation.continuationError}
                    onContinue={(direction) => {
                        void navigation.continueToAdjacentChapter(direction);
                    }}
                    onReturnToLibrary={navigation.returnToLibrary}
                    onOpenSource={() => {
                        void navigation.openMangaSource();
                    }}
                    onOpenRecommendation={(targetManga) => {
                        void navigation.openLibraryManga(targetManga);
                    }}
                    currentImageSrc={navigation.currentImageSrc}
                    activeOcrEnabled={activeOcrEnabled}
                    showBoxes={ocr.showBoxes}
                    allOcrBoxes={ocr.allOcrBoxes}
                    selectedBoxes={ocr.selectedBoxes}
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
                        onRemoveManualBox={(boxId) => {
                            void ocr.handleRemoveManualBox(boxId);
                        }}
                        loading={ocr.ocrLoading}
                        error={ocr.ocrError}
                        statusNote={ocr.ocrStatusNote}
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
