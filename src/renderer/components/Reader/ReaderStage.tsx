import React from 'react';
import { Manga } from '@/renderer/types';
import ImageViewer from './ImageViewer';
import ReaderChapterTransition from './ReaderChapterTransition';
import ReaderCompletion from './ReaderCompletion';
import ReaderEmptyState from './ReaderEmptyState';
import {
    ManualSelection,
    ReaderAdjacentTarget,
    ReaderOcrBox,
} from './types';

type Props = {
    totalPages: number;
    currentPage: number;
    readingProgress: number;
    progressAriaText: string;
    isLastPage: boolean;
    isTransitionPage: boolean;
    isCompletionPage: boolean;
    transitionDirection: 'previous' | 'next' | null;
    activeTransitionTarget: ReaderAdjacentTarget | null;
    completionRecommendations: Manga[];
    completionSourceUrl: string | null;
    continuationCoverSrc: string | null;
    continuationLoading: boolean;
    continuationError: string | null;
    onContinue: (direction: 'previous' | 'next') => void;
    onReturnToLibrary: () => void;
    onOpenSource: () => void;
    onOpenRecommendation: (manga: Manga) => void;
    currentImageSrc: string | null;
    activeOcrEnabled: boolean;
    showBoxes: boolean;
    allOcrBoxes: ReaderOcrBox[];
    selectedBoxes: string[];
    onSelectBox: (id: string | null, additive?: boolean) => void;
    manualSelectionEnabled: boolean;
    manualSelectionLoading: boolean;
    onManualSelectionComplete: (selection: ManualSelection) => void | Promise<void>;
    imgRef: React.RefObject<HTMLImageElement | null>;
    emptyState: {
        mangaPath?: string | null;
        hasGetMangasApi: boolean;
        hasListPagesApi: boolean;
        hasGetCoverDataApi: boolean;
        canRunDebug: boolean;
        onRunDebug: () => void;
        debugError?: string | null;
        debugList?: string[] | null;
        coverData?: string | null;
    };
};

const ReaderStage: React.FC<Props> = ({
    totalPages,
    currentPage,
    readingProgress,
    progressAriaText,
    isLastPage,
    isTransitionPage,
    isCompletionPage,
    transitionDirection,
    activeTransitionTarget,
    completionRecommendations,
    completionSourceUrl,
    continuationCoverSrc,
    continuationLoading,
    continuationError,
    onContinue,
    onReturnToLibrary,
    onOpenSource,
    onOpenRecommendation,
    currentImageSrc,
    activeOcrEnabled,
    showBoxes,
    allOcrBoxes,
    selectedBoxes,
    onSelectBox,
    manualSelectionEnabled,
    manualSelectionLoading,
    onManualSelectionComplete,
    imgRef,
    emptyState,
}) => {
    return (
        <div className="reader-view">
            <div className="reader-stage">
                {totalPages > 0 ? (
                    <div
                        className="reader-progress"
                        role="progressbar"
                        aria-label="Progression de lecture"
                        aria-valuemin={1}
                        aria-valuemax={totalPages}
                        aria-valuenow={Math.min(currentPage, totalPages)}
                        aria-valuetext={progressAriaText}
                        title={progressAriaText}
                    >
                        <span className="reader-progress-track">
                            <span
                                className={`reader-progress-fill${isLastPage ? ' completed' : ''}`}
                                style={{ height: `${readingProgress}%` }}
                            />
                        </span>
                    </div>
                ) : null}

                <div className="reader-stage-content">
                    {isCompletionPage ? (
                        <ReaderCompletion
                            recommendations={completionRecommendations}
                            sourceUrl={completionSourceUrl}
                            onReturnToLibrary={onReturnToLibrary}
                            onOpenSource={onOpenSource}
                            onOpenRecommendation={onOpenRecommendation}
                        />
                    ) : isTransitionPage && activeTransitionTarget ? (
                        <ReaderChapterTransition
                            direction={transitionDirection === 'previous' ? 'previous' : 'next'}
                            title={activeTransitionTarget.title}
                            chapterLabel={activeTransitionTarget.chapterLabel}
                            coverSrc={continuationCoverSrc}
                            loading={continuationLoading}
                            error={continuationError}
                            onContinue={() => {
                                onContinue(transitionDirection === 'previous' ? 'previous' : 'next');
                            }}
                        />
                    ) : currentImageSrc ? (
                        <ImageViewer
                            src={currentImageSrc}
                            imgRef={imgRef}
                            ocrEnabled={activeOcrEnabled}
                            showBoxes={showBoxes}
                            detectedBoxes={allOcrBoxes}
                            selectedBoxes={selectedBoxes}
                            onSelectBox={onSelectBox}
                            manualSelectionEnabled={manualSelectionEnabled}
                            manualSelectionLoading={manualSelectionLoading}
                            onManualSelectionComplete={onManualSelectionComplete}
                        />
                    ) : (
                        <ReaderEmptyState
                            mangaPath={emptyState.mangaPath}
                            hasGetMangasApi={emptyState.hasGetMangasApi}
                            hasListPagesApi={emptyState.hasListPagesApi}
                            hasGetCoverDataApi={emptyState.hasGetCoverDataApi}
                            canRunDebug={emptyState.canRunDebug}
                            onRunDebug={emptyState.onRunDebug}
                            debugError={emptyState.debugError}
                            debugList={emptyState.debugList}
                            coverData={emptyState.coverData}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReaderStage;
