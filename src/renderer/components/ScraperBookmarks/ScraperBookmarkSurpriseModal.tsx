import React, { useMemo, useState } from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import { useModal } from "@/renderer/hooks/useModal";
import { getScraperBookmarkLanguageCodes } from "@/renderer/utils/scraperBookmarkMetadata";
import {
  getScraperBookmarkCoverUrl,
  getScraperBookmarkStableKey,
} from "@/renderer/components/ScraperBookmarks/bookmarkPresentation";

type SurpriseModalContentProps = {
  bookmarks: ScraperBookmarkRecord[];
  scrapersById: Map<string, ScraperRecord>;
  titleLineCount: number;
  onOpenBookmark: (bookmark: ScraperBookmarkRecord) => void;
  onOpenBookmarkInWorkspace: (bookmark: ScraperBookmarkRecord) => void;
};

type SurpriseModalOptions = SurpriseModalContentProps;

const MIDDLE_BUTTON = 1;
const SURPRISE_PICK_COUNT = 3;

const pickRandomBookmarks = (
  bookmarks: ScraperBookmarkRecord[],
  count = SURPRISE_PICK_COUNT,
): ScraperBookmarkRecord[] => {
  const candidates = [...bookmarks];

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  return candidates.slice(0, count);
};

function ScraperBookmarkSurpriseModalContent({
  bookmarks,
  scrapersById,
  titleLineCount,
  onOpenBookmark,
  onOpenBookmarkInWorkspace,
}: SurpriseModalContentProps) {
  const { closeModal } = useModal();
  const [pickedBookmarks, setPickedBookmarks] = useState(() => pickRandomBookmarks(bookmarks));
  const pickedItems = useMemo(() => (
    pickedBookmarks.map((bookmark) => {
      const scraper = scrapersById.get(bookmark.scraperId) ?? null;

      return {
        bookmark,
        scraper,
        coverUrl: getScraperBookmarkCoverUrl(bookmark, scraper),
        languageCodes: getScraperBookmarkLanguageCodes(bookmark, scraper),
      };
    })
  ), [pickedBookmarks, scrapersById]);

  const repick = () => {
    setPickedBookmarks(pickRandomBookmarks(bookmarks));
  };

  const openBookmark = (
    bookmark: ScraperBookmarkRecord,
    openInWorkspace = false,
  ) => {
    if (openInWorkspace) {
      onOpenBookmarkInWorkspace(bookmark);
      return;
    }

    closeModal();
    onOpenBookmark(bookmark);
  };

  if (!bookmarks.length) {
    return (
      <div className="scraper-bookmark-surprise-modal">
        <div className="scraper-browser__message is-warning">
          Aucun bookmark de la selection actuelle ne peut etre ouvert en fiche.
        </div>
      </div>
    );
  }

  return (
    <div className="scraper-bookmark-surprise-modal">
      <div className="scraper-bookmark-surprise-modal__head">
        <strong>{pickedItems.length} manga{pickedItems.length > 1 ? "s" : ""} tires au hasard</strong>
        <span>{bookmarks.length} possible{bookmarks.length > 1 ? "s" : ""} dans la selection actuelle</span>
      </div>

      <div className="scraper-bookmark-surprise-modal__cards">
        {pickedItems.map(({ bookmark, scraper, coverUrl, languageCodes }) => {
          const bookmarkKey = getScraperBookmarkStableKey(bookmark);

          return (
            <button
              key={bookmarkKey}
              type="button"
              className="scraper-bookmark-surprise-modal__card"
              onClick={() => {
                openBookmark(bookmark);
              }}
              onMouseDown={(event) => {
                if (event.button === MIDDLE_BUTTON) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onAuxClick={(event) => {
                if (event.button !== MIDDLE_BUTTON) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                openBookmark(bookmark, true);
              }}
              title="Ouvrir la fiche. Clic molette : nouvel onglet workspace"
              data-prevent-middle-click-autoscroll="true"
            >
              <div className="scraper-bookmark-surprise-modal__image">
                {coverUrl ? (
                  <img src={coverUrl} alt={bookmark.title} loading="lazy" decoding="async" />
                ) : (
                  <span>Pas d&apos;image</span>
                )}
              </div>
              <div className="scraper-bookmark-surprise-modal__body">
                <strong className={`scraper-bookmark-modal-title title-lines-${titleLineCount}`}>
                  {bookmark.title}
                </strong>
                <span>{scraper?.name || `Scrapper ${bookmark.scraperId}`}</span>
                {languageCodes.length ? (
                  <span className="scraper-bookmark-surprise-modal__languages">
                    Langue <LanguageFlags languageCodes={languageCodes} />
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="scraper-bookmark-surprise-modal__footer">
        <button
          type="button"
          onClick={repick}
          disabled={bookmarks.length === 0}
        >
          Repick
        </button>
      </div>
    </div>
  );
}

export default function buildScraperBookmarkSurpriseModal({
  bookmarks,
  scrapersById,
  titleLineCount,
  onOpenBookmark,
  onOpenBookmarkInWorkspace,
}: SurpriseModalOptions): ModalOptions {
  return {
    title: "Surprends moi",
    content: (
      <ScraperBookmarkSurpriseModalContent
        bookmarks={bookmarks}
        scrapersById={scrapersById}
        titleLineCount={titleLineCount}
        onOpenBookmark={onOpenBookmark}
        onOpenBookmarkInWorkspace={onOpenBookmarkInWorkspace}
      />
    ),
    className: "scraper-bookmark-surprise-modal-shell",
    bodyClassName: "scraper-bookmark-surprise-modal-body",
    actions: [
      {
        label: "Fermer",
        variant: "secondary",
        autoFocus: true,
      },
    ],
  };
}
