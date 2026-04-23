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
}) => {
    const nextButtonLabel = isCompletionPage
        ? 'Fin de lecture'
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
        </div>
    );
};

export default ReaderControls;
