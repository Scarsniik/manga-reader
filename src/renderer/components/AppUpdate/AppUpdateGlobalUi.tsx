import React, { useCallback, useEffect, useRef } from "react";
import buildAppUpdateInstallModal from "@/renderer/components/Modal/modales/AppUpdateInstallModal";
import useModal from "@/renderer/hooks/useModal";
import {
    APP_UPDATE_NOTIFICATION_EVENT,
    getAppUpdateApi,
    type AppUpdateNotificationPayload,
    type AppUpdateStatus,
} from "@/renderer/components/AppUpdate/types";

const getDownloadedVersionKey = (status?: AppUpdateStatus | null): string | null => {
    if (status?.state !== "downloaded") {
        return null;
    }

    if (typeof status.availableVersion === "string" && status.availableVersion.trim().length > 0) {
        return status.availableVersion.trim();
    }

    return "__downloaded_update__";
};

export default function AppUpdateGlobalUi() {
    const { openModal } = useModal();
    const promptedVersionRef = useRef<string | null>(null);
    const dismissedVersionRef = useRef<string | null>(null);

    const maybeOpenInstallPrompt = useCallback((status?: AppUpdateStatus | null) => {
        const versionKey = getDownloadedVersionKey(status);
        if (!versionKey || !status) {
            if (status?.state !== "downloaded") {
                promptedVersionRef.current = null;
            }
            return;
        }

        if (promptedVersionRef.current === versionKey || dismissedVersionRef.current === versionKey) {
            return;
        }

        promptedVersionRef.current = versionKey;
        openModal(buildAppUpdateInstallModal({
            status,
            onDismiss: () => {
                dismissedVersionRef.current = versionKey;
            },
        }));
    }, [openModal]);

    useEffect(() => {
        const handleNotification = (event: Event) => {
            const payload = (event as CustomEvent<AppUpdateNotificationPayload>).detail;
            maybeOpenInstallPrompt(payload?.status || null);
        };

        window.addEventListener(APP_UPDATE_NOTIFICATION_EVENT, handleNotification);

        const loadInitialStatus = async () => {
            const status = await getAppUpdateApi().appUpdateStatus?.();
            maybeOpenInstallPrompt(status || null);
        };

        void loadInitialStatus().catch(() => undefined);

        return () => {
            window.removeEventListener(APP_UPDATE_NOTIFICATION_EVENT, handleNotification);
        };
    }, [maybeOpenInstallPrompt]);

    return null;
}
