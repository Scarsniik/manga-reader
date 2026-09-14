import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import QuickReviewActions from "@/renderer/components/QuickReview/QuickReviewActions";
import QuickReviewLinks from "@/renderer/components/QuickReview/QuickReviewLinks";
import QuickReviewSeriesHeader from "@/renderer/components/QuickReview/QuickReviewSeriesHeader";
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
import type {
  QuickReviewItem,
  QuickReviewOpenSeries,
  QuickReviewSeriesSession,
} from "@/renderer/components/QuickReview/types";
import useQuickReviewDetails from "@/renderer/components/QuickReview/useQuickReviewDetails";
import useQuickReviewBookmark from "@/renderer/components/QuickReview/useQuickReviewBookmark";
import useQuickReviewLayout from "@/renderer/components/QuickReview/useQuickReviewLayout";
import useQuickReviewPotentialMatches from "@/renderer/components/QuickReview/useQuickReviewPotentialMatches";
import useQuickReviewShortcuts from "@/renderer/components/QuickReview/useQuickReviewShortcuts";
import useQuickReviewThumbnailScroll from "@/renderer/components/QuickReview/useQuickReviewThumbnailScroll";
import { EyeIcon, LoadingSpinnerIcon } from "@/renderer/components/icons";
import useModal from "@/renderer/hooks/useModal";
import useParams from "@/renderer/hooks/useParams";
import useShortcutSettings from "@/renderer/hooks/useShortcutSettings";
import {
  getScraperSingleSourceLanguageCodes,
} from "@/renderer/utils/scraperBookmarkMetadata";
import {
  recordScraperCardsSeen,
  setScraperCardRead,
  useScraperViewHistory,
} from "@/renderer/stores/scraperViewHistory";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import {
  normalizeQuickReviewDisplaySettings,
  normalizeQuickReviewKeyboardScrollSpeed,
  normalizeQuickReviewThumbnailMaxColumns,
  normalizeQuickReviewThumbnailSize,
} from "@/shared/quickReviewSettings";
import "@/renderer/components/QuickReview/scrollbars.scss";
import "@/renderer/components/QuickReview/style.scss";

type Props = {
  items: QuickReviewItem[];
  onOpenSeries?: QuickReviewOpenSeries;
  seriesSession?: QuickReviewSeriesSession;
};

