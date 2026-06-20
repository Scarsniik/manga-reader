import React, { useMemo, useState } from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import { useModal } from "@/renderer/hooks/useModal";
import {
  buildReadingListItemFromBookmark,
  shuffleReadingListItems,
} from "@/renderer/components/ReadingList/readingListItems";
import type { ReadingListItem } from "@/renderer/types/readingList";
import type { ScraperBookmarkRecord } from "@/shared/scraper";

type Props = {
  bookmarks: ScraperBookmarkRecord[];
  onCreate: (items: ReadingListItem[]) => Promise<void>;
};

const getDefaultMangaCount = (bookmarkCount: number): number => Math.min(10, bookmarkCount);

function ScraperBookmarkReadingListModalContent({ bookmarks, onCreate }: Props) {
  const { closeModal } = useModal();
  const [mangaCount, setMangaCount] = useState(() => getDefaultMangaCount(bookmarks.length));
  const [randomOrder, setRandomOrder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedMangaCount = useMemo(
    () => Math.max(1, Math.min(bookmarks.length, Math.floor(mangaCount || 1))),
    [bookmarks.length, mangaCount],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating || bookmarks.length === 0) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const availableItems = bookmarks.map(buildReadingListItemFromBookmark);
      const orderedItems = randomOrder ? shuffleReadingListItems(availableItems) : availableItems;
      await onCreate(orderedItems.slice(0, normalizedMangaCount));
      closeModal();
    } catch (creationError) {
      setError(creationError instanceof Error
        ? creationError.message
        : "Impossible de créer la liste de lecture.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <form className="scraper-bookmark-reading-list-modal" onSubmit={handleSubmit}>
      <p>
        La sélection utilise les {bookmarks.length} bookmark(s) actuellement affichés et respecte leur ordre.
      </p>

      <label className="scraper-bookmark-reading-list-modal__field">
        <span>Nombre de mangas</span>
        <input
          type="number"
          min={1}
          max={bookmarks.length}
          value={mangaCount}
          onChange={(event) => setMangaCount(Number.parseInt(event.target.value, 10) || 1)}
        />
        <small>{`Maximum : ${bookmarks.length}`}</small>
      </label>

      <label className="scraper-bookmark-reading-list-modal__checkbox">
        <input
          type="checkbox"
          checked={randomOrder}
          onChange={(event) => setRandomOrder(event.target.checked)}
        />
        <span>
          <strong>Lecture aléatoire</strong>
          <small>Mélange les bookmarks affichés avant de sélectionner les mangas.</small>
        </span>
      </label>

      {error ? <div className="scraper-browser__message is-error">{error}</div> : null}

      <div className="scraper-bookmark-reading-list-modal__actions">
        <button type="button" onClick={() => closeModal()} disabled={creating}>
          Annuler
        </button>
        <button type="submit" className="primary" disabled={creating || bookmarks.length === 0}>
          {creating ? "Création..." : "Créer"}
        </button>
      </div>
    </form>
  );
}

export default function buildScraperBookmarkReadingListModal(props: Props): ModalOptions {
  return {
    title: "Créer une liste de lecture",
    content: <ScraperBookmarkReadingListModalContent {...props} />,
    className: "scraper-bookmark-reading-list-modal-shell",
    bodyClassName: "scraper-bookmark-reading-list-modal-body",
  };
}
