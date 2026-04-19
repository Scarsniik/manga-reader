import React, { useCallback, useEffect, useState } from "react";
import "@/renderer/components/AppTitleBar/style.scss";

type WindowState = {
    isFocused: boolean;
    isFullScreen: boolean;
    isMaximized: boolean;
    isMinimized: boolean;
};

type AppRuntimeInfo = {
    isDev: boolean;
    isPackaged: boolean;
};

type WindowControlsApi = {
    closeWindow?: () => Promise<void>;
    getAppRuntimeInfo?: () => Promise<AppRuntimeInfo>;
    getWindowState?: () => Promise<WindowState | null>;
    minimizeWindow?: () => Promise<WindowState | null>;
    onWindowStateChanged?: (callback: (state: WindowState) => void) => () => void;
    toggleDevTools?: () => Promise<boolean>;
    toggleMaximizeWindow?: () => Promise<WindowState | null>;
};

type AppTitleBarProps = {
    children?: React.ReactNode;
    title?: string;
};

const DEFAULT_WINDOW_STATE: WindowState = {
    isFocused: true,
    isFullScreen: false,
    isMaximized: false,
    isMinimized: false,
};

const getWindowControlsApi = (): WindowControlsApi => (
    (window.api ?? {}) as WindowControlsApi
);

export default function AppTitleBar({ children, title = "Manga Helper" }: AppTitleBarProps) {
    const [windowState, setWindowState] = useState<WindowState>(DEFAULT_WINDOW_STATE);
    const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
    const [controlsAvailable, setControlsAvailable] = useState(false);

    useEffect(() => {
        const api = getWindowControlsApi();
        let isDisposed = false;

        setControlsAvailable(
            typeof api.closeWindow === "function"
            && typeof api.minimizeWindow === "function"
            && typeof api.toggleMaximizeWindow === "function",
        );

        void api.getWindowState?.()
            .then((state) => {
                if (!isDisposed && state) {
                    setWindowState(state);
                }
            })
            .catch(() => undefined);

        void api.getAppRuntimeInfo?.()
            .then((info) => {
                if (!isDisposed) {
                    setRuntimeInfo(info);
                }
            })
            .catch(() => undefined);

        const unsubscribe = api.onWindowStateChanged?.((state) => {
            if (!isDisposed) {
                setWindowState(state);
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe?.();
        };
    }, []);

    const runWindowAction = useCallback((action: () => Promise<WindowState | null | void> | undefined) => {
        void action()
            ?.then((state) => {
                if (state) {
                    setWindowState(state);
                }
            })
            .catch(() => undefined);
    }, []);

    const handleMinimize = useCallback(() => {
        const api = getWindowControlsApi();
        runWindowAction(() => api.minimizeWindow?.());
    }, [runWindowAction]);

    const handleToggleMaximize = useCallback(() => {
        const api = getWindowControlsApi();
        runWindowAction(() => api.toggleMaximizeWindow?.());
    }, [runWindowAction]);

    const handleClose = useCallback(() => {
        const api = getWindowControlsApi();
        runWindowAction(() => api.closeWindow?.());
    }, [runWindowAction]);

    const handleToggleDevTools = useCallback(() => {
        const api = getWindowControlsApi();
        void api.toggleDevTools?.();
    }, []);

    const maximizeLabel = windowState.isMaximized ? "Restaurer" : "Agrandir";
    const showDevToolsButton = runtimeInfo?.isDev && typeof getWindowControlsApi().toggleDevTools === "function";

    return (
        <header className="app-titlebar">
            <div className="app-titlebar__title" title={title}>
                {title}
            </div>

            {children ? (
                <div className="app-titlebar__slot">
                    {children}
                </div>
            ) : null}

            <div className="app-titlebar__drag-space" />

            <div className="app-titlebar__actions">
                {showDevToolsButton ? (
                    <button
                        type="button"
                        className="app-titlebar__devtools"
                        onClick={handleToggleDevTools}
                    >
                        DevTools
                    </button>
                ) : null}

                <button
                    type="button"
                    className="app-titlebar__control"
                    onClick={handleMinimize}
                    disabled={!controlsAvailable}
                    aria-label="Reduire la fenetre"
                    title="Reduire"
                >
                    _
                </button>

                <button
                    type="button"
                    className="app-titlebar__control"
                    onClick={handleToggleMaximize}
                    disabled={!controlsAvailable}
                    aria-label={`${maximizeLabel} la fenetre`}
                    title={maximizeLabel}
                >
                    {windowState.isMaximized ? "[]" : "[ ]"}
                </button>

                <button
                    type="button"
                    className="app-titlebar__control app-titlebar__control--close"
                    onClick={handleClose}
                    disabled={!controlsAvailable}
                    aria-label="Fermer la fenetre"
                    title="Fermer"
                >
                    X
                </button>
            </div>
        </header>
    );
}
