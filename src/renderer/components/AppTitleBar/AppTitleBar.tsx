import React, { useCallback, useEffect, useMemo, useState } from "react";
import { APP_PRODUCT_NAME } from "@/renderer/appIdentity";
import AdaptiveDropdown from "@/renderer/components/AdaptiveDropdown/AdaptiveDropdown";
import {
    APP_TITLE_BAR_CONTEXT_EVENT,
    type AppTitleBarContext,
    getAvailableTitleBarMenuActions,
} from "@/renderer/components/AppTitleBar/titleBarMenu";
import ChevronDownIcon from "@/renderer/components/icons/chevron-down.svg?react";
import CloseXIcon from "@/renderer/components/icons/close-x.svg?react";
import OpenBookIcon from "@/renderer/components/icons/open-book.svg?react";
import MaximizeWindowIcon from "@/renderer/components/AppTitleBar/icons/maximize-window.svg?react";
import MinimizeWindowIcon from "@/renderer/components/AppTitleBar/icons/minimize-window.svg?react";
import RestoreWindowIcon from "@/renderer/components/AppTitleBar/icons/restore-window.svg?react";
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
    version: string;
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

const DEFAULT_TITLE_BAR_CONTEXT: AppTitleBarContext = {
    mangaTabCount: 0,
    quickReviewTabCount: 0,
    surface: "main",
};

const getWindowControlsApi = (): WindowControlsApi => (
    (window.api ?? {}) as WindowControlsApi
);

export default function AppTitleBar({ children, title = APP_PRODUCT_NAME }: AppTitleBarProps) {
    const [windowState, setWindowState] = useState<WindowState>(DEFAULT_WINDOW_STATE);
    const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
    const [controlsAvailable, setControlsAvailable] = useState(false);
    const [menuContext, setMenuContext] = useState<AppTitleBarContext>(DEFAULT_TITLE_BAR_CONTEXT);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuActions = useMemo(() => getAvailableTitleBarMenuActions(menuContext), [menuContext]);

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

    useEffect(() => {
        const handleContextChanged = (event: Event) => {
            if (!(event instanceof CustomEvent) || !event.detail) {
                return;
            }

            setMenuContext(event.detail as AppTitleBarContext);
        };

        window.addEventListener(APP_TITLE_BAR_CONTEXT_EVENT, handleContextChanged as EventListener);
        return () => window.removeEventListener(APP_TITLE_BAR_CONTEXT_EVENT, handleContextChanged as EventListener);
    }, []);

    useEffect(() => {
        if (menuActions.length === 0) {
            setMenuOpen(false);
        }
    }, [menuActions.length]);

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
    const versionBadgeLabel = runtimeInfo?.version ? `v${runtimeInfo.version}` : "Version";

    return (
        <header className={`app-titlebar${windowState.isFocused ? "" : " is-unfocused"}`}>
            <div className="app-titlebar__brand" title={`${title} - ${versionBadgeLabel}`}>
                <span className="app-titlebar__brand-mark" aria-hidden="true">
                    <OpenBookIcon />
                </span>
                <div className="app-titlebar__title">
                    {title}
                </div>
                <span className="app-titlebar__badge">
                    {versionBadgeLabel}
                </span>
            </div>

            {children ? (
                <div className="app-titlebar__slot">
                    {children}
                </div>
            ) : null}

            {menuActions.length > 0 ? (
                <AdaptiveDropdown
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    className="app-titlebar__menu"
                    contentClassName="app-titlebar__menu-dropdown"
                    contentRole="menu"
                    gap={5}
                    renderTrigger={({ contentId, isOpen, setTriggerRef, toggle }) => (
                        <button
                            ref={setTriggerRef}
                            type="button"
                            className="app-titlebar__menu-trigger"
                            aria-controls={contentId}
                            aria-expanded={isOpen}
                            aria-haspopup="menu"
                            onClick={toggle}
                        >
                            <span className="app-titlebar__menu-trigger-icon" aria-hidden="true">
                                <OpenBookIcon />
                            </span>
                            <span>Actions</span>
                            <ChevronDownIcon className="app-titlebar__menu-chevron" aria-hidden="true" />
                        </button>
                    )}
                >
                    <div className="app-titlebar__menu-heading">Actions rapides</div>
                    {menuActions.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setMenuOpen(false);
                                window.dispatchEvent(new CustomEvent(action.commandEventName));
                            }}
                        >
                            <span className="app-titlebar__menu-item-icon" aria-hidden="true">
                                <OpenBookIcon />
                            </span>
                            <span>{action.label}</span>
                        </button>
                    ))}
                </AdaptiveDropdown>
            ) : null}

            <div className="app-titlebar__drag-space" />

            <div className="app-titlebar__actions">
                {showDevToolsButton ? (
                    <button
                        type="button"
                        className="app-titlebar__devtools"
                        onClick={handleToggleDevTools}
                        title="Ouvrir les outils de developpement"
                    >
                        <span aria-hidden="true">&lt;/&gt;</span>
                        <span className="app-titlebar__devtools-label">DevTools</span>
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
                    <MinimizeWindowIcon aria-hidden="true" />
                </button>

                <button
                    type="button"
                    className="app-titlebar__control"
                    onClick={handleToggleMaximize}
                    disabled={!controlsAvailable}
                    aria-label={`${maximizeLabel} la fenetre`}
                    title={maximizeLabel}
                >
                    {windowState.isMaximized
                        ? <RestoreWindowIcon aria-hidden="true" />
                        : <MaximizeWindowIcon aria-hidden="true" />}
                </button>

                <button
                    type="button"
                    className="app-titlebar__control app-titlebar__control--close"
                    onClick={handleClose}
                    disabled={!controlsAvailable}
                    aria-label="Fermer la fenetre"
                    title="Fermer"
                >
                    <CloseXIcon aria-hidden="true" />
                </button>
            </div>
        </header>
    );
}
