import React from "react";
import useShortcutSettings from "@/renderer/hooks/useShortcutSettings";
import useParams from "@/renderer/hooks/useParams";
import {
    ShortcutActionId,
    ShortcutPressType,
    doesKeyboardEventMatchShortcutAction,
} from "@/renderer/utils/shortcutBindings";
import { normalizeShortcutLongPressDelay } from "@/shared/shortcutSettings";
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
    navigateOrderedOcrBox: (direction: OrderedOcrNavigationDirection) => boolean;
    toggleManualSelection: () => void;
    toggleOrderSelection: () => void;
    openOcrPanel: () => void;
    toggleOcrPanel: () => void;
    toggleFullscreen: () => void;
    playSelectedOcrVoice: () => void;
    playSelectedOcrVoiceSlower: () => void;
    playSelectedOcrVoiceFaster: () => void;
    readerBodyRef: React.RefObject<HTMLDivElement | null>;
    next: () => void;
    prev: () => void;
    activeOcrEnabled: boolean;
    ocrPanelAvailable: boolean;
    fullscreenAvailable: boolean;
    requireFreshNavigationInput: boolean;
    scrollStrength: number;
    scrollHoldSpeed: number;
    scrollStartBoost: number;
};

type ScrollDirection = "up" | "down";
type OrderedOcrNavigationDirection = "previous" | "next";

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

const ORDERED_OCR_NAVIGATION_ACTIONS: Array<{
    actionId: ShortcutActionId;
    direction: OrderedOcrNavigationDirection;
}> = [
    {
        actionId: "readerOcrOrderedPrevious",
        direction: "previous",
    },
    {
        actionId: "readerOcrOrderedNext",
        direction: "next",
    },
];

const READER_SHORTCUT_ACTION_IDS: ShortcutActionId[] = [
    "readerScrollUp",
    "readerScrollDown",
    "readerPageNext",
    "readerPagePrevious",
    "readerFullscreenToggle",
    ...OCR_NAVIGATION_ACTIONS.map((action) => action.actionId),
    "readerOcrManualSelection",
    "readerOcrOrderSelection",
    ...ORDERED_OCR_NAVIGATION_ACTIONS.map((action) => action.actionId),
    "readerOcrTogglePanel",
    "readerOcrTokenNavigation",
    "readerOcrPlayVoice",
    "readerOcrPlayVoiceSlower",
    "readerOcrPlayVoiceFaster",
];

