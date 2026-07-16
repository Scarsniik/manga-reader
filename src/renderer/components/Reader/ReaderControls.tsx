import React from 'react';

type Props = {
    canGoPrev: boolean;
    canGoNext: boolean;
    isTransitionPage: boolean;
    isCompletionPage: boolean;
    continuationLoading: boolean;
    transitionDirection: 'previous' | 'next' | null;
    onPrev: () => void;
    onNext: () => void;
    canSkipReadingListItem?: boolean;
    onSkipReadingListItem?: () => void;
};

const ReaderControls: React.FC<Props> = ({
    canGoPrev,
    canGoNext,
    isTransitionPage,
    isCompletionPage,
    continuationLoading,
    transitionDirection,
    onPrev,
    onNext,
    canSkipReadingListItem = false,
    onSkipReadingListItem,
}) => {
    const nextButtonLabel = isCompletionPage
        ? (canGoNext ? 'Suivant' : 'Fin de lecture')
        : isTransitionPage
            ? (
                continuationLoading
                    ? 'Chargement...'
                    : transitionDirection === 'previous'
                        ? 'Revenir au chapitre'
                        : 'Lancer la suite'
            )
            : 'Suivant';

    return (
        <div className="reader-controls">
            <button onClick={onPrev} disabled={!canGoPrev} type="button">
                Précédent
            </button>
            <button onClick={onNext} disabled={!canGoNext} type="button">
                {nextButtonLabel}
            </button>
            {onSkipReadingListItem && canSkipReadingListItem ? (
                <button
                    className="reader-controls__skip-reading-list-item"
                    onClick={onSkipReadingListItem}
                    type="button"
                >
                    Passer au manga suivant
                </button>
            ) : null}
        </div>
    );
};

export default ReaderControls;
