import React, { useCallback, useMemo, useState } from "react";
import useModal from "@/renderer/hooks/useModal";
import {
    APP_UPDATE_NOTIFICATION_EVENT,
    getAppUpdateApi,
    type AppUpdateNotificationPayload,
    type AppUpdateStatus,
} from "@/renderer/components/AppUpdate/types";
import "@/renderer/components/AppUpdate/style.scss";

export type AppUpdatePromptMode = "available" | "downloading" | "downloaded";

type AppUpdatePromptModalContentProps = {
    mode: AppUpdatePromptMode;
    onDismiss?: () => void;
    status: AppUpdateStatus;
};

const normalizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error || "Une erreur inconnue est survenue.");
};

export default function AppUpdatePromptModalContent({
    mode,
    onDismiss,
    status,
}: AppUpdatePromptModalContentProps) {
    const { closeModal } = useModal();
    const [currentStatus, setCurrentStatus] = useState(status);
    const [pendingAction, setPendingAction] = useState<"download" | "install" | null>(null);
    const [error, setError] = useState<string | null>(null);

    React.useEffect(() => {
        setCurrentStatus(status);
        setError(null);
    }, [status]);

    React.useEffect(() => {
        const handleNotification = (event: Event) => {
            const payload = (event as CustomEvent<AppUpdateNotificationPayload>).detail;
            if (payload?.status) {
                setCurrentStatus(payload.status);
                if (payload.status.state === "downloading" || payload.status.state === "downloaded" || payload.status.state === "error") {
                    setPendingAction(null);
                }
            }
        };

        window.addEventListener(APP_UPDATE_NOTIFICATION_EVENT, handleNotification);
        return () => {
            window.removeEventListener(APP_UPDATE_NOTIFICATION_EVENT, handleNotification);
        };
    }, []);

    const resolvedMode = useMemo<AppUpdatePromptMode>(() => {
        if (currentStatus.state === "downloaded") {
            return "downloaded";
        }

        if (currentStatus.state === "downloading") {
            return "downloading";
        }

        if (currentStatus.state === "available") {
            return "available";
        }

        return mode;
    }, [currentStatus.state, mode]);

    const currentVersion = useMemo(() => currentStatus.currentVersion || "Inconnue", [currentStatus.currentVersion]);
    const availableVersion = useMemo(() => currentStatus.availableVersion || "Nouvelle version", [currentStatus.availableVersion]);
    const availableVersionLabel = resolvedMode === "available"
        ? "Version disponible"
        : resolvedMode === "downloading"
            ? "Version en cours"
            : "Version telechargee";
    const progressPercent = Math.max(0, Math.min(100, Number(currentStatus.progressPercent || 0)));
    const downloadedBytes = Number(currentStatus.transferredBytes || 0);
    const totalBytes = Number(currentStatus.totalBytes || 0);
    const isInstalling = pendingAction === "install";
    const isStartingDownload = pendingAction === "download";
    const closeLabel = resolvedMode === "downloading" ? "Fermer" : "Plus tard";

    const handleDismiss = useCallback(() => {
        onDismiss?.();
        closeModal();
    }, [closeModal, onDismiss]);

    const formatBytes = useCallback((value?: number | null) => {
        const bytes = Number(value || 0);
        if (bytes <= 0) {
            return "0 Mo";
        }

        const units = ["o", "Ko", "Mo", "Go"];
        let unitIndex = 0;
        let nextValue = bytes;
        while (nextValue >= 1024 && unitIndex < units.length - 1) {
            nextValue /= 1024;
            unitIndex += 1;
        }

        return `${nextValue.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }, []);

    const handleDownload = useCallback(async () => {
        setPendingAction("download");
        setError(null);

        try {
            const result = await getAppUpdateApi().appUpdateDownload?.();
            if (result?.started === false) {
                throw new Error("Le telechargement de la mise a jour ne peut pas demarrer.");
            }
            setCurrentStatus((current) => ({
                ...current,
                state: "downloading",
                message: "Telechargement de la mise a jour en cours.",
                progressPercent: Number(current.progressPercent || 0),
            }));
        } catch (downloadError) {
            setError(normalizeErrorMessage(downloadError));
            setPendingAction(null);
        }
    }, []);

    const handleInstall = useCallback(async () => {
        setPendingAction("install");
        setError(null);

        try {
            const result = await getAppUpdateApi().appUpdateInstall?.();
            if (result?.started === false) {
                throw new Error("Aucune mise a jour prete a etre installee.");
            }
        } catch (installError) {
            setError(normalizeErrorMessage(installError));
            setPendingAction(null);
        }
    }, []);

    return (
        <div className="app-update-install-modal">
            <p className="app-update-install-modal__summary">
                {resolvedMode === "available" ? (
                    <>
                        La version <strong>{availableVersion}</strong> est disponible. Vous pouvez la telecharger
                        maintenant ou continuer et la lancer plus tard.
                    </>
                ) : resolvedMode === "downloading" ? (
                    <>
                        La version <strong>{availableVersion}</strong> est en cours de telechargement. Vous pouvez
                        fermer cette fenetre, le telechargement continuera en arriere-plan.
                    </>
                ) : (
                    <>
                        La version <strong>{availableVersion}</strong> est telechargee et prete a etre installee.
                        Vous pouvez redemarrer maintenant ou continuer et installer plus tard.
                    </>
                )}
            </p>

            <div className="app-update-install-modal__meta">
                <div className="app-update-install-modal__meta-card">
                    <strong>Version actuelle</strong>
                    <span>{currentVersion}</span>
                </div>
                <div className="app-update-install-modal__meta-card">
                    <strong>{availableVersionLabel}</strong>
                    <span>{availableVersion}</span>
                </div>
            </div>

            {resolvedMode === "downloading" ? (
                <div className="app-update-install-modal__download">
                    <div className="app-update-progress" aria-label="Progression telechargement mise a jour">
                        <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="app-update-progress__label">
                        {progressPercent.toFixed(0)}% {totalBytes > 0 ? `- ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : ""}
                    </div>
                </div>
            ) : null}

            {currentStatus.message ? <div className="app-update-message">{currentStatus.message}</div> : null}
            {currentStatus.errorMessage ? <div className="app-update-error">{currentStatus.errorMessage}</div> : null}
            {error ? <div className="app-update-error">{error}</div> : null}

            <div className="app-update-install-modal__actions">
                <button type="button" className="secondary" onClick={handleDismiss} disabled={isInstalling}>
                    {closeLabel}
                </button>
                {resolvedMode === "available" ? (
                    <button type="button" onClick={handleDownload} disabled={isStartingDownload}>
                        {isStartingDownload ? "Telechargement..." : "Telecharger maintenant"}
                    </button>
                ) : null}
                {resolvedMode === "downloaded" ? (
                    <button type="button" onClick={handleInstall} disabled={isInstalling}>
                        {isInstalling ? "Redemarrage..." : "Redemarrer maintenant"}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