export default function QuickReviewDialog({ items, onOpenSeries, seriesSession }: Props) {
  const { closeModal } = useModal();
  const { params } = useParams();
  const { shortcuts } = useShortcutSettings();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [coverIndex, setCoverIndex] = React.useState(0);
  const [previewedThumbnailIndex, setPreviewedThumbnailIndex] = React.useState<number | null>(null);
  const [markingRead, setMarkingRead] = React.useState(false);
  const [potentialMatchesToggleRequest, setPotentialMatchesToggleRequest] = React.useState(0);
  const [openingSeriesId, setOpeningSeriesId] = React.useState<string | null>(null);
  const thumbnailSize = normalizeQuickReviewThumbnailSize(params?.quickReviewThumbnailSize);
  const thumbnailMaxColumns = normalizeQuickReviewThumbnailMaxColumns(
    params?.quickReviewThumbnailMaxColumns,
  );
  const keyboardScrollSpeed = normalizeQuickReviewKeyboardScrollSpeed(
    params?.quickReviewKeyboardScrollSpeed,
  );
  const displaySettings = normalizeQuickReviewDisplaySettings(params);
  const { containerRef, wide } = useQuickReviewLayout(
    thumbnailSize,
    thumbnailMaxColumns,
    displaySettings.quickReviewShowThumbnails,
  );
  const currentItem = items[currentIndex] ?? null;
  const isComplete = currentIndex >= items.length;
  const itemIndexById = React.useMemo(
    () => new Map(items.map((item, index) => [item.id, index])),
    [items],
  );
  const currentSeriesPosition = React.useMemo(() => {
    if (!currentItem || !seriesSession) return null;

    for (let seriesIndex = 0; seriesIndex < seriesSession.groups.length; seriesIndex += 1) {
      const series = seriesSession.groups[seriesIndex];
      const chapterIndex = series.chapters.findIndex((chapter) => chapter.itemId === currentItem.id);
      if (chapterIndex >= 0) return { chapterIndex, series, seriesIndex };
    }

    return null;
  }, [currentItem, seriesSession]);
  const primaryViewIdentity = React.useMemo(() => (
    currentItem
      ? buildSearchResultViewHistoryIdentity(
        currentItem.primarySource.scraper.id,
        currentItem.primarySource.result,
      )
      : null
  ), [currentItem]);
  const viewHistory = useScraperViewHistory({
    scraperId: currentItem?.primarySource.scraper.id,
    enabled: Boolean(currentItem),
  });
  const isMarkedRead = Boolean(
    primaryViewIdentity && viewHistory.getRecord(primaryViewIdentity)?.readAt,
  );
  const {
    detailsState,
    details,
    chapterCount,
    detailsLoading,
    detailsByItemId,
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
  const chapterCountLabel = chapterCount === null
    ? null
    : `${chapterCount} chapitre${chapterCount === 1 ? "" : "s"}`;
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
    currentIndex,
    detailsByItemId,
    enabled: params?.scraperCardPotentialMatchesEnabled !== false,
    items,
    onOpenError: setOpenError,
  });
  const isBookmarked = bookmark.isBookmarked;
  const { confirmBookmark } = usePotentialMangaMatchBookmarkGuard(potentialMatches);
  const bookmarkVerificationLoading = bookmark.verificationLoading || potentialMatches.loading;
  const potentialMatchesAvailable = Boolean(
    potentialMatches.readingMatches.length
    || potentialMatches.bookmarkMatches.length
    || potentialMatches.readingListMatches.length
  );

  const handleToggleRead = React.useCallback(async () => {
    if (!primaryViewIdentity || markingRead) return;
    setMarkingRead(true);
    setOpenError(null);
    try {
      await setScraperCardRead({
        ...primaryViewIdentity,
        read: !isMarkedRead,
      });
    } catch (error) {
      setOpenError(
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour l'état de lecture.",
      );
    } finally {
      setMarkingRead(false);
    }
  }, [isMarkedRead, markingRead, primaryViewIdentity]);

  const goPrevious = React.useCallback(() => {
    if (bookmark.bookmarking) return;
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, [bookmark.bookmarking]);

  const goNext = React.useCallback(() => {
    if (bookmark.bookmarking) return;
    setCurrentIndex((index) => Math.min(items.length, index + 1));
  }, [bookmark.bookmarking, items.length]);

  const goToItemId = React.useCallback((itemId: string) => {
    if (bookmark.bookmarking) return;
    const itemIndex = itemIndexById.get(itemId);
    if (itemIndex !== undefined) setCurrentIndex(itemIndex);
  }, [bookmark.bookmarking, itemIndexById]);

  const goPreviousSeries = React.useCallback(() => {
    if (!currentSeriesPosition || currentSeriesPosition.seriesIndex === 0) return;
    const previousSeries = seriesSession?.groups[currentSeriesPosition.seriesIndex - 1];
    const itemId = previousSeries?.chapters[0]?.itemId;
    if (itemId) goToItemId(itemId);
  }, [currentSeriesPosition, goToItemId, seriesSession]);

  const goNextSeries = React.useCallback(() => {
    if (!currentSeriesPosition) return;
    const nextSeries = seriesSession?.groups[currentSeriesPosition.seriesIndex + 1];
    const itemId = nextSeries?.chapters[0]?.itemId;
    if (itemId) goToItemId(itemId);
  }, [currentSeriesPosition, goToItemId, seriesSession]);

  const handleOpenCurrentSeries = React.useCallback(async () => {
    const series = currentSeriesPosition?.series;
    if (!series || !onOpenSeries || openingSeriesId) return;

    setOpenError(null);
    setOpeningSeriesId(series.id);
    try {
      const opened = await onOpenSeries(series.id);
      if (!opened) {
        setOpenError("Impossible d'ouvrir cette série dans un nouvel onglet workspace.");
      }
    } catch (error) {
      setOpenError(error instanceof Error
        ? error.message
        : "Impossible d'ouvrir cette série dans un nouvel onglet workspace.");
    } finally {
      setOpeningSeriesId(null);
    }
  }, [currentSeriesPosition, onOpenSeries, openingSeriesId]);

  const { scrollRef: thumbnailScrollRef, scrollThumbnails } = useQuickReviewThumbnailScroll({
    canLoadMore: canLoadMoreThumbnails,
    keyboardScrollSpeed,
    loadingMore: loadingMoreThumbnails,
    onLoadMore: loadMoreThumbnails,
    resetKey: currentItem?.id ?? String(currentIndex),
    vertical: wide,
  });
  const closeThumbnailPreview = React.useCallback(() => setPreviewedThumbnailIndex(null), []);

  const handleBookmark = React.useCallback(async () => {
    if (bookmark.bookmarking || bookmarkVerificationLoading) return;
    if (isBookmarked) {
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
    isBookmarked,
  ]);

  useQuickReviewShortcuts({
    bookmarking: bookmark.bookmarking,
    closeModal,
    goNext,
    goNextSeries,
    goPrevious,
    goPreviousSeries,
    handleBookmark,
    isComplete,
    markingRead,
    onClosePreview: closeThumbnailPreview,
    onOpenSeries: onOpenSeries ? handleOpenCurrentSeries : undefined,
    onTogglePotentialMatches: () => setPotentialMatchesToggleRequest((request) => request + 1),
    onToggleRead: handleToggleRead,
    potentialMatchesAvailable,
    previewOpen: previewedThumbnailIndex !== null,
    scrollThumbnails,
    seriesActive: Boolean(currentSeriesPosition),
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
  const potentialMatchesShortcut = getQuickReviewShortcutLabel(
    shortcuts.quickReviewPotentialMatchesToggle,
  );
  const markReadShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewMarkRead);
  const previousSeriesShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewSeriesPrevious);
  const nextSeriesShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewSeriesNext);
  const openSeriesShortcut = getQuickReviewShortcutLabel(shortcuts.quickReviewOpenSeries);
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

        {currentSeriesPosition && seriesSession ? (
          <QuickReviewSeriesHeader
            chapterIndex={currentSeriesPosition.chapterIndex}
            contextLabel={seriesSession.contextLabel}
            nextSeriesShortcut={nextSeriesShortcut}
            onNextSeries={goNextSeries}
            onOpenSeries={onOpenSeries ? () => void handleOpenCurrentSeries() : undefined}
            onPreviousSeries={goPreviousSeries}
            onSelectChapter={goToItemId}
            openSeriesShortcut={openSeriesShortcut}
            openingSeries={openingSeriesId === currentSeriesPosition.series.id}
            previousSeriesShortcut={previousSeriesShortcut}
            series={currentSeriesPosition.series}
            seriesCount={seriesSession.groups.length}
            seriesIndex={currentSeriesPosition.seriesIndex}
          />
        ) : null}

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
                  decoding="async"
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
                    {chapterCountLabel ? <span>{chapterCountLabel}</span> : null}
                    {pageCount ? <span>{pageCount}</span> : null}
                    {details?.mangaStatus ? <span>{details.mangaStatus}</span> : null}
                    {isBookmarked ? (
                      <span className="quick-review__bookmark-status">Déjà bookmarké</span>
                    ) : null}
                  </div> : null}
                </div>
                <div className="quick-review__title-actions">
                  <button
                    type="button"
                    className={[
                      "quick-review__read-toggle",
                      isMarkedRead ? "is-read" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => void handleToggleRead()}
                    disabled={markingRead || viewHistory.loading || !primaryViewIdentity}
                    title={`${isMarkedRead ? "Marquer comme non lu" : "Marquer comme lu"}${markReadShortcut ? ` (${markReadShortcut})` : ""}`}
                    aria-label={`${isMarkedRead ? "Marquer comme non lu" : "Marquer comme lu"} ${title}`}
                    aria-pressed={isMarkedRead}
                    aria-busy={markingRead}
                  >
                    {markingRead
                      ? <LoadingSpinnerIcon aria-hidden="true" />
                      : <EyeIcon aria-hidden="true" focusable="false" />}
                  </button>
                  {detailsLoading ? <LoadingSpinnerIcon className="quick-review__details-spinner" aria-hidden="true" /> : null}
                </div>
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
                  seriesProgress={potentialMatches.seriesProgress}
                  seriesReadingWarning={potentialMatches.seriesReadingWarning}
                  fallbackCover={activeCoverUrl}
                  fallbackCoverReferer={sourceUrl}
                  loading={potentialMatches.loading}
                  portalMenus
                  horizontalBoundarySelector=".quick-review-modal"
                  toggleOpenRequest={potentialMatchesToggleRequest}
                  toggleShortcutLabel={potentialMatchesShortcut}
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
          isBookmarked={isBookmarked}
          nextLabel={currentSeriesPosition ? "Chapitre suivant" : undefined}
          nextShortcut={nextShortcut}
          onBookmark={() => void handleBookmark()}
          onNext={goNext}
          onPrevious={goPrevious}
          previousShortcut={previousShortcut}
          previousLabel={currentSeriesPosition ? "Chapitre précédent" : undefined}
          sourceAvailable={Boolean(sourceUrl)}
        />
      </div>

      {wide ? thumbnailsPanel : null}
    </div>
  );
}
