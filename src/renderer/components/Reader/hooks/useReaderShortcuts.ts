import React from "react";
import useShortcutSettings from "@/renderer/hooks/useShortcutSettings";
import {
    ShortcutActionId,
    doesKeyboardEventMatchShortcutAction,
} from "@/renderer/utils/shortcutBindings";
import { findVerticalScrollContainer } from "@/renderer/utils/scrollPosition";
import { OcrNavigationDirection } from "@/renderer/components/Reader/types";
import {
    DEFAULT_READER_SCROLL_STRENGTH,
    normalizeReaderScrollStrength,
} from "@/shared/readerSettings";

type Args = {
    copyCurrentImage: () => Promise<void>;
    selectedBoxes: string[];
    requestTokenCycle: () => void;
    navigateOcrBox: (direction: OcrNavigationDirection) => boolean;
    toggleManualSelection: () => void;
    openOcrPanel: () => void;
    toggleOcrPanel: () => void;
    next: () => void;
    prev: () => void;
    activeOcrEnabled: boolean;
    ocrPanelAvailable: boolean;
    requireFreshNavigationInput: boolean;
    scrollStrength: number;
};

const OCR_NAVIGATION_ACTIONS: Array<{
    actionId: ShortcutActionId;
    direction: OcrNavigationDirection;
}> = [
    {
        actionId: "readerOcrNavigateUp",
        direction: "up",
    },
    {
        actionId: "readerOcrNavigateDown",
        direction: "down",
    },
    {
        actionId: "readerOcrNavigateLeft",
        direction: "left",
    },
    {
        actionId: "readerOcrNavigateRight",
        direction: "right",
    },
];

const useReaderShortcuts = ({
    copyCurrentImage,
    selectedBoxes,
    requestTokenCycle,
    navigateOcrBox,
    toggleManualSelection,
    openOcrPanel,
    toggleOcrPanel,
    next,
    prev,
    activeOcrEnabled,
    ocrPanelAvailable,
    requireFreshNavigationInput,
    scrollStrength,
}: Args) => {
    const { shortcuts } = useShortcutSettings();

    React.useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) {
                return false;
            }

            if (target.isContentEditable) {
                return true;
            }

            const tagName = target.tagName.toLowerCase();
            return tagName === "input" || tagName === "textarea" || tagName === "select";
        };

        const matchesShortcut = (event: KeyboardEvent, actionId: ShortcutActionId) => (
            doesKeyboardEventMatchShortcutAction(event, shortcuts, actionId)
        );

        const preventShortcutDefault = (event: KeyboardEvent) => {
            try {
                event.preventDefault();
            } catch {}
        };

        const scrollCurrentView = (direction: "up" | "down") => {
            const normalizedScrollStrength = normalizeReaderScrollStrength(scrollStrength ?? DEFAULT_READER_SCROLL_STRENGTH);
            const amount = window.innerHeight * (normalizedScrollStrength / 100);
            const readerElement = document.querySelector(".reader");
            const scrollContainer = readerElement instanceof HTMLElement
                ? findVerticalScrollContainer(readerElement)
                : null;
            const scrollOptions = {
                top: direction === "up" ? -amount : amount,
                behavior: "smooth",
            } as const;

            if (scrollContainer) {
                scrollContainer.scrollBy(scrollOptions);
                return;
            }

            window.scrollBy(scrollOptions);
        };

        const onKey = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) {
                return;
            }

            const key = event.key.toLowerCase();
            const selectedText = window.getSelection ? window.getSelection()?.toString() : "";
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "c" && !selectedText) {
                preventShortcutDefault(event);
                void copyCurrentImage();
                return;
            }

            if (matchesShortcut(event, "readerOcrTogglePanel")) {
                if (!ocrPanelAvailable) {
                    return;
                }

                preventShortcutDefault(event);
                toggleOcrPanel();
                return;
            }

            if (matchesShortcut(event, "readerOcrManualSelection")) {
                if (!ocrPanelAvailable) {
                    return;
                }

                preventShortcutDefault(event);
                if (!activeOcrEnabled) {
                    openOcrPanel();
                }
                toggleManualSelection();
                return;
            }

            const ocrNavigationAction = OCR_NAVIGATION_ACTIONS.find((action) => (
                matchesShortcut(event, action.actionId)
            ));
            if (ocrNavigationAction && navigateOcrBox(ocrNavigationAction.direction)) {
                preventShortcutDefault(event);
                return;
            }

            if (matchesShortcut(event, "readerPageNext")) {
                preventShortcutDefault(event);
                if (requireFreshNavigationInput && event.repeat) {
                    return;
                }
                next();
                return;
            }

            if (matchesShortcut(event, "readerPagePrevious")) {
                preventShortcutDefault(event);
                if (requireFreshNavigationInput && event.repeat) {
                    return;
                }
                prev();
                return;
            }

            if (matchesShortcut(event, "readerScrollUp")) {
                preventShortcutDefault(event);
                scrollCurrentView("up");
                return;
            }

            if (matchesShortcut(event, "readerScrollDown")) {
                preventShortcutDefault(event);
                scrollCurrentView("down");
                return;
            }

            if (matchesShortcut(event, "readerOcrTokenNavigation") && selectedBoxes.length > 0) {
                preventShortcutDefault(event);
                requestTokenCycle();
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [
        activeOcrEnabled,
        copyCurrentImage,
        navigateOcrBox,
        next,
        ocrPanelAvailable,
        openOcrPanel,
        prev,
        requestTokenCycle,
        requireFreshNavigationInput,
        selectedBoxes,
        scrollStrength,
        shortcuts,
        toggleManualSelection,
        toggleOcrPanel,
    ]);
};

export default useReaderShortcuts;
