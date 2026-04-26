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

const getScrollViewBand = (): { top: number; bottom: number } => {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return {
    top: viewportHeight * 0.25,
    bottom: viewportHeight * 0.75,
  };
};

const isInsideScrollViewBand = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const band = getScrollViewBand();

  return rect.top <= band.bottom && rect.bottom >= band.top;
};

const getScrollableParent = (element: HTMLElement): HTMLElement | Window => {
  let parent = element.parentElement;

  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    const canScroll = overflowY === 'auto' || overflowY === 'scroll';

    if (canScroll && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return window;
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
    if (!canReportView || typeof window === 'undefined') {
      return undefined;
    }

    let frameId: number | null = null;
    const article = articleRef.current;
    const scrollTarget = article ? getScrollableParent(article) : window;

    const reportIfCardIsPassed = () => {
      if (hasReportedViewRef.current) {
        return;
      }

      const currentArticle = articleRef.current;
      if (!currentArticle || !isInsideScrollViewBand(currentArticle)) {
        return;
      }

      hasReportedViewRef.current = true;
      onViewedRef.current?.();
      scrollTarget.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        reportIfCardIsPassed();
      });
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      scrollTarget.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
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
          <img src={coverUrl} alt={resolvedCoverAlt} onError={onCoverError} />
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
