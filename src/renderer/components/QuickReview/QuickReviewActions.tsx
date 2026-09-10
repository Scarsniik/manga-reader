import React from "react";
import {
  BookmarkRibbonIcon,
  ChevronLeftIcon,
  LoadingSpinnerIcon,
} from "@/renderer/components/icons";

type Props = {
  bookmarkShortcut: string;
  bookmarking: boolean;
  bookmarkVerificationLoading: boolean;
  currentIndex: number;
  isBookmarked: boolean;
  nextShortcut: string;
  onBookmark: () => void;
  onNext: () => void;
  onPrevious: () => void;
  previousShortcut: string;
  sourceAvailable: boolean;
};

export default function QuickReviewActions({
  bookmarkShortcut,
  bookmarking,
  bookmarkVerificationLoading,
  currentIndex,
  isBookmarked,
  nextShortcut,
  onBookmark,
  onNext,
  onPrevious,
  previousShortcut,
  sourceAvailable,
}: Props) {
  return (
    <div className="quick-review__actions">
      <button
        type="button"
        className="quick-review__navigate is-previous"
        onClick={onPrevious}
        disabled={bookmarking || currentIndex === 0}
        title={previousShortcut}
      >
        <ChevronLeftIcon aria-hidden="true" />
        <span>Précédent<small>{previousShortcut}</small></span>
      </button>
      <button
        type="button"
        className={[
          "quick-review__bookmark",
          isBookmarked ? "is-bookmarked" : "",
        ].filter(Boolean).join(" ")}
        onClick={onBookmark}
        disabled={bookmarking || bookmarkVerificationLoading || !sourceAvailable}
        title={isBookmarked
          ? `Déjà bookmarké · passer au suivant (${bookmarkShortcut})`
          : `Bookmarker et passer au suivant (${bookmarkShortcut})`}
        aria-pressed={isBookmarked}
        aria-busy={bookmarking || bookmarkVerificationLoading}
      >
        {bookmarking || bookmarkVerificationLoading
          ? <LoadingSpinnerIcon className="quick-review__bookmark-spinner" aria-hidden="true" />
          : <BookmarkRibbonIcon className="quick-review__bookmark-icon" aria-hidden="true" />}
        <span>
          {bookmarkVerificationLoading
            ? "Vérification…"
            : isBookmarked ? "Déjà bookmarké · suivant" : "Bookmark et suivant"}
          <small>{bookmarkShortcut}</small>
        </span>
      </button>
      <button
        type="button"
        className="quick-review__navigate is-next"
        onClick={onNext}
        disabled={bookmarking}
        title={nextShortcut}
      >
        <span>Suivant<small>{nextShortcut}</small></span>
        <ChevronLeftIcon aria-hidden="true" />
      </button>
    </div>
  );
}
