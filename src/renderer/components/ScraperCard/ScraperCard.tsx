import React from 'react';
import './style.scss';

export type ScraperCardAction = (
  | {
    id: string;
    type: 'primary' | 'secondary' | 'icon-primary' | 'icon-secondary';
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    onMiddleClick?: () => void;
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
  onMiddleClick?: () => void;
  onCoverError?: () => void;
  onViewed?: () => void;
  ariaLabel?: string;
};

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() : '';
};

const isVisibleAction = (action: ScraperCardAction | null | undefined): action is ScraperCardAction => Boolean(action);

const isInteractiveMiddleClickTarget = (
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveTarget = target.closest('button, a, input, textarea, select, [role="button"]');
  return Boolean(interactiveTarget && interactiveTarget !== currentTarget);
};

const VIEWED_INTERSECTION_RATIO = 0.8;
const VIEWED_DWELL_MS = 1000;

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
  onMiddleClick,
  onCoverError,
  onViewed,
  ariaLabel,
}: Props) {
  const articleRef = React.useRef<HTMLElement | null>(null);
  const onViewedRef = React.useRef(onViewed);
  const hasReportedViewRef = React.useRef(false);
  const canReportView = Boolean(onViewed);
  const normalizedSummary = normalizeOptionalText(summary);
  const normalizedEmptySummary = normalizeOptionalText(emptySummary);
  const resolvedCoverAlt = normalizeOptionalText(coverAlt) || title;
  const visibleActions = actions?.filter(isVisibleAction) ?? [];

  React.useEffect(() => {
    onViewedRef.current = onViewed;
  }, [onViewed]);

  React.useEffect(() => {
    if (
      !canReportView
      || hasReportedViewRef.current
      || typeof window === 'undefined'
      || typeof IntersectionObserver === 'undefined'
    ) {
      return undefined;
    }

    const article = articleRef.current;
    if (!article) {
      return undefined;
    }

    let viewedTimeoutId: number | null = null;
    let currentIntersectionRatio = 0;
    let observer: IntersectionObserver | null = null;

    const clearViewedTimeout = () => {
      if (viewedTimeoutId === null) {
        return;
      }

      window.clearTimeout(viewedTimeoutId);
      viewedTimeoutId = null;
    };

    const reportIfCardStayedVisible = () => {
      viewedTimeoutId = null;
      if (hasReportedViewRef.current) {
        return;
      }

      if (currentIntersectionRatio < VIEWED_INTERSECTION_RATIO) {
        return;
      }

      hasReportedViewRef.current = true;
      onViewedRef.current?.();
      observer?.disconnect();
    };

    const scheduleViewedTimeout = () => {
      if (viewedTimeoutId !== null) {
        return;
      }

      viewedTimeoutId = window.setTimeout(reportIfCardStayedVisible, VIEWED_DWELL_MS);
    };

    observer = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.target === article);
      currentIntersectionRatio = entry?.intersectionRatio ?? 0;

      if (currentIntersectionRatio >= VIEWED_INTERSECTION_RATIO) {
        scheduleViewedTimeout();
        return;
      }

      clearViewedTimeout();
    }, {
      threshold: [0, VIEWED_INTERSECTION_RATIO],
    });

    observer.observe(article);

    return () => {
      clearViewedTimeout();
      observer?.disconnect();
    };
  }, [canReportView]);

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

    const handleActionMiddleClick = () => {
      if (action.disabled || !action.onMiddleClick) {
        return;
      }

      action.onMiddleClick();
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
        onMouseDown={action.onMiddleClick ? (event) => {
          if (event.button !== 1) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
        } : undefined}
        onAuxClick={action.onMiddleClick ? (event) => {
          if (event.button !== 1) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          handleActionMiddleClick();
        } : undefined}
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
        data-prevent-middle-click-autoscroll={action.onMiddleClick ? 'true' : undefined}
      >
        {action.icon ? <span className="scraper-card__action-icon">{action.icon}</span> : null}
        {!isIconOnly ? <span className="scraper-card__action-label">{action.label}</span> : null}
      </button>
    );
  };

  return (
    <article
      ref={articleRef}
      className={[
        'scraper-card',
        className,
        isActionable ? 'is-actionable' : '',
      ].join(' ').trim()}
      data-prevent-middle-click-autoscroll={onMiddleClick ? 'true' : undefined}
      onMouseDown={onMiddleClick ? (event) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      } : undefined}
      onAuxClick={onMiddleClick ? (event) => {
        if (event.button !== 1 || isInteractiveMiddleClickTarget(event.target, event.currentTarget)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onMiddleClick();
      } : undefined}
      onClick={isActionable ? onClick : undefined}
      onKeyDown={isActionable ? onKeyDown : undefined}
      role={isActionable ? 'button' : undefined}
      tabIndex={isActionable ? 0 : undefined}
      aria-label={isActionable ? ariaLabel : undefined}
    >
      <div className="scraper-card__media">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={resolvedCoverAlt}
            loading="lazy"
            decoding="async"
            onError={onCoverError}
          />
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
