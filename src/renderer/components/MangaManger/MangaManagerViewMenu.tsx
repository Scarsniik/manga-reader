import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronDownIcon,
    DetailsCardIcon,
    EditPencilIcon,
    MagnifyingGlassIcon,
    OpenBookIcon,
    StarIcon,
} from "@/renderer/components/icons";
import BookmarkOutlineIcon from "@/renderer/components/MangaManger/icons/bookmark-outline.svg?react";
import HistoryClockIcon from "@/renderer/components/MangaManger/icons/history-clock.svg?react";
import TagsIcon from "@/renderer/components/MangaManger/icons/tags.svg?react";
import ScraperFavicon from "@/renderer/components/ScraperFavicon/ScraperFavicon";

export type MangaManagerViewOptionGroup = "navigation" | "source";
export type MangaManagerViewIcon = "authors" | "bookmarks" | "history" | "latest" | "library" | "search" | "source" | "tags";

export type MangaManagerViewOption = {
    baseUrl?: string;
    group: MangaManagerViewOptionGroup;
    icon: MangaManagerViewIcon;
    id: string;
    label: string;
};

type Props = {
    activeViewId: string;
    options: MangaManagerViewOption[];
    onSelect: (viewId: string) => void;
    onOpenInWorkspace: (viewId: string) => void;
};

const MIDDLE_BUTTON = 1;

const renderViewIcon = (icon: MangaManagerViewIcon): React.ReactNode => {
    switch (icon) {
        case "authors": return <EditPencilIcon />;
        case "bookmarks": return <BookmarkOutlineIcon />;
        case "history": return <HistoryClockIcon />;
        case "latest": return <StarIcon />;
        case "search": return <MagnifyingGlassIcon />;
        case "tags": return <TagsIcon />;
        case "source": return <DetailsCardIcon />;
        case "library":
        default:
            return <OpenBookIcon />;
    }
};

function MangaManagerViewIconDisplay({ option }: { option: MangaManagerViewOption }) {
    if (option.icon === "source" && option.baseUrl) {
        return (
            <ScraperFavicon
                scraperId={option.id}
                baseUrl={option.baseUrl}
                fallback={<DetailsCardIcon />}
            />
        );
    }

    return renderViewIcon(option.icon);
}

export default function MangaManagerViewMenu({
    activeViewId,
    options,
    onSelect,
    onOpenInWorkspace,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const activeOption = useMemo(
        () => options.find((option) => option.id === activeViewId) ?? options[0] ?? null,
        [activeViewId, options],
    );
    const filteredOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (!normalizedQuery) {
            return options;
        }

        return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
    }, [options, query]);
    const groupedOptions = useMemo(() => ({
        navigation: filteredOptions.filter((option) => option.group === "navigation"),
        source: filteredOptions.filter((option) => option.group === "source"),
    }), [filteredOptions]);
    const showSearch = options.length > 8;

    useEffect(() => {
        if (!open) {
            setQuery("");
            return undefined;
        }

        if (!showSearch) {
            return undefined;
        }

        const animationFrame = window.requestAnimationFrame(() => searchRef.current?.focus());
        return () => window.cancelAnimationFrame(animationFrame);
    }, [open, showSearch]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const closeOnOutsidePointer = (event: PointerEvent) => {
            const root = rootRef.current;
            if (!root || !(event.target instanceof Node) || root.contains(event.target)) {
                return;
            }

            setOpen(false);
        };

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };

        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        document.addEventListener("keydown", closeOnEscape, true);

        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            document.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [open]);

    const handleSelect = useCallback((viewId: string) => {
        onSelect(viewId);
        setOpen(false);
    }, [onSelect]);

    const handleMiddleClick = useCallback((event: React.MouseEvent, viewId: string) => {
        if (event.button !== MIDDLE_BUTTON) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        onOpenInWorkspace(viewId);
        setOpen(false);
    }, [onOpenInWorkspace]);

    const renderOption = (option: MangaManagerViewOption) => {
        const isActive = option.id === activeViewId;

        return (
            <button
                key={option.id}
                type="button"
                className={[
                    "mangaManager-view-menu__item",
                    isActive ? "is-active" : "",
                ].join(" ").trim()}
                role="menuitem"
                aria-current={isActive ? "page" : undefined}
                onClick={() => handleSelect(option.id)}
                onMouseDown={(event) => {
                    if (event.button === MIDDLE_BUTTON) {
                        event.preventDefault();
                    }
                }}
                onAuxClick={(event) => handleMiddleClick(event, option.id)}
                data-prevent-middle-click-autoscroll="true"
            >
                <span className="mangaManager-view-menu__item-icon" aria-hidden="true">
                    <MangaManagerViewIconDisplay option={option} />
                </span>
                <span>{option.label}</span>
                {isActive ? <span className="mangaManager-view-menu__active-dot" aria-hidden="true" /> : null}
            </button>
        );
    };

    return (
        <div className="mangaManager-view-menu" ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                className="mangaManager-view-menu__trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                <span className="mangaManager-view-menu__trigger-content">
                    <span className="mangaManager-view-menu__trigger-icon" aria-hidden="true">
                        {activeOption
                            ? <MangaManagerViewIconDisplay option={activeOption} />
                            : renderViewIcon("library")}
                    </span>
                    <span className="mangaManager-view-menu__trigger-label">{activeOption?.label ?? "Vue"}</span>
                </span>
                <ChevronDownIcon aria-hidden="true" focusable="false" />
            </button>

            {open ? (
                <div className="mangaManager-view-menu__popover" role="menu">
                    {showSearch ? (
                        <label className="mangaManager-view-menu__search">
                            <MagnifyingGlassIcon aria-hidden="true" />
                            <input
                                ref={searchRef}
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Rechercher une vue ou une source..."
                                aria-label="Rechercher une vue ou une source"
                            />
                        </label>
                    ) : null}

                    <div className="mangaManager-view-menu__list">
                        {groupedOptions.navigation.length > 0 ? (
                            <div className="mangaManager-view-menu__section" role="group" aria-label="Navigation">
                                <div className="mangaManager-view-menu__heading">Navigation</div>
                                {groupedOptions.navigation.map(renderOption)}
                            </div>
                        ) : null}
                        {groupedOptions.source.length > 0 ? (
                            <div className="mangaManager-view-menu__section" role="group" aria-label="Sources">
                                <div className="mangaManager-view-menu__heading">Sources</div>
                                {groupedOptions.source.map(renderOption)}
                            </div>
                        ) : null}
                        {filteredOptions.length === 0 ? (
                            <div className="mangaManager-view-menu__empty">Aucun resultat</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
