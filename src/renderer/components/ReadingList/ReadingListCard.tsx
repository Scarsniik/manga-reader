import React from "react";
import type {
  ReadingListItem,
  ReadingListItemStatus,
} from "@/renderer/types/readingList";
import { normalizeReaderAssetSrc } from "@/renderer/components/Reader/utils";

type Props = {
  index: number;
  item: ReadingListItem;
  onOpenDetails?: (item: ReadingListItem) => void;
  onRemove?: (itemId: string) => void;
  showReadingStatus?: boolean;
  status?: ReadingListItemStatus;
};

export default function ReadingListCard({
  index,
  item,
  onOpenDetails,
  onRemove,
  showReadingStatus = false,
  status,
}: Props) {
  const coverSrc = normalizeReaderAssetSrc(item.metadata.cover ?? null);

  return (
    <article
      className={[
        "reading-list-card",
        onOpenDetails ? "is-clickable" : "",
        status?.completed ? "is-completed" : "",
      ].filter(Boolean).join(" ")}
    >
      {onOpenDetails ? (
        <button
          type="button"
          className="reading-list-card__open"
          aria-label={`Ouvrir la fiche de ${item.metadata.title} dans un nouvel onglet`}
          title={item.metadata.title}
          onClick={() => onOpenDetails(item)}
        />
      ) : null}

      <div className="reading-list-card__cover">
        {coverSrc ? (
          <img src={coverSrc} alt={`Couverture de ${item.metadata.title}`} />
        ) : (
          <div className="reading-list-card__cover-placeholder">Aucune couverture</div>
        )}
        <span className="reading-list-card__position">{index + 1}</span>
      </div>

      <div className="reading-list-card__body">
        <h3>{item.metadata.title}</h3>
        {item.metadata.authors?.length ? (
          <p className="reading-list-card__authors">{item.metadata.authors.join(", ")}</p>
        ) : null}
        <div className="reading-list-card__chips">
          {item.metadata.languageCodes?.map((languageCode) => (
            <span key={`language:${languageCode}`} className="reading-list-card__chip is-language">
              {languageCode.toUpperCase()}
            </span>
          ))}
        </div>
        {status?.bookmarkRemoved ? (
          <span className="reading-list-card__status">Bookmark retiré</span>
        ) : status?.bookmarkRemovalError ? (
          <span className="reading-list-card__status is-error">{status.bookmarkRemovalError}</span>
        ) : status?.completed ? (
          <span className="reading-list-card__status">Lu</span>
        ) : showReadingStatus ? (
          <span className="reading-list-card__status is-unread">Non lu</span>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            className="reading-list-card__remove"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item.id);
            }}
          >
            Retirer de la liste
          </button>
        ) : null}
      </div>
    </article>
  );
}
