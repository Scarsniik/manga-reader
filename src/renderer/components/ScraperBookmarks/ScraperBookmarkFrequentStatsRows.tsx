import React from "react";
import type { BookmarkAuthorStat } from "@/renderer/components/ScraperBookmarks/bookmarkAuthorStats";
import type { BookmarkTagStat } from "@/renderer/components/ScraperBookmarks/bookmarkTagStats";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";

type TagRowsProps = {
  stats: BookmarkTagStat[];
  onOpen: (stat: BookmarkTagStat) => void;
  onOpenInWorkspace: (stat: BookmarkTagStat) => void;
};

type AuthorRowsProps = {
  openingAuthor: string | null;
  stats: BookmarkAuthorStat[];
  onFilter: (stat: BookmarkAuthorStat) => void;
  onOpenCombined: (stat: BookmarkAuthorStat) => void;
  onOpenCombinedInWorkspace: (stat: BookmarkAuthorStat) => void;
};

const MIDDLE_BUTTON = 1;

const getOccurrenceLabel = (count: number): string => (
  `${count} occurrence${count > 1 ? "s" : ""}`
);

const formatTagVariantPreview = (stat: BookmarkTagStat): string => {
  const visibleVariants = stat.variants.slice(0, 6).map((variant) => (
    `${variant.tag} (${variant.count})`
  ));
  const hiddenCount = Math.max(0, stat.variants.length - visibleVariants.length);
  return hiddenCount > 0
    ? `${visibleVariants.join(", ")} +${hiddenCount}`
    : visibleVariants.join(", ");
};

const formatAuthorVariantPreview = (stat: BookmarkAuthorStat): string => {
  const visibleVariants = stat.variants.slice(0, 6).map((variant) => {
    const parserLabel = variant.extractedCount > 0
      ? `, parser ${variant.extractedCount}`
      : "";
    return `${variant.author} (${variant.count}${parserLabel})`;
  });
  const hiddenCount = Math.max(0, stat.variants.length - visibleVariants.length);
  return hiddenCount > 0
    ? `${visibleVariants.join(", ")} +${hiddenCount}`
    : visibleVariants.join(", ");
};

function BookmarkAuthorCover({ stat }: { stat: BookmarkAuthorStat }) {
  const coverUrls = React.useMemo(() => {
    const cover = String(stat.cover ?? "").trim();
    if (!cover) return [];
    return Array.from(new Set([
      buildRemoteThumbnailUrl(cover, stat.coverRefererUrl),
      cover,
    ].filter(Boolean)));
  }, [stat.cover, stat.coverRefererUrl]);
  const coverUrlsKey = coverUrls.join("\n");
  const [coverIndex, setCoverIndex] = React.useState(0);

  React.useEffect(() => {
    setCoverIndex(0);
  }, [coverUrlsKey]);

  const activeCoverUrl = coverUrls[coverIndex];
  return (
    <span
      className={`scraper-bookmark-tags-modal__author-cover ${activeCoverUrl ? "" : "is-empty"}`}
      aria-hidden={!activeCoverUrl}
    >
      {activeCoverUrl ? (
        <img
          src={activeCoverUrl}
          alt={stat.coverTitle ? `Couverture de ${stat.coverTitle}` : "Couverture d’un manga bookmarké"}
          onError={() => setCoverIndex((current) => current + 1)}
        />
      ) : (
        <span>{stat.author.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

const handleMiddleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
  if (event.button === MIDDLE_BUTTON) {
    event.preventDefault();
    event.stopPropagation();
  }
};

export function ScraperBookmarkFrequentTagRows({
  stats,
  onOpen,
  onOpenInWorkspace,
}: TagRowsProps) {
  return (
    <div className="scraper-bookmark-tags-modal__list">
      {stats.map((stat) => (
        <button
          key={`${stat.tag}-${stat.count}-${stat.variants.length}`}
          type="button"
          className="scraper-bookmark-tags-modal__row"
          onClick={() => onOpen(stat)}
          onMouseDown={handleMiddleMouseDown}
          onAuxClick={(event) => {
            if (event.button !== MIDDLE_BUTTON) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onOpenInWorkspace(stat);
          }}
          title="Filtrer les bookmarks sur ce tag. Clic molette : nouvel onglet workspace"
          data-prevent-middle-click-autoscroll="true"
        >
          <span className="scraper-bookmark-tags-modal__row-main">
            <strong>{stat.tag}</strong>
            <span>{getOccurrenceLabel(stat.count)}</span>
            {stat.scraperIds.length > 1 ? (
              <span>{`${stat.scraperIds.length} scrappers`}</span>
            ) : null}
            {stat.favoriteName ? <span>{`Favori ${stat.favoriteName}`}</span> : null}
          </span>
          {stat.variants.length > 1 ? (
            <span className="scraper-bookmark-tags-modal__variants">
              {formatTagVariantPreview(stat)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function ScraperBookmarkFrequentAuthorRows({
  openingAuthor,
  stats,
  onFilter,
  onOpenCombined,
  onOpenCombinedInWorkspace,
}: AuthorRowsProps) {
  return (
    <div className="scraper-bookmark-tags-modal__list">
      {stats.map((stat) => {
        const opening = openingAuthor === stat.author;
        return (
          <div
            key={`${stat.author}-${stat.count}-${stat.variants.length}`}
            className="scraper-bookmark-tags-modal__author-row"
          >
            <button
              type="button"
              className="scraper-bookmark-tags-modal__row scraper-bookmark-tags-modal__author-filter"
              onClick={() => onFilter(stat)}
              title="Filtrer les bookmarks sur cet auteur"
            >
              <BookmarkAuthorCover stat={stat} />
              <span className="scraper-bookmark-tags-modal__author-copy">
                <span className="scraper-bookmark-tags-modal__row-main">
                  <strong>{stat.author}</strong>
                  <span>{`${stat.count} manga${stat.count > 1 ? "s" : ""}`}</span>
                  {stat.scraperIds.length > 1 ? (
                    <span>{`${stat.scraperIds.length} scrappers`}</span>
                  ) : null}
                  {stat.favoriteName ? <span>{`Favori ${stat.favoriteName}`}</span> : null}
                </span>
                <span className="scraper-bookmark-tags-modal__variants">
                  {formatAuthorVariantPreview(stat)}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="scraper-bookmark-tags-modal__author-combined"
              onClick={() => onOpenCombined(stat)}
              onMouseDown={handleMiddleMouseDown}
              onAuxClick={(event) => {
                if (event.button !== MIDDLE_BUTTON) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onOpenCombinedInWorkspace(stat);
              }}
              disabled={opening}
              title="Ouvrir les pages auteur et leurs mangas. Clic molette : nouvel onglet workspace"
              data-prevent-middle-click-autoscroll="true"
            >
              {opening ? "Ouverture…" : "Vue combinée"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
