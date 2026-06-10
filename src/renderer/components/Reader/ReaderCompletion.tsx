import React from "react";
import { normalizeReaderAssetSrc } from "@/renderer/components/Reader/utils";
import type { EndOfReadingRecommendation } from "@/renderer/components/Reader/endOfReadingRecommendations";
import {
    removeScraperBookmark,
    useScraperBookmark,
} from "@/renderer/stores/scraperBookmarks";
import { TrashCanIcon } from "@/renderer/components/icons";

export type ReaderCompletionBookmarkTarget = {
    scraperId: string;
    sourceUrl: string;
    title: string;
};

type Props = {
    recommendations: EndOfReadingRecommendation[];
    randomRecommendation: EndOfReadingRecommendation | null;
    sourceUrl: string | null;
    bookmarkTarget: ReaderCompletionBookmarkTarget | null;
    onReturnToLibrary: () => void;
    onOpenSource: () => void;
    onOpenRecommendation: (manga: EndOfReadingRecommendation) => void;
    onOpenRandomRecommendation: (manga: EndOfReadingRecommendation) => void;
};

type RecommendationProgress = {
    currentPage: number;
    totalPages: number;
    percent: number;
};

const getRecommendationProgress = (manga: EndOfReadingRecommendation): RecommendationProgress | null => {
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
    randomRecommendation,
    sourceUrl,
    bookmarkTarget,
    onReturnToLibrary,
    onOpenSource,
    onOpenRecommendation,
    onOpenRandomRecommendation,
}) => {
    const normalizedScraperId = String(bookmarkTarget?.scraperId ?? "").trim();
    const normalizedSourceUrl = String(bookmarkTarget?.sourceUrl ?? "").trim();
    const normalizedTitle = String(bookmarkTarget?.title ?? "ce manga").trim() || "ce manga";
    const { isBookmarked } = useScraperBookmark(normalizedScraperId, normalizedSourceUrl);
    const [bookmarkRemovalPending, setBookmarkRemovalPending] = React.useState(false);
    const [bookmarkRemovalError, setBookmarkRemovalError] = React.useState<string | null>(null);
    const canRemoveBookmark = Boolean(normalizedScraperId && normalizedSourceUrl && isBookmarked);

    React.useEffect(() => {
        setBookmarkRemovalError(null);
        setBookmarkRemovalPending(false);
    }, [normalizedScraperId, normalizedSourceUrl]);

    const handleRemoveBookmark = React.useCallback(async () => {
        if (!canRemoveBookmark || bookmarkRemovalPending) {
            return;
        }

        setBookmarkRemovalPending(true);
        setBookmarkRemovalError(null);

        try {
            const removed = await removeScraperBookmark({
                scraperId: normalizedScraperId,
                sourceUrl: normalizedSourceUrl,
            });

            if (!removed) {
                setBookmarkRemovalError("Bookmark introuvable.");
            }
        } catch (error) {
            console.error("ReaderCompletion: failed to remove scraper bookmark", error);
            setBookmarkRemovalError("Impossible de retirer le bookmark.");
        } finally {
            setBookmarkRemovalPending(false);
        }
    }, [
        bookmarkRemovalPending,
        canRemoveBookmark,
        normalizedScraperId,
        normalizedSourceUrl,
    ]);

    return (
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
                {canRemoveBookmark ? (
                    <button
                        type="button"
                        className="reader-completion__button danger"
                        onClick={() => {
                            void handleRemoveBookmark();
                        }}
                        disabled={bookmarkRemovalPending}
                        aria-busy={bookmarkRemovalPending}
                        title={`Retirer ${normalizedTitle} des bookmarks`}
                    >
                        <TrashCanIcon aria-hidden="true" focusable="false" />
                        <span>{bookmarkRemovalPending ? "Retrait..." : "Retirer le bookmark"}</span>
                    </button>
                ) : null}
                {randomRecommendation ? (
                    <button
                        type="button"
                        className="reader-completion__button secondary"
                        onClick={() => onOpenRandomRecommendation(randomRecommendation)}
                    >
                        Manga aléatoire
                    </button>
                ) : null}
            </div>

            {bookmarkRemovalError ? (
                <p className="reader-completion__error">{bookmarkRemovalError}</p>
            ) : null}

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
};

export default ReaderCompletion;
