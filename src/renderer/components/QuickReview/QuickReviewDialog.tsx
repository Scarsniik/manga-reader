import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import QuickReviewActions from "@/renderer/components/QuickReview/QuickReviewActions";
import QuickReviewLinks from "@/renderer/components/QuickReview/QuickReviewLinks";
import QuickReviewThumbnails from "@/renderer/components/QuickReview/QuickReviewThumbnails";
import ScraperPotentialMangaMatches from "@/renderer/components/ScraperBrowser/components/ScraperPotentialMangaMatches";
import usePotentialMangaMatchBookmarkGuard from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchBookmarkGuard";
import {
  buildQuickReviewCoverUrls,
  getQuickReviewSourceUrl,
} from "@/renderer/components/QuickReview/quickReviewImages";
import {
  getQuickReviewShortcutLabel,
  normalizeQuickReviewTextSlots,
  uniqueQuickReviewText,
} from "@/renderer/components/QuickReview/quickReviewText";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import useQuickReviewDetails from "@/renderer/components/QuickReview/useQuickReviewDetails";
import useQuickReviewBookmark from "@/renderer/components/QuickReview/useQuickReviewBookmark";
import useQuickReviewLayout from "@/renderer/components/QuickReview/useQuickReviewLayout";
import useQuickReviewPotentialMatches from "@/renderer/components/QuickReview/useQuickReviewPotentialMatches";
import useQuickReviewShortcuts from "@/renderer/components/QuickReview/useQuickReviewShortcuts";
import { LoadingSpinnerIcon } from "@/renderer/components/icons";
import useModal from "@/renderer/hooks/useModal";
import useParams from "@/renderer/hooks/useParams";
import useShortcutSettings from "@/renderer/hooks/useShortcutSettings";
import {
  getScraperSingleSourceLanguageCodes,
} from "@/renderer/utils/scraperBookmarkMetadata";
import { recordScraperCardsSeen } from "@/renderer/stores/scraperViewHistory";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import {
  normalizeQuickReviewDisplaySettings,
  normalizeQuickReviewThumbnailMaxColumns,
  normalizeQuickReviewThumbnailSize,
} from "@/shared/quickReviewSettings";
import "@/renderer/components/QuickReview/scrollbars.scss";
import "@/renderer/components/QuickReview/style.scss";

type Props = { items: QuickReviewItem[] };

const THUMBNAIL_END_DOUBLE_PRESS_DELAY_MS = 550;
const THUMBNAIL_SCROLL_EDGE_TOLERANCE_PX = 2;

const getThumbnailScrollStops = (
  container: HTMLDivElement,
  vertical: boolean,
  scrollPosition: number,
): number[] => {
  const containerRect = container.getBoundingClientRect();
  const positions = Array.from(container.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.offsetParent !== null)
    .map((child) => {
      const childRect = child.getBoundingClientRect();
      return scrollPosition + (vertical
        ? childRect.top - containerRect.top
        : childRect.left - containerRect.left);
    })
    .sort((first, second) => first - second);

  return positions.filter((position, index) => (
    index === 0
    || position - positions[index - 1] > THUMBNAIL_SCROLL_EDGE_TOLERANCE_PX
  ));
};

