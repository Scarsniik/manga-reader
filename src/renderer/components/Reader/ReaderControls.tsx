import React from 'react';

type Props = {
    canGoPrev: boolean;
    canGoNext: boolean;
    isTransitionPage: boolean;
    continuationLoading: boolean;
    transitionDirection: 'previous' | 'next' | null;
    onPrev: () => void;
    onNext: () => void;
};

const ReaderControls: React.FC<Props> = ({
    canGoPrev,
    canGoNext,
    isTransitionPage,
    continuationLoading,
    transitionDirection,
    onPrev,
    onNext,
}) => {
    return (
        <div className="reader-controls">
            <button onClick={onPrev} disabled={!canGoPrev} type="button">
                Précédent
            </button>
            <button onClick={onNext} disabled={!canGoNext} type="button">
                {isTransitionPage
                    ? (
                        continuationLoading
                            ? 'Chargement...'
                            : transitionDirection === 'previous'
                                ? 'Revenir au chapitre'
                                : 'Lancer la suite'
                    )
                    : 'Suivant'}
            </button>
        </div>
    );
};

export default ReaderControls;
