import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import './style.scss';

interface BaseCardOverlayItem {
    type?: "button" | "title";
}

export type CardOverlayButtonColor = "default" | "danger";

interface CardOverlayTitle extends BaseCardOverlayItem {
    type: "title";
    label: string;
}

interface BaseCardOverlayButton extends BaseCardOverlayItem {
    type?: "button";
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    icon?: React.ReactNode;
    compact?: boolean;
    itemsPerRow?: 1 | 2 | 3;
    color?: CardOverlayButtonColor;
}

export type CardOverlayButton =
    | (BaseCardOverlayButton & {
        label: string;
        ariaLabel?: string;
    })
    | (BaseCardOverlayButton & {
        label?: string;
        icon: React.ReactNode;
        ariaLabel: string;
    });

export type CardOverlayItem = CardOverlayTitle | CardOverlayButton;

interface Props {
    title?: string;
    countLabel: string;
    coverPath: string | null;
    dataMangaId?: string;
    /** current page/tome/chapter */
    current?: number | null;
    /** total total/tomes/chapter */
    total?: number | null;
    /** Content of the Card overlay */
    overlayContent?: CardOverlayItem[];
    /** Action on card click */
    onClick?: (e: React.MouseEvent) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    selected?: boolean;
    titleLineCount?: number;
    showPageNumbers?: boolean;
}

const normalizeOverlayItemLabel = (label?: string): string | null => {
    if (typeof label !== "string") {
        return null;
    }

    const trimmedLabel = label.trim();

    return trimmedLabel.length > 0 ? trimmedLabel : null;
};

const isCardOverlayTitle = (item: CardOverlayItem): item is CardOverlayTitle => item.type === "title";

const resolveOverlayItemItemsPerRow = (item: CardOverlayItem): 1 | 2 | 3 => {
    if (isCardOverlayTitle(item)) return 1;
    if (item.itemsPerRow === 2 || item.itemsPerRow === 3) {
        return item.itemsPerRow;
    }

    if (item.compact) {
        return 2;
    }

    return 1;
};

const resolveOverlayButtonColor = (item: CardOverlayButton): CardOverlayButtonColor => item.color ?? "default";

function Card(props: Props): JSX.Element {
    const {
        current,
        total,
        coverPath: defaultCoverPath,
        dataMangaId,
        title,
        onClick,
        onKeyDown,
        countLabel,
        overlayContent,
        selected = false,
        titleLineCount = 2,
        showPageNumbers = true,
    } = props;

    const [coverPath, setCoverPath] = useState<string | null>(defaultCoverPath ?? null);
    const [isOverlayVisible, setIsOverlayVisible] = useState<boolean>(false);

    // Keep local coverPath in sync when parent provides a new cover (async fetch)
    useEffect(() => {
        setCoverPath(defaultCoverPath ?? null);
    }, [defaultCoverPath]);

    const handleToggleOverlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOverlayVisible((v) => !v);
    }, []);

    const handleOverlayItemClick = useCallback((item: CardOverlayButton) => (e: React.MouseEvent) => {
        item.onClick(e);
        if (!item.disabled) {
            setIsOverlayVisible(false);
        }
    }, []);

    const handleMouseLeave = useCallback(() => setIsOverlayVisible(false), []);

    const needProgressBar = useMemo(() => {
        return (
            typeof current !== 'undefined'
            && current !== null
            && current > 1
            && (total !== undefined && total !== null)
        );
    }, [current, total]);

    const progressPercent = useMemo(() => {
        if (!needProgressBar) return 0;
        const c = current ?? 0;
        const t = total ?? 1;
        return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
    }, [needProgressBar, current, total]);

    return (
        <div
            className={`manga-card ${selected ? 'selected' : ''}`}
            data-manga-id={dataMangaId}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-pressed={selected}
        >
            <div className="manga-card-cover">
                {coverPath ? (
                    <img
                        src={coverPath}
                        alt={title ? `Cover for ${title}` : 'Cover'}
                        onError={() => setCoverPath(null)}
                    />
                ) : (
                    <div className="no-cover">No cover</div>
                )}

                {isOverlayVisible ? (
                    <div className="manga-card-overlay" onClick={(e) => e.stopPropagation()}>
                        {overlayContent?.map((item, idx) => {
                            const itemsPerRow = resolveOverlayItemItemsPerRow(item);
                            if (isCardOverlayTitle(item)) {
                                return (
                                    <div
                                        key={idx}
                                        className={[
                                            "manga-card-overlay-title",
                                            `items-per-row-${itemsPerRow}`,
                                        ].join(" ").trim()}
                                    >
                                        {item.label}
                                    </div>
                                );
                            }
                            const label = normalizeOverlayItemLabel(item.label);
                            const hasIcon = Boolean(item.icon);
                            const color = resolveOverlayButtonColor(item);

                            if (!label && !hasIcon) {
                                return null;
                            }

                            const isIconOnly = hasIcon && !label;
                            const accessibleLabel = item.ariaLabel ?? label ?? undefined;

                            return (
                                <button
                                    key={idx}
                                    onClick={handleOverlayItemClick(item)}
                                    type="button"
                                    className={[
                                        "manga-card-overlay-button",
                                        `items-per-row-${itemsPerRow}`,
                                        `color-${color}`,
                                        isIconOnly ? "icon-only" : "",
                                    ].join(" ").trim()}
                                    disabled={item.disabled}
                                    aria-label={accessibleLabel}
                                    title={accessibleLabel}
                                >
                                    {item.icon ? (
                                        <span className="manga-card-overlay-button-icon" aria-hidden="true">
                                            {item.icon}
                                        </span>
                                    ) : null}
                                    {label ? (
                                        <span className="manga-card-overlay-button-label">{label}</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : overlayContent?.length ? (
                    <button
                        className="manga-card-overlay-open"
                        onClick={handleToggleOverlay}
                        type="button"
                        aria-haspopup="true"
                        aria-expanded={isOverlayVisible}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <span>...</span>
                    </button>
                ) : null}
            </div>

            {/* progress bar: show when we have a current on card state and a known total count */}
            {needProgressBar ? (
                <div className="manga-card-progress">
                    <div className="manga-card-progress-track">
                        <div
                            className="manga-card-progress-fill"
                            style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="manga-card-progress-text">
                        {`${current}/${total}`}
                    </div>
                </div>
            ) : null}
            <div className={`manga-card-title title-lines-${titleLineCount}`}>
                {title}
            </div>
        {showPageNumbers ? (
            <div className="manga-card-pages">{total === undefined ? '...' : total === null ? 'N/A' : `${total} ${countLabel}`}</div>
        ) : null}
        </div>
    );
}

const MemoizedCard = memo(Card);
MemoizedCard.displayName = 'Card';

export default MemoizedCard;