const useReaderShortcuts = ({
    copyCurrentImage,
    selectedBoxes,
    requestTokenCycle,
    navigateOcrBox,
    navigateOrderedOcrBox,
    toggleManualSelection,
    toggleOrderSelection,
    openOcrPanel,
    toggleOcrPanel,
    toggleFullscreen,
    playSelectedOcrVoice,
    playSelectedOcrVoiceSlower,
    playSelectedOcrVoiceFaster,
    readerBodyRef,
    next,
    prev,
    activeOcrEnabled,
    ocrPanelAvailable,
    fullscreenAvailable,
    requireFreshNavigationInput,
    scrollStrength,
    scrollHoldSpeed,
    scrollStartBoost,
}: Args) => {
    const { shortcuts } = useShortcutSettings();
    const { params } = useParams();
    const longPressDelay = normalizeShortcutLongPressDelay(params?.shortcutLongPressDelayMs);

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

        let activePressType: ShortcutPressType = "short";
        const matchesShortcut = (event: KeyboardEvent, actionId: ShortcutActionId) => (
            doesKeyboardEventMatchShortcutAction(event, shortcuts, actionId, activePressType)
        );

        const preventShortcutDefault = (event: KeyboardEvent) => {
            try {
                event.preventDefault();
            } catch {}
        };

        const getScrollContainer = () => {
            const readerBodyElement = readerBodyRef.current;
            if (!readerBodyElement) {
                return null;
            }

            if (document.fullscreenElement === readerBodyElement) {
                return readerBodyElement;
            }

            return findVerticalScrollContainer(readerBodyElement);
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

        const runKeyAction = (event: KeyboardEvent) => {
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

            if (matchesShortcut(event, "readerFullscreenToggle")) {
                if (!fullscreenAvailable) {
                    return;
                }

                preventShortcutDefault(event);
                if (!event.repeat) {
                    toggleFullscreen();
                }
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

            if (matchesShortcut(event, "readerOcrOrderSelection")) {
                if (!ocrPanelAvailable) {
                    return;
                }

                preventShortcutDefault(event);
                if (!activeOcrEnabled) {
                    openOcrPanel();
                }
                toggleOrderSelection();
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

            const ocrNavigationAction = OCR_NAVIGATION_ACTIONS.find((action) => (
                matchesShortcut(event, action.actionId)
            ));
            if (ocrNavigationAction && navigateOcrBox(ocrNavigationAction.direction)) {
                preventShortcutDefault(event);
                return;
            }

            const orderedOcrNavigationAction = ORDERED_OCR_NAVIGATION_ACTIONS.find((action) => (
                matchesShortcut(event, action.actionId)
            ));
            if (
                orderedOcrNavigationAction
                && navigateOrderedOcrBox(orderedOcrNavigationAction.direction)
            ) {
                preventShortcutDefault(event);
                return;
            }

            if (matchesShortcut(event, "readerOcrTokenNavigation") && selectedBoxes.length > 0) {
                preventShortcutDefault(event);
                requestTokenCycle();
                return;
            }

            if (matchesShortcut(event, "readerOcrPlayVoice")) {
                preventShortcutDefault(event);
                if (!event.repeat) {
                    playSelectedOcrVoice();
                }
                return;
            }

            if (matchesShortcut(event, "readerOcrPlayVoiceSlower")) {
                preventShortcutDefault(event);
                if (!event.repeat) {
                    playSelectedOcrVoiceSlower();
                }
                return;
            }

            if (matchesShortcut(event, "readerOcrPlayVoiceFaster")) {
                preventShortcutDefault(event);
                if (!event.repeat) {
                    playSelectedOcrVoiceFaster();
                }
            }
        };

        const pendingLongPresses = new Map<string, {
            event: KeyboardEvent;
            fired: boolean;
            hasShortAction: boolean;
            timerId: number;
        }>();
        const runKeyActionForPress = (event: KeyboardEvent, pressType: ShortcutPressType) => {
            activePressType = pressType;
            try {
                runKeyAction(event);
            } finally {
                activePressType = "short";
            }
        };
        const getKeyId = (event: KeyboardEvent) => event.code || event.key;
        const matchesAnyAction = (event: KeyboardEvent, pressType: ShortcutPressType) => (
            READER_SHORTCUT_ACTION_IDS.some((actionId) => (
                doesKeyboardEventMatchShortcutAction(event, shortcuts, actionId, pressType)
            ))
        );
        const clearPendingLongPresses = () => {
            pendingLongPresses.forEach((pending) => window.clearTimeout(pending.timerId));
            pendingLongPresses.clear();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;

            const keyId = getKeyId(event);
            if (event.repeat && pendingLongPresses.has(keyId)) {
                preventShortcutDefault(event);
                return;
            }

            if (!event.repeat && matchesAnyAction(event, "long")) {
                preventShortcutDefault(event);
                const pending = {
                    event,
                    fired: false,
                    hasShortAction: matchesAnyAction(event, "short"),
                    timerId: 0,
                };
                pending.timerId = window.setTimeout(() => {
                    pending.fired = true;
                    runKeyActionForPress(pending.event, "long");
                }, longPressDelay);
                pendingLongPresses.set(keyId, pending);
                return;
            }

            runKeyActionForPress(event, "short");
        };
        const onKeyUp = (event: KeyboardEvent) => {
            const pending = pendingLongPresses.get(getKeyId(event));
            if (pending) {
                preventShortcutDefault(event);
                window.clearTimeout(pending.timerId);
                pendingLongPresses.delete(getKeyId(event));
                if (!pending.fired && pending.hasShortAction) {
                    runKeyActionForPress(pending.event, "short");
                }
            }
            stopScrollKey(event);
        };

        const stopAllKeyboardActivity = () => {
            clearPendingLongPresses();
            stopAllScrollKeys();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                stopAllKeyboardActivity();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", stopAllKeyboardActivity);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", stopAllKeyboardActivity);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            stopAllKeyboardActivity();
        };
    }, [
        activeOcrEnabled,
        copyCurrentImage,
        fullscreenAvailable,
        longPressDelay,
        navigateOrderedOcrBox,
        navigateOcrBox,
        next,
        ocrPanelAvailable,
        openOcrPanel,
        playSelectedOcrVoice,
        playSelectedOcrVoiceFaster,
        playSelectedOcrVoiceSlower,
        prev,
        requestTokenCycle,
        requireFreshNavigationInput,
        readerBodyRef,
        selectedBoxes,
        scrollHoldSpeed,
        scrollStartBoost,
        scrollStrength,
        shortcuts,
        toggleManualSelection,
        toggleOrderSelection,
        toggleOcrPanel,
        toggleFullscreen,
    ]);
};

export default useReaderShortcuts;
