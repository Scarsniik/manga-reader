import React from 'react';
import './style.scss';

type Props = {
  title: string;
  coverUrl?: string | null;
  coverAlt?: string;
  eyebrow?: React.ReactNode;
  summary?: string | null;
  emptySummary?: string | null;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  isActionable?: boolean;
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  ariaLabel?: string;
};

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() : '';
};

export default function ScraperCard({
  title,
  coverUrl,
  coverAlt,
  eyebrow,
  summary,
  emptySummary,
  metadata,
  actions,
  className = '',
  isActionable = false,
  onClick,
  onKeyDown,
  ariaLabel,
}: Props) {
  const normalizedSummary = normalizeOptionalText(summary);
  const normalizedEmptySummary = normalizeOptionalText(emptySummary);
  const resolvedCoverAlt = normalizeOptionalText(coverAlt) || title;

  return (
    <article
      className={[
        'scraper-card',
        className,
        isActionable ? 'is-actionable' : '',
      ].join(' ').trim()}
      onClick={isActionable ? onClick : undefined}
      onKeyDown={isActionable ? onKeyDown : undefined}
      role={isActionable ? 'button' : undefined}
      tabIndex={isActionable ? 0 : undefined}
      aria-label={isActionable ? ariaLabel : undefined}
    >
      <div className="scraper-card__media">
        {coverUrl ? (
          <img src={coverUrl} alt={resolvedCoverAlt} />
        ) : (
          <div className="scraper-card__placeholder">Pas d&apos;image</div>
        )}
      </div>

      <div className="scraper-card__body">
        {eyebrow}
        <h4>{title}</h4>
        {normalizedSummary ? (
          <p className="scraper-card__summary">{normalizedSummary}</p>
        ) : normalizedEmptySummary && (
          <p className="scraper-card__summary is-muted">{normalizedEmptySummary}</p>
        )}
        {metadata}
      </div>

      {actions ? (
        <div className="scraper-card__actions">
          {actions}
        </div>
      ) : null}
    </article>
  );
}
