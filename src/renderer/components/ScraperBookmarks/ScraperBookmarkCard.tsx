import React from 'react';
import ScraperCard from '@/renderer/components/ScraperCard/ScraperCard';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import type { ScraperBookmarkRecord, ScraperRecord } from '@/shared/scraper';

type Props = {
  bookmark: ScraperBookmarkRecord;
  scraper?: ScraperRecord | null;
  onOpenBookmark: (bookmark: ScraperBookmarkRecord) => void;
};

const renderChipGroup = (values: string[], variant: 'author' | 'tag') => {
  if (!values.length) {
    return null;
  }

  return (
    <div className="scraper-card__chips">
      {values.map((value) => (
        <span key={value} className={`scraper-card__chip is-${variant}`}>{value}</span>
      ))}
    </div>
  );
};

export default function ScraperBookmarkCard({
  bookmark,
  scraper = null,
  onOpenBookmark,
}: Props) {
  const canOpenBookmark = Boolean(scraper);
  const actions = (
    <>
      <ScraperBookmarkButton
        scraperId={bookmark.scraperId}
        sourceUrl={bookmark.sourceUrl}
        title={bookmark.title}
        cover={bookmark.cover}
        summary={bookmark.summary}
        description={bookmark.description}
        authors={bookmark.authors}
        tags={bookmark.tags}
        mangaStatus={bookmark.mangaStatus}
        excludedFields={scraper?.globalConfig.bookmark.excludedFields}
        size="sm"
      />

      {canOpenBookmark ? (
        <button
          type="button"
          className="scraper-card__action-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenBookmark(bookmark);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        >
          Ouvrir la fiche
        </button>
      ) : (
        <span className="scraper-card__action-hint is-muted">
          Scrapper indisponible
        </span>
      )}
    </>
  );

  return (
    <ScraperCard
      title={bookmark.title}
      coverUrl={bookmark.cover}
      coverAlt={bookmark.title}
      eyebrow={(
        <span className="scraper-bookmarks-view__scraper-label">
          {scraper?.name || `Scrapper indisponible (${bookmark.scraperId})`}
        </span>
      )}
      summary={bookmark.description || bookmark.summary}
      metadata={(
        <>
          {renderChipGroup(bookmark.authors, 'author')}
          {renderChipGroup(bookmark.tags, 'tag')}
        </>
      )}
      actions={actions}
      className="scraper-bookmarks-view__card"
      isActionable={canOpenBookmark}
      onClick={canOpenBookmark ? () => onOpenBookmark(bookmark) : undefined}
      onKeyDown={canOpenBookmark ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        onOpenBookmark(bookmark);
      } : undefined}
      ariaLabel={canOpenBookmark ? `Ouvrir la fiche ${bookmark.title}` : undefined}
    />
  );
}
