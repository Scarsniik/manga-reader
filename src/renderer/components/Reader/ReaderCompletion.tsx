import React from "react";
import { Manga } from "@/renderer/types";
import { normalizeReaderAssetSrc } from "@/renderer/components/Reader/utils";

type Props = {
    recommendations: Manga[];
    sourceUrl: string | null;
    onReturnToLibrary: () => void;
    onOpenSource: () => void;
    onOpenRecommendation: (manga: Manga) => void;
};

type RecommendationProgress = {
    currentPage: number;
    totalPages: number;
    percent: number;
};

const getRecommendationProgress = (manga: Manga): RecommendationProgress | null => {
    const currentPage = typeof manga.currentPage === "number" && Number.isFinite(manga.currentPage)
        ? Math.floor(manga.currentPage)
        : null;
    const totalPages = typeof manga.pages === "number" && Number.isFinite(manga.pages)
        ? Math.floor(manga.pages)
        : null;

    if (currentPage === null || totalPages === null || currentPage <= 1 || totalPages <= 0) {
        return null;
    }

    const normalizedCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

    return {
        currentPage: normalizedCurrentPage,
        totalPages,
        percent: Math.max(0, Math.min(100, Math.round((normalizedCurrentPage / totalPages) * 100))),
    };
};

const ReaderCompletion: React.FC<Props> = ({
    recommendations,
    sourceUrl,
    onReturnToLibrary,
    onOpenSource,
    onOpenRecommendation,
}) => (
    <section className="reader-completion" aria-label="Fin de lecture">
        <div className="reader-completion__eyebrow">Lecture terminée</div>
        <h2 className="reader-completion__title">Fin de lecture</h2>
        <p className="reader-completion__message">
            Aucune suite directe n&apos;est disponible pour cette lecture.
        </p>

        <div className="reader-completion__actions">
            <button type="button" className="reader-completion__button" onClick={onReturnToLibrary}>
                Bibliothèque
            </button>
            {sourceUrl ? (
                <button
                    type="button"
                    className="reader-completion__button secondary"
                    onClick={onOpenSource}
                >
                    Source du manga
                </button>
            ) : null}
        </div>

        {recommendations.length > 0 ? (
            <section className="reader-completion__recommendations" aria-label="Suggestions de lecture">
                <h3 className="reader-completion__recommendations-title">À lire ensuite</h3>
                <div className="reader-completion__recommendation-list">
                    {recommendations.map((recommendation) => {
                        const coverSrc = normalizeReaderAssetSrc(recommendation.thumbnailPath ?? null);
                        const progress = getRecommendationProgress(recommendation);

                        return (
                            <article className="reader-completion__recommendation" key={recommendation.id}>
                                <div className="reader-completion__recommendation-cover">
                                    {coverSrc ? (
                                        <img src={coverSrc} alt={`Couverture de ${recommendation.title}`} />
                                    ) : (
                                        <span>Aucune couverture</span>
                                    )}
                                </div>
                                <div className="reader-completion__recommendation-body">
                                    <div className="reader-completion__recommendation-header">
                                        <strong>{recommendation.title}</strong>
                                        {recommendation.chapters ? (
                                            <span>{recommendation.chapters}</span>
                                        ) : null}
                                    </div>
                                    <div className="reader-completion__recommendation-footer">
                                        {progress ? (
                                            <div
                                                className="reader-completion__recommendation-progress"
                                                role="progressbar"
                                                aria-label={`Progression de ${recommendation.title}`}
                                                aria-valuemin={0}
                                                aria-valuemax={progress.totalPages}
                                                aria-valuenow={progress.currentPage}
                                                aria-valuetext={`${progress.currentPage}/${progress.totalPages}`}
                                            >
                                                <div className="reader-completion__recommendation-progress-track">
                                                    <div
                                                        className="reader-completion__recommendation-progress-fill"
                                                        style={{ width: `${progress.percent}%` }}
                                                    />
                                                </div>
                                                <span>{`${progress.currentPage}/${progress.totalPages}`}</span>
                                            </div>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => onOpenRecommendation(recommendation)}
                                        >
                                            Lire
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>
        ) : null}
    </section>
);

export default ReaderCompletion;
