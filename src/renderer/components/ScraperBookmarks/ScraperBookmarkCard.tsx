import React from 'react';
import ScraperCard, { type ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import { DetailsCardIcon } from '@/renderer/components/icons';
import type { ScraperBookmarkRecord, ScraperRecord } from '@/shared/scraper';
import type { ScraperCardViewState } from '@/renderer/utils/scraperViewHistory';

type Props = {
  bookmark: ScraperBookmarkRecord;
  scraper?: ScraperRecord | null;
  viewState: ScraperCardViewState;
  readAction?: ScraperCardAction | null;
  downloadAction?: ScraperCardAction | null;
  onOpenBookmark: (bookmark: ScraperBookmarkRecord) => void;
  onViewed?: (bookmark: ScraperBookmarkRecord) => void;
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
  viewState,
  readAction = null,
  downloadAction = null,
  onOpenBookmark,
  onViewed,
}: Props) {
  const canOpenBookmark = Boolean(scraper);
  const actions: ScraperCardAction[] = [
    ...(readAction ? [readAction] : []),
    {
      id: 'bookmark-toggle',
      type: 'custom',
      label: 'Basculer le bookmark',
      render: () => (
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
      ),
    },
    ...(downloadAction ? [downloadAction] : []),
    canOpenBookmark
      ? {
        id: 'open-details',
        type: 'icon-primary',
        label: 'Ouvrir la fiche',
        icon: <DetailsCardIcon aria-hidden="true" focusable="false" />,
        onClick: () => onOpenBookmark(bookmark),
      }
      : {
        id: 'scraper-unavailable',
        type: 'hint',
        label: 'Scrapper indisponible',
      },
  ];

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
      className={[
        'scraper-bookmarks-view__card',
        viewState === 'read' ? 'is-history-read' : viewState === 'new' ? 'is-history-new' : '',
      ].join(' ').trim()}
      isActionable={canOpenBookmark}
      onClick={canOpenBookmark ? () => onOpenBookmark(bookmark) : undefined}
      onKeyDown={canOpenBookmark ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        onOpenBookmark(bookmark);
      } : undefined}
      onViewed={onViewed ? () => onViewed(bookmark) : undefined}
      ariaLabel={canOpenBookmark ? `Ouvrir la fiche ${bookmark.title}` : undefined}
    />
  );
}
