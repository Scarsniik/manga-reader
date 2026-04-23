import React, { useCallback, useEffect, useRef } from "react";
import buildAppUpdatePromptModal from "@/renderer/components/Modal/modales/AppUpdatePromptModal";
import useModal from "@/renderer/hooks/useModal";
import {
    APP_UPDATE_NOTIFICATION_EVENT,
    getAppUpdateApi,
    type AppUpdateNotificationPayload,
    type AppUpdateStatus,
} from "@/renderer/components/AppUpdate/types";

const getPromptMode = (status?: AppUpdateStatus | null): "available" | "downloading" | "downloaded" | null => {
    if (status?.state === "available") {
        return "available";
    }

    if (status?.state === "downloading") {
        return "downloading";
    }

    if (status?.state === "downloaded") {
        return "downloaded";
    }

    return null;
};

const getPromptKey = (status?: AppUpdateStatus | null): string | null => {
    const mode = getPromptMode(status);
    if (!mode || !status) {
        return null;
    }

    if (typeof status.availableVersion === "string" && status.availableVersion.trim().length > 0) {
        return `${mode}:${status.availableVersion.trim()}`;
    }

    return `${mode}:__pending_update__`;
};

export default function AppUpdateGlobalUi() {
    const { openModal } = useModal();
    const promptedKeyRef = useRef<string | null>(null);
    const dismissedPromptKeysRef = useRef(new Set<string>());
    const activeUpdateModalKeyRef = useRef<string | null>(null);

    const maybeOpenPrompt = useCallback((status?: AppUpdateStatus | null) => {
        const promptMode = getPromptMode(status);
        const promptKey = getPromptKey(status);
        if (!promptMode || !promptKey || !status) {
            if (activeUpdateModalKeyRef.current && getPromptMode(status) === null) {
                promptedKeyRef.current = null;
            }
            return;
        }

        if (promptMode === "downloading" && !activeUpdateModalKeyRef.current) {
            return;
        }

        if (promptedKeyRef.current === promptKey || dismissedPromptKeysRef.current.has(promptKey)) {
            return;
        }

        promptedKeyRef.current = promptKey;
        activeUpdateModalKeyRef.current = promptKey;
        openModal(buildAppUpdatePromptModal({
            mode: promptMode,
            status,
            onDismiss: () => {
                dismissedPromptKeysRef.current.add(promptKey);
                activeUpdateModalKeyRef.current = null;
            },
        }));
    }, [openModal]);

    useEffect(() => {
        const handleNotification = (event: Event) => {
            const payload = (event as CustomEvent<AppUpdateNotificationPayload>).detail;
            maybeOpenPrompt(payload?.status || null);
        };

        window.addEventListener(APP_UPDATE_NOTIFICATION_EVENT, handleNotification);

        const loadInitialStatus = async () => {
            const status = await getAppUpdateApi().appUpdateStatus?.();
            maybeOpenPrompt(status || null);
        };

        void loadInitialStatus().catch(() => undefined);

        return () => {
            window.removeEventListener(APP_UPDATE_NOTIFICATION_EVENT, handleNotification);
        };
    }, [maybeOpenPrompt]);

    return null;
}
