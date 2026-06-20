import React from 'react';

type Props = {
    direction: 'previous' | 'next';
    title: string;
    chapterLabel?: string | null;
    coverSrc?: string | null;
    loading: boolean;
    error?: string | null;
    onContinue: () => void;
    onFinishReadingList?: () => void;
    onOpenDetails?: () => void;
    targetKind?: 'library' | 'scraper' | 'reading-list';
    isReadingListCompletion?: boolean;
};

const ReaderChapterTransition: React.FC<Props> = ({
    direction,
    title,
    chapterLabel,
    coverSrc,
    loading,
    error,
    onContinue,
    onFinishReadingList,
    onOpenDetails,
    targetKind,
    isReadingListCompletion = false,
}) => {
    const isPrevious = direction === 'previous';
    const isReadingList = targetKind === 'reading-list';
    const eyebrow = isReadingList ? 'Manga terminé' : isPrevious ? 'Début du chapitre' : 'Fin du chapitre';
    const titleText = isReadingList
        ? isReadingListCompletion ? 'La liste de lecture est terminée' : 'La liste de lecture continue'
        : isPrevious ? 'Le chapitre précédent est disponible' : 'La suite est prête';
    const message = isPrevious
        ? 'Le chapitre précédent sera ouvert si tu continues avec la page précédente.'
        : isReadingList
        ? isReadingListCompletion
            ? 'Continue avec la page suivante pour afficher le résumé de la lecture.'
            : 'Le manga suivant de la liste sera ouvert si tu continues avec la page suivante.'
        : 'Le prochain chapitre sera ouvert si tu continues avec la page suivante.';
    const metaLabel = isPrevious ? 'Lecture précédente' : 'Prochaine lecture';
    const hint = isPrevious
        ? 'Utilise Précédent, la touche ← ou le bouton ci-dessous.'
        : 'Utilise Suivant, la touche → ou le bouton ci-dessous.';
    const buttonLabel = isPrevious
        ? 'Ouvrir le précédent'
        : isReadingListCompletion ? 'Voir le résumé' : isReadingList ? 'Lire le manga suivant' : 'Lancer la suite';
    const loadingLabel = isPrevious
        ? 'Chargement du précédent...'
        : isReadingListCompletion ? 'Ouverture du résumé...' : isReadingList ? 'Chargement du manga...' : 'Chargement du chapitre...';

    return (
        <section
            className={`reader-transition ${isPrevious ? 'is-previous' : 'is-next'}`}
            aria-label={isPrevious ? 'Transition vers le chapitre précédent' : 'Transition vers le chapitre suivant'}
        >
            <div className="reader-transition__eyebrow">{eyebrow}</div>
            <h2 className="reader-transition__title">{titleText}</h2>
            <p className="reader-transition__message">{message}</p>

            <div className="reader-transition__card">
                <div className="reader-transition__cover">
                    {coverSrc ? (
                        <img src={coverSrc} alt={`Couverture de ${title}`} />
                    ) : (
                        <div className="reader-transition__cover-placeholder">Aucune couverture</div>
                    )}
                </div>

                <div className="reader-transition__content">
                    <div className="reader-transition__meta-label">{metaLabel}</div>
                    <strong className="reader-transition__next-title">{title}</strong>
                    {chapterLabel ? (
                        <span className="reader-transition__chapter">{chapterLabel}</span>
                    ) : null}
                    <p className="reader-transition__hint">{hint}</p>
                    {error ? <p className="reader-transition__error">{error}</p> : null}
                    <div className="reader-transition__actions">
                        {isReadingList && onOpenDetails ? (
                            <button
                                type="button"
                                className="reader-transition__button secondary"
                                onClick={onOpenDetails}
                            >
                                Ouvrir la fiche du manga lu
                            </button>
                        ) : null}
                        {isReadingList && !isReadingListCompletion && onFinishReadingList ? (
                            <button
                                type="button"
                                className="reader-transition__button secondary"
                                onClick={onFinishReadingList}
                            >
                                Terminer la liste
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="reader-transition__button"
                            onClick={onContinue}
                            disabled={loading}
                        >
                            {loading ? loadingLabel : buttonLabel}
                        </button>
                    </div>
                </div>
            </div>

        </section>
    );
};

export default ReaderChapterTransition;
