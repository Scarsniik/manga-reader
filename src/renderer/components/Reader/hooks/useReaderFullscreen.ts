import React from "react";

type ReaderFullscreenState = {
    fullscreenAvailable: boolean;
    isFullscreen: boolean;
    requestFullscreen: () => void;
    exitFullscreen: () => void;
    toggleFullscreen: () => void;
};

const canUseFullscreen = () => (
    typeof document !== "undefined"
    && Boolean(document.fullscreenEnabled)
    && typeof document.exitFullscreen === "function"
);

const isVisibleFullscreenTarget = (target: HTMLElement) => (
    target.isConnected && target.getClientRects().length > 0
);

export default function useReaderFullscreen<TElement extends HTMLElement>(
    targetRef: React.RefObject<TElement | null>,
): ReaderFullscreenState {
    const fullscreenAvailable = React.useMemo(() => canUseFullscreen(), []);
    const [isFullscreen, setIsFullscreen] = React.useState(false);

    const syncFullscreenState = React.useCallback(() => {
        setIsFullscreen(document.fullscreenElement === targetRef.current);
    }, [targetRef]);

    React.useEffect(() => {
        if (!fullscreenAvailable) {
            return undefined;
        }

        document.addEventListener("fullscreenchange", syncFullscreenState);
        syncFullscreenState();

        return () => {
            document.removeEventListener("fullscreenchange", syncFullscreenState);

            if (document.fullscreenElement === targetRef.current) {
                void document.exitFullscreen().catch(() => undefined);
            }
        };
    }, [fullscreenAvailable, syncFullscreenState, targetRef]);

    const requestFullscreen = React.useCallback(() => {
        const target = targetRef.current;
        if (
            !fullscreenAvailable
            || !target
            || !isVisibleFullscreenTarget(target)
            || typeof target.requestFullscreen !== "function"
        ) {
            return;
        }

        void target.requestFullscreen()
            .then(syncFullscreenState)
            .catch((error) => {
                console.warn("Reader: fullscreen request failed", error);
                syncFullscreenState();
            });
    }, [fullscreenAvailable, syncFullscreenState, targetRef]);

    const exitFullscreen = React.useCallback(() => {
        if (!fullscreenAvailable || document.fullscreenElement !== targetRef.current) {
            return;
        }

        void document.exitFullscreen()
            .then(syncFullscreenState)
            .catch((error) => {
                console.warn("Reader: fullscreen exit failed", error);
                syncFullscreenState();
            });
    }, [fullscreenAvailable, syncFullscreenState, targetRef]);

    const toggleFullscreen = React.useCallback(() => {
        if (document.fullscreenElement === targetRef.current) {
            exitFullscreen();
            return;
        }

        requestFullscreen();
    }, [exitFullscreen, requestFullscreen, targetRef]);

    return {
        fullscreenAvailable,
        isFullscreen,
        requestFullscreen,
        exitFullscreen,
        toggleFullscreen,
    };
}
