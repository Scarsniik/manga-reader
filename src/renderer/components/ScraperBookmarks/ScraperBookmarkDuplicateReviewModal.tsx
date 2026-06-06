import React, { useMemo, useState } from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import { getScraperBookmarkLanguageCodes } from "@/renderer/utils/scraperBookmarkMetadata";
import type { ScraperBookmarkDuplicateGroup } from "@/renderer/components/ScraperBookmarks/bookmarkDuplicateDetection";
import {
  getScraperBookmarkCoverUrl,
  getScraperBookmarkStableKey,
} from "@/renderer/components/ScraperBookmarks/bookmarkPresentation";

type DuplicateReviewModalContentProps = {
  groups: ScraperBookmarkDuplicateGroup[];
  scrapersById: Map<string, ScraperRecord>;
  titleLineCount: number;
  onOpenBookmarkInWorkspace: (bookmark: ScraperBookmarkRecord) => void;
  onKeepOnly: (
    group: ScraperBookmarkDuplicateGroup,
    bookmarkToKeep: ScraperBookmarkRecord,
  ) => Promise<void>;
};

type DuplicateReviewModalOptions = DuplicateReviewModalContentProps;

function ScraperBookmarkDuplicateReviewModalContent({
  groups,
  scrapersById,
  titleLineCount,
  onOpenBookmarkInWorkspace,
  onKeepOnly,
}: DuplicateReviewModalContentProps) {
  const [remainingGroups, setRemainingGroups] = useState(groups);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [busyBookmarkKey, setBusyBookmarkKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentGroup = remainingGroups[currentIndex] ?? null;
  const currentGroupNumber = remainingGroups.length ? currentIndex + 1 : 0;
  const currentItems = useMemo(() => (
    currentGroup?.bookmarks.map((bookmark) => {
      const scraper = scrapersById.get(bookmark.scraperId) ?? null;

      return {
        bookmark,
        scraper,
        coverUrl: getScraperBookmarkCoverUrl(bookmark, scraper),
        languageCodes: getScraperBookmarkLanguageCodes(bookmark, scraper),
      };
    }) ?? []
  ), [currentGroup, scrapersById]);

  const removeCurrentGroup = () => {
    const nextLength = Math.max(0, remainingGroups.length - 1);
    setRemainingGroups((currentGroups) => currentGroups.filter((_, index) => index !== currentIndex));
    setCurrentIndex((index) => Math.min(index, Math.max(0, nextLength - 1)));
  };

  const goToNextGroup = () => {
    setError(null);
    removeCurrentGroup();
  };

  const handleKeepOnly = async (bookmark: ScraperBookmarkRecord) => {
    if (!currentGroup || busyBookmarkKey) {
      return;
    }

    const bookmarkKey = getScraperBookmarkStableKey(bookmark);
    setBusyBookmarkKey(bookmarkKey);
    setError(null);

    try {
      await onKeepOnly(currentGroup, bookmark);
      removeCurrentGroup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer les doublons.");
    } finally {
      setBusyBookmarkKey(null);
    }
  };

  if (!remainingGroups.length) {
    return (
      <div className="scraper-bookmark-duplicates-modal">
        <div className="scraper-browser__message is-success">
          Aucun doublon detecte.
        </div>
      </div>
    );
  }

  return (
    <div className="scraper-bookmark-duplicates-modal">
      <div className="scraper-bookmark-duplicates-modal__head">
        <strong>Groupe {currentGroupNumber}/{remainingGroups.length}</strong>
        <span>{currentItems.length} bookmarks proches</span>
      </div>

      {error ? (
        <div className="scraper-browser__message is-error">{error}</div>
      ) : null}

      <div className="scraper-bookmark-duplicates-modal__cards">
        {currentItems.map(({ bookmark, scraper, coverUrl, languageCodes }) => {
          const bookmarkKey = getScraperBookmarkStableKey(bookmark);
          const isBusy = busyBookmarkKey === bookmarkKey;

          return (
            <article key={bookmarkKey} className="scraper-bookmark-duplicates-modal__card">
              <button
                type="button"
                className="scraper-bookmark-duplicates-modal__preview"
                onClick={() => onOpenBookmarkInWorkspace(bookmark)}
                title="Ouvrir la fiche dans un onglet workspace"
              >
                <div className="scraper-bookmark-duplicates-modal__image">
                  {coverUrl ? (
                    <img src={coverUrl} alt={bookmark.title} loading="lazy" decoding="async" />
                  ) : (
                    <span>Pas d&apos;image</span>
                  )}
                </div>
                <div className="scraper-bookmark-duplicates-modal__body">
                  <strong className={`scraper-bookmark-modal-title title-lines-${titleLineCount}`}>
                    {bookmark.title}
                  </strong>
                  <span>{scraper?.name || `Scrapper ${bookmark.scraperId}`}</span>
                  {languageCodes.length ? (
                    <span className="scraper-bookmark-duplicates-modal__languages">
                      Langue <LanguageFlags languageCodes={languageCodes} />
                    </span>
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                className="scraper-bookmark-duplicates-modal__keep"
                onClick={() => {
                  void handleKeepOnly(bookmark);
                }}
                disabled={Boolean(busyBookmarkKey)}
              >
                {isBusy ? "Suppression..." : "Ne garder que ce manga"}
              </button>
            </article>
          );
        })}
      </div>

      <div className="scraper-bookmark-duplicates-modal__footer">
        <button
          type="button"
          onClick={goToNextGroup}
          disabled={Boolean(busyBookmarkKey)}
        >
          Passer au groupe suivant
        </button>
      </div>
    </div>
  );
}

export default function buildScraperBookmarkDuplicateReviewModal({
  groups,
  scrapersById,
  titleLineCount,
  onOpenBookmarkInWorkspace,
  onKeepOnly,
}: DuplicateReviewModalOptions): ModalOptions {
  return {
    title: groups.length
      ? `Doublons bookmarks (${groups.length})`
      : "Doublons bookmarks",
    content: (
      <ScraperBookmarkDuplicateReviewModalContent
        groups={groups}
        scrapersById={scrapersById}
        titleLineCount={titleLineCount}
        onOpenBookmarkInWorkspace={onOpenBookmarkInWorkspace}
        onKeepOnly={onKeepOnly}
      />
    ),
    className: "scraper-bookmark-duplicates-modal-shell",
    bodyClassName: "scraper-bookmark-duplicates-modal-body",
    actions: [
      {
        label: "Fermer",
        variant: "secondary",
        autoFocus: true,
      },
    ],
  };
}