export default function QuickReviewDialog({ items }: Props) {
  const { closeModal } = useModal();
  const { params } = useParams();
  const { shortcuts } = useShortcutSettings();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [coverIndex, setCoverIndex] = React.useState(0);
  const [previewedThumbnailIndex, setPreviewedThumbnailIndex] = React.useState<number | null>(null);
  const thumbnailScrollRef = React.useRef<HTMLDivElement>(null);
  const lastBlockedThumbnailNextPressRef = React.useRef<number | null>(null);
  const thumbnailSize = normalizeQuickReviewThumbnailSize(params?.quickReviewThumbnailSize);
  const thumbnailMaxColumns = normalizeQuickReviewThumbnailMaxColumns(
    params?.quickReviewThumbnailMaxColumns,
  );
  const displaySettings = normalizeQuickReviewDisplaySettings(params);
  const { containerRef, wide } = useQuickReviewLayout(
    thumbnailSize,
    thumbnailMaxColumns,
    displaySettings.quickReviewShowThumbnails,
  );
  const currentItem = items[currentIndex] ?? null;
  const isComplete = currentIndex >= items.length;
  const {
    detailsState,
    details,
    detailsLoading,
    loadingMoreThumbnails,
    canLoadMoreThumbnails,
    loadMoreThumbnailsLabel,
    loadMoreThumbnails,
  } = useQuickReviewDetails(
    items,
    currentIndex,
    currentItem,
    displaySettings.quickReviewShowCover,
    displaySettings.quickReviewShowThumbnails,
  );

  React.useLayoutEffect(() => {
    setCoverIndex(0);
    setOpenError(null);
    setPreviewedThumbnailIndex(null);
    lastBlockedThumbnailNextPressRef.current = null;
  }, [currentItem?.id]);

  React.useEffect(() => {
    if (!currentItem) return;
    const identities = currentItem.availableSources.map((source) => (
      buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)
    ));
    void recordScraperCardsSeen(identities).catch(() => undefined);
  }, [currentItem]);

  const primaryResult = currentItem?.primarySource.result ?? null;
  const title = currentItem?.displayTitle || details?.title || primaryResult?.title || "Manga";
  const authors = normalizeQuickReviewTextSlots(details?.authors.length ? details.authors : primaryResult?.authorNames ?? []);
  const authorUrls = normalizeQuickReviewTextSlots(
    details?.authorUrls.length
      ? details.authorUrls
      : primaryResult?.authorUrls?.length
        ? primaryResult.authorUrls
        : primaryResult?.authorUrl
          ? [primaryResult.authorUrl]
          : [],
  );
  const tags = normalizeQuickReviewTextSlots(details?.tags.length ? details.tags : primaryResult?.tags ?? []);
  const tagUrls = normalizeQuickReviewTextSlots(details?.tagUrls.length ? details.tagUrls : primaryResult?.tagUrls ?? []);
  const sourceNames = normalizeQuickReviewTextSlots(details?.sources.length ? details.sources : primaryResult?.sourceNames ?? []);
  const sourceUrls = normalizeQuickReviewTextSlots(details?.sourceUrls.length ? details.sourceUrls : primaryResult?.sourceUrls ?? []);
  const languageCodes = uniqueQuickReviewText(
    details?.languageCodes.length
      ? details.languageCodes
      : currentItem?.displayLanguageCodes?.length
        ? currentItem.displayLanguageCodes
        : primaryResult?.languageCodes?.length
          ? primaryResult.languageCodes
          : getScraperSingleSourceLanguageCodes(currentItem?.primarySource.scraper),
  );
  const summary = details?.description || currentItem?.displaySummary || primaryResult?.summary;
  const pageCount = details?.pageCount || currentItem?.displayPageCount || primaryResult?.pageCount;
  const sourceUrl = getQuickReviewSourceUrl(currentItem, details);
  const coverUrls = React.useMemo(
    () => currentItem ? buildQuickReviewCoverUrls(currentItem, details) : [],
    [currentItem, details],
  );
  const activeCoverUrl = coverUrls[coverIndex];
  const bookmark = useQuickReviewBookmark({
    item: currentItem,
    details,
    title,
    authors,
    authorUrls,
    tags,
    sourceNames,
    sourceUrls,
    pageCount,
    languageCodes,
    onError: setOpenError,
  });
  const potentialMatches = useQuickReviewPotentialMatches({
    item: currentItem,
    details,
    enabled: params?.scraperCardPotentialMatchesEnabled !== false,
    onOpenError: setOpenError,
  });
  const { confirmBookmark } = usePotentialMangaMatchBookmarkGuard(potentialMatches);
  const bookmarkVerificationLoading = bookmark.verificationLoading || potentialMatches.loading;

  const goPrevious = React.useCallback(() => {
    if (bookmark.bookmarking) return;
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, [bookmark.bookmarking]);

  const goNext = React.useCallback(() => {
    if (bookmark.bookmarking) return;
    setCurrentIndex((index) => Math.min(items.length, index + 1));
  }, [bookmark.bookmarking, items.length]);

  const scrollThumbnails = React.useCallback((direction: -1 | 1) => {
    const container = thumbnailScrollRef.current;
    if (!container) return;
    const scrollPosition = wide ? container.scrollTop : container.scrollLeft;
    const maximumScroll = wide
      ? container.scrollHeight - container.clientHeight
      : container.scrollWidth - container.clientWidth;
    const reachedEdge = direction > 0
      ? scrollPosition >= maximumScroll - THUMBNAIL_SCROLL_EDGE_TOLERANCE_PX
      : scrollPosition <= THUMBNAIL_SCROLL_EDGE_TOLERANCE_PX;

    if (reachedEdge) {
      if (direction > 0 && canLoadMoreThumbnails && !loadingMoreThumbnails) {
        const now = performance.now();
        const previousBlockedPress = lastBlockedThumbnailNextPressRef.current;
        if (
          previousBlockedPress !== null
          && now - previousBlockedPress <= THUMBNAIL_END_DOUBLE_PRESS_DELAY_MS
        ) {
          lastBlockedThumbnailNextPressRef.current = null;
          void loadMoreThumbnails();
        } else {
          lastBlockedThumbnailNextPressRef.current = now;
        }
      } else {
        lastBlockedThumbnailNextPressRef.current = null;
      }
      return;
    }

    lastBlockedThumbnailNextPressRef.current = null;
    const scrollStops = getThumbnailScrollStops(container, wide, scrollPosition);
    const targetStop = direction > 0
      ? scrollStops.find((position) => (
        position > scrollPosition + THUMBNAIL_SCROLL_EDGE_TOLERANCE_PX
      )) ?? maximumScroll
      : [...scrollStops].reverse().find((position) => (
        position < scrollPosition - THUMBNAIL_SCROLL_EDGE_TOLERANCE_PX
      )) ?? 0;
    const targetPosition = Math.max(0, Math.min(maximumScroll, targetStop));

    container.scrollTo(wide
      ? { top: targetPosition, behavior: "smooth" }
      : { left: targetPosition, behavior: "smooth" });
  }, [canLoadMoreThumbnails, loadMoreThumbnails, loadingMoreThumbnails, wide]);
  const closeThumbnailPreview = React.useCallback(() => setPreviewedThumbnailIndex(null), []);

  const handleBookmark = React.useCallback(async () => {
    if (bookmark.bookmarking || bookmarkVerificationLoading) return;
    if (bookmark.isBookmarked) {
      goNext();
      return;
    }

    confirmBookmark(() => {
      void bookmark.saveBookmark().then((saved) => {
        if (saved) goNext();
      });
    });
  }, [
    bookmark,
    bookmarkVerificationLoading,
    confirmBookmark,
    goNext,
  ]);

  useQuickReviewShortcuts({
    bookmarking: bookmark.bookmarking,
    closeModal,
    goNext,
    goPrevious,
    handleBookmark,
    isComplete,
    onClosePreview: closeThumbnailPreview,
    previewOpen: previewedThumbnailIndex !== null,
    scrollThumbnails,
    shortcuts,
    thumbnailsVisible: displaySettings.quickReviewShowThumbnails,
  });

  if (!items.length) {
    return <div className="quick-review__empty">Aucune fiche visible à revoir.</div>;
  }

  if (isComplete) {
    return (
      <div className="quick-review__complete">
        <span className="quick-review__complete-mark" aria-hidden="true">✓</span>
        <h3>Review terminée</h3>
        <p>{items.length} fiche(s) parcourue(s), {bookmark.bookmarkedCount} bookmark(s) ajouté(s).</p>
        <div className="quick-review__complete-actions">
          <button type="button" onClick={() => setCurrentIndex(items.length - 1)}>Revenir à la dernière</button>
          <button type="button" className="primary" onClick={() => setCurrentIndex(0)}>Recommencer</button>
        </div>
      </div>
    );
  }

  const previousShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewPrevious);
  const nextShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewNext);
  const bookmarkShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewBookmark);
  const thumbnailsPanel = displaySettings.quickReviewShowThumbnails ? (
    <QuickReviewThumbnails
      large={wide}
      canLoadMore={canLoadMoreThumbnails}
      loading={detailsLoading}
      loadingMore={loadingMoreThumbnails}
      loadMoreLabel={loadMoreThumbnailsLabel}
      onLoadMore={() => void loadMoreThumbnails()}
      onPreviewIndexChange={setPreviewedThumbnailIndex}
      previewIndex={previewedThumbnailIndex}
      resetKey={currentItem?.id ?? String(currentIndex)}
      scrollRef={thumbnailScrollRef}
      thumbnailSize={thumbnailSize}
      thumbnails={details?.thumbnails}
      title={title}
    />
  ) : null;

  return (
    <div
      ref={containerRef}
      className={["quick-review", wide ? "is-wide" : ""].join(" ").trim()}
    >
      <div className="quick-review__main">
        <div className="quick-review__progress-row">
          <strong>{currentIndex + 1} / {items.length}</strong>
          <span>{currentItem?.primarySource.scraper.name}</span>
        </div>
        <div className="quick-review__progress-track" aria-hidden="true">
          <span style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }} />
        </div>

        <article className={[
          "quick-review__card",
          displaySettings.quickReviewShowCover ? "" : "without-cover",
        ].filter(Boolean).join(" ")}>
          {displaySettings.quickReviewShowCover ? <div className="quick-review__cover-pane">
            <button
              type="button"
              className="quick-review__cover"
              onClick={() => {
                if (!currentItem || !sourceUrl) return;
                void openWorkspaceTarget({
                  kind: "scraper.details",
                  scraperId: currentItem.primarySource.scraper.id,
                  sourceUrl,
                  title,
                }, { activate: false });
              }}
              disabled={!sourceUrl}
              title="Ouvrir la fiche dans un nouvel onglet"
            >
              {activeCoverUrl ? (
                <img
                  key={`${currentItem?.id}:${activeCoverUrl}`}
                  src={activeCoverUrl}
                  alt={title}
                  decoding="sync"
                  fetchPriority="high"
                  onError={() => setCoverIndex((index) => index + 1)}
                />
              ) : (
                <span>Pas de couverture</span>
              )}
            </button>
          </div> : null}

          <div className="quick-review__details">
            <div className="quick-review__content">
              <div className="quick-review__title-row">
                <div>
                  <h2>{title}</h2>
                  {displaySettings.quickReviewShowFacts ? <div className="quick-review__facts">
                    <span>{currentItem?.primarySource.scraper.name}</span>
                    {languageCodes.length ? <LanguageFlags languageCodes={languageCodes} /> : null}
                    {pageCount ? <span>{pageCount}</span> : null}
                    {details?.mangaStatus ? <span>{details.mangaStatus}</span> : null}
                    {bookmark.isBookmarked ? (
                      <span className="quick-review__bookmark-status">Déjà bookmarké</span>
                    ) : null}
                  </div> : null}
                </div>
                {detailsLoading ? <LoadingSpinnerIcon className="quick-review__details-spinner" aria-hidden="true" /> : null}
              </div>

              {displaySettings.quickReviewShowDescription && summary
                ? <p className="quick-review__summary">{summary}</p>
                : null}
              {detailsState?.error ? <p className="quick-review__notice">{detailsState.error}</p> : null}
              {openError ? <p className="quick-review__notice is-error">{openError}</p> : null}

              {displaySettings.quickReviewShowPotentialMatches ? (
                <ScraperPotentialMangaMatches
                  readingMatches={potentialMatches.readingMatches}
                  bookmarkMatches={potentialMatches.bookmarkMatches}
                  readingListMatches={potentialMatches.readingListMatches}
                  fallbackCover={activeCoverUrl}
                  fallbackCoverReferer={sourceUrl}
                  loading={potentialMatches.loading}
                  portalMenus
                  horizontalBoundarySelector=".quick-review-modal"
                  onOpenMatch={potentialMatches.openMatch}
                  onOpenMatchInWorkspace={potentialMatches.openMatch}
                />
              ) : null}

              {currentItem ? (
                <QuickReviewLinks
                  primarySource={currentItem.primarySource}
                  availableSources={currentItem.availableSources}
                  details={details}
                  authors={authors}
                  authorUrls={authorUrls}
                  tags={tags}
                  tagUrls={tagUrls}
                  sourceNames={sourceNames}
                  sourceUrls={sourceUrls}
                  showAuthors={displaySettings.quickReviewShowAuthors}
                  showAvailableSources={displaySettings.quickReviewShowAvailableSources}
                  showSourceWorks={displaySettings.quickReviewShowSourceWorks}
                  showTags={displaySettings.quickReviewShowTags}
                  onOpenError={setOpenError}
                />
              ) : null}
            </div>
          </div>
        </article>

        {!wide ? thumbnailsPanel : null}

        <QuickReviewActions
          bookmarkShortcut={bookmarkShortcut}
          bookmarking={bookmark.bookmarking}
          bookmarkVerificationLoading={bookmarkVerificationLoading}
          currentIndex={currentIndex}
          isBookmarked={bookmark.isBookmarked}
          nextShortcut={nextShortcut}
          onBookmark={() => void handleBookmark()}
          onNext={goNext}
          onPrevious={goPrevious}
          previousShortcut={previousShortcut}
          sourceAvailable={Boolean(sourceUrl)}
        />
      </div>

      {wide ? thumbnailsPanel : null}
    </div>
  );
}
