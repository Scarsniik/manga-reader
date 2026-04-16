import React from 'react';
import './style.scss';

export type ScraperCardAction = (
  | {
    id: string;
    type: 'primary' | 'secondary' | 'icon-primary' | 'icon-secondary';
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    ariaLabel?: string;
    className?: string;
    disabled?: boolean;
  }
  | {
    id: string;
    type: 'hint';
    label: string;
    icon?: React.ReactNode;
  }
  | {
    id: string;
    type: 'custom';
    label: string;
    render: () => React.ReactNode;
  }
);

type Props = {
  title: string;
  coverUrl?: string | null;
  coverAlt?: string;
  eyebrow?: React.ReactNode;
  summary?: string | null;
  emptySummary?: string | null;
  metadata?: React.ReactNode;
  actions?: ScraperCardAction[];
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

const isVisibleAction = (action: ScraperCardAction | null | undefined): action is ScraperCardAction => Boolean(action);

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
  const visibleActions = actions?.filter(isVisibleAction) ?? [];

  const renderAction = (action: ScraperCardAction) => {
    if (action.type === 'custom') {
      return <React.Fragment key={action.id}>{action.render()}</React.Fragment>;
    }

    if (action.type === 'hint') {
      return (
        <span key={action.id} className="scraper-card__action-hint is-muted">
          {action.icon ? <span className="scraper-card__action-icon">{action.icon}</span> : null}
          <span className="scraper-card__action-label">{action.label}</span>
        </span>
      );
    }

    const isIconOnly = action.type === 'icon-primary' || action.type === 'icon-secondary';
    const toneClassName = action.type.endsWith('primary') ? 'is-primary' : 'is-secondary';

    const handleActionClick = () => {
      if (action.disabled) {
        return;
      }

      action.onClick();
    };

    return (
      <button
        key={action.id}
        type="button"
        className={[
          'scraper-card__action-button',
          toneClassName,
          isIconOnly ? 'is-icon-only' : '',
          action.className || '',
        ].join(' ').trim()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleActionClick();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            handleActionClick();
            return;
          }

          event.stopPropagation();
        }}
        aria-label={action.ariaLabel || action.label}
        title={action.label}
        disabled={action.disabled}
      >
        {action.icon ? <span className="scraper-card__action-icon">{action.icon}</span> : null}
        {!isIconOnly ? <span className="scraper-card__action-label">{action.label}</span> : null}
      </button>
    );
  };

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

      {visibleActions.length ? (
        <div className="scraper-card__actions">
          {visibleActions.map(renderAction)}
        </div>
      ) : null}
    </article>
  );
}
