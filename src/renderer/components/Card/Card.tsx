import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useParams from '@/renderer/hooks/useParams';

import './style.scss';

export interface CardOverlayItem {
    label: string;
    onClick: (e: React.MouseEvent) => void;
}

interface Props {
    title?: string;
    countLabel: string;
    coverPath: string | null;
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
}

const Card: React.FC<Props> = ({
    current,
    total,
    coverPath: defaultCoverPath,
    title,
    onClick,
    onKeyDown,
    countLabel,
    overlayContent,
    selected = false,
}) => {
    const [coverPath, setCoverPath] = useState<string | null>(defaultCoverPath);

    const [isOverlayVisible, setIsOverlayVisible] = useState(false);
    const { params } = useParams();

    // Keep local coverPath in sync when parent provides a new cover (async fetch)
    useEffect(() => {
        setCoverPath(defaultCoverPath ?? null);
    }, [defaultCoverPath]);

    const onToggleOverlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOverlayVisible(!isOverlayVisible);
    }, [isOverlayVisible]);

    const needProgressBar = useMemo(() => {
        return (
            typeof current !== 'undefined'
            && current !== null
            && current > 1
            && (total !== undefined && total !== null)
        );
    }, [current, total]);

    return (
        <div
            className={`manga-card ${selected ? 'selected' : ''}`}
            onMouseLeave={() => setIsOverlayVisible(false)}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={onKeyDown}
        >
            <div className="manga-card-cover">
                {coverPath ? (
                    <img
                        src={coverPath as string}
                        alt={`Cover for ${title}`}
                        onError={() => setCoverPath(null)}
                    />
                ) : (
                    <div className="no-cover">No cover</div>
                )}

                {isOverlayVisible ? (
                    <div className="manga-card-overlay" onClick={(e) => e.stopPropagation()}>
                        { overlayContent?.map((item, idx) => (
                            <button key={idx} onClick={item.onClick}>
                                {item.label}
                            </button>
                        )) }
                    </div>
                ) : overlayContent && (
                    <button
                        className="manga-card-overlay-open"
                        onClick={onToggleOverlay}
                    >
                        <span>...</span>
                    </button>
                )}
            </div>

            {/* progress bar: show when we have a current on card state and a known total count */}
            {needProgressBar ? (
                <div className="manga-card-progress">
                    <div className="manga-card-progress-track">
                        <div
                            className="manga-card-progress-fill"
                            style={{ width: `${Math.max(0, Math.min(100, Math.round(((current || 0) / (total || 1)) * 100))) }%` }} />
                    </div>
                    <div className="manga-card-progress-text">
                        {`${current}/${total}`}
                    </div>
                </div>
            ) : null}
            <div className={`manga-card-title title-lines-${params?.titleLineCount ?? 2}`}>
                {title}
            </div>
        {(params?.showPageNumbers ?? true) ? (
            <div className="manga-card-pages">{total === undefined ? '...' : total === null ? 'N/A' : `${total} ${countLabel}`}</div>
        ) : null}
        </div>
    );
};

export default Card;
