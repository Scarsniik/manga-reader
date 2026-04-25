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
    DEFAULT_READER_SCROLL_HOLD_SPEED,
    DEFAULT_READER_SCROLL_START_BOOST,
    normalizeReaderScrollHoldSpeed,
    normalizeReaderScrollStartBoost,
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
    scrollHoldSpeed: number;
    scrollStartBoost: number;
};

type ScrollDirection = "up" | "down";

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
    scrollHoldSpeed,
    scrollStartBoost,
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

        const getScrollContainer = () => {
            const readerElement = document.querySelector(".reader");
            return readerElement instanceof HTMLElement
                ? findVerticalScrollContainer(readerElement)
                : null;
        };

        const getScrollSpeed = () => {
            const normalizedScrollStrength = normalizeReaderScrollStrength(scrollStrength ?? DEFAULT_READER_SCROLL_STRENGTH);
            const normalizedScrollHoldSpeed = normalizeReaderScrollHoldSpeed(scrollHoldSpeed ?? DEFAULT_READER_SCROLL_HOLD_SPEED);
            return window.innerHeight * (normalizedScrollStrength / 100) * (normalizedScrollHoldSpeed / 100);
        };

        const getScrollInitialStepSeconds = () => {
            const normalizedScrollStartBoost = normalizeReaderScrollStartBoost(
                scrollStartBoost ?? DEFAULT_READER_SCROLL_START_BOOST,
            );
            return normalizedScrollStartBoost / 1000;
        };

        const scrollCurrentViewBy = (distance: number) => {
            const scrollContainer = getScrollContainer();
            const scrollOptions = {
                top: distance,
                left: 0,
                behavior: "auto",
            } as const;

            if (scrollContainer) {
                scrollContainer.scrollBy(scrollOptions);
                return;
            }

            window.scrollBy(scrollOptions);
        };

        const activeScrollKeys = new Map<string, ScrollDirection>();
        let activeScrollDirection: ScrollDirection | null = null;
        let scrollAnimationFrame: number | null = null;
        let lastScrollTimestamp: number | null = null;

        const getScrollKeyId = (event: KeyboardEvent) => event.code || event.key;

        const getCurrentScrollDirection = () => {
            if (
                activeScrollDirection
                && Array.from(activeScrollKeys.values()).includes(activeScrollDirection)
            ) {
                return activeScrollDirection;
            }

            const activeDirections = Array.from(activeScrollKeys.values());
            return activeDirections.length > 0
                ? activeDirections[activeDirections.length - 1]
                : null;
        };

        const stopContinuousScroll = () => {
            if (scrollAnimationFrame !== null) {
                window.cancelAnimationFrame(scrollAnimationFrame);
                scrollAnimationFrame = null;
            }

            lastScrollTimestamp = null;
        };

        const stepContinuousScroll = (timestamp: number) => {
            const direction = getCurrentScrollDirection();
            if (!direction) {
                stopContinuousScroll();
                return;
            }

            if (lastScrollTimestamp === null) {
                lastScrollTimestamp = timestamp;
            }

            const elapsedSeconds = Math.min(48, timestamp - lastScrollTimestamp) / 1000;
            lastScrollTimestamp = timestamp;

            const directionMultiplier = direction === "up" ? -1 : 1;
            scrollCurrentViewBy(directionMultiplier * getScrollSpeed() * elapsedSeconds);
            scrollAnimationFrame = window.requestAnimationFrame(stepContinuousScroll);
        };

        const startContinuousScroll = (event: KeyboardEvent, direction: ScrollDirection) => {
            const keyId = getScrollKeyId(event);
            const wasActive = activeScrollKeys.get(keyId) === direction;

            activeScrollKeys.delete(keyId);
            activeScrollKeys.set(keyId, direction);
            activeScrollDirection = direction;

            if (!wasActive) {
                const directionMultiplier = direction === "up" ? -1 : 1;
                scrollCurrentViewBy(directionMultiplier * getScrollSpeed() * getScrollInitialStepSeconds());
            }

            if (scrollAnimationFrame === null) {
                lastScrollTimestamp = window.performance.now();
                scrollAnimationFrame = window.requestAnimationFrame(stepContinuousScroll);
            }
        };

        const stopScrollKey = (event: KeyboardEvent) => {
            const keyId = getScrollKeyId(event);
            const direction = activeScrollKeys.get(keyId);
            if (!direction) {
                return;
            }

            activeScrollKeys.delete(keyId);
            if (activeScrollDirection === direction) {
                activeScrollDirection = getCurrentScrollDirection();
            }

            if (activeScrollKeys.size === 0) {
                activeScrollDirection = null;
                stopContinuousScroll();
            }
        };

        const stopAllScrollKeys = () => {
            activeScrollKeys.clear();
            activeScrollDirection = null;
            stopContinuousScroll();
        };

        const getScrollShortcutDirection = (event: KeyboardEvent): ScrollDirection | null => {
            if (matchesShortcut(event, "readerScrollUp")) {
                return "up";
            }

            if (matchesShortcut(event, "readerScrollDown")) {
                return "down";
            }

            return null;
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

            const scrollDirection = getScrollShortcutDirection(event);
            if (scrollDirection) {
                preventShortcutDefault(event);
                startContinuousScroll(event, scrollDirection);
                return;
            }

            if (matchesShortcut(event, "readerOcrTokenNavigation") && selectedBoxes.length > 0) {
                preventShortcutDefault(event);
                requestTokenCycle();
            }
        };

        const onKeyUp = (event: KeyboardEvent) => {
            stopScrollKey(event);
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                stopAllScrollKeys();
            }
        };

        window.addEventListener("keydown", onKey);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", stopAllScrollKeys);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", stopAllScrollKeys);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            stopAllScrollKeys();
        };
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
        scrollHoldSpeed,
        scrollStartBoost,
        scrollStrength,
        shortcuts,
        toggleManualSelection,
        toggleOcrPanel,
    ]);
};

export default useReaderShortcuts;
