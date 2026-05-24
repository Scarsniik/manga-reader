import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@/renderer/components/icons";

export type MangaManagerViewOption = {
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

export default function MangaManagerViewMenu({
    activeViewId,
    options,
    onSelect,
    onOpenInWorkspace,
}: Props) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const activeOption = useMemo(
        () => options.find((option) => option.id === activeViewId) ?? options[0] ?? null,
        [activeViewId, options],
    );

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

    return (
        <div className="mangaManager-view-menu" ref={rootRef}>
            <button
                type="button"
                className="mangaManager-view-menu__trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                <span>{activeOption?.label ?? "Vue"}</span>
                <ChevronDownIcon aria-hidden="true" focusable="false" />
            </button>

            {open ? (
                <div className="mangaManager-view-menu__popover" role="menu">
                    {options.map((option) => {
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
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
