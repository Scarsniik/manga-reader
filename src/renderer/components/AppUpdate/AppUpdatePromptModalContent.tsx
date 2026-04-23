import React, { useCallback, useMemo, useState } from "react";
import useModal from "@/renderer/hooks/useModal";
import {
    getAppUpdateApi,
    type AppUpdateStatus,
} from "@/renderer/components/AppUpdate/types";
import "@/renderer/components/AppUpdate/style.scss";

export type AppUpdatePromptMode = "available" | "downloaded";

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
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentVersion = useMemo(() => status.currentVersion || "Inconnue", [status.currentVersion]);
    const availableVersion = useMemo(() => status.availableVersion || "Nouvelle version", [status.availableVersion]);
    const availableVersionLabel = mode === "available" ? "Version disponible" : "Version telechargee";

    const handleDismiss = useCallback(() => {
        onDismiss?.();
        closeModal();
    }, [closeModal, onDismiss]);

    const handleDownload = useCallback(async () => {
        setBusy(true);
        setError(null);

        try {
            const result = await getAppUpdateApi().appUpdateDownload?.();
            if (result?.started === false) {
                throw new Error("Le telechargement de la mise a jour ne peut pas demarrer.");
            }

            closeModal();
        } catch (downloadError) {
            setError(normalizeErrorMessage(downloadError));
            setBusy(false);
        }
    }, [closeModal]);

    const handleInstall = useCallback(async () => {
        setBusy(true);
        setError(null);

        try {
            const result = await getAppUpdateApi().appUpdateInstall?.();
            if (result?.started === false) {
                throw new Error("Aucune mise a jour prete a etre installee.");
            }
        } catch (installError) {
            setError(normalizeErrorMessage(installError));
            setBusy(false);
        }
    }, []);

    return (
        <div className="app-update-install-modal">
            <p className="app-update-install-modal__summary">
                {mode === "available" ? (
                    <>
                        La version <strong>{availableVersion}</strong> est disponible. Vous pouvez la telecharger
                        maintenant ou continuer et la lancer plus tard.
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

            {status.message ? <div className="app-update-message">{status.message}</div> : null}
            {error ? <div className="app-update-error">{error}</div> : null}

            <div className="app-update-install-modal__actions">
                <button type="button" className="secondary" onClick={handleDismiss} disabled={busy}>
                    Plus tard
                </button>
                {mode === "available" ? (
                    <button type="button" onClick={handleDownload} disabled={busy}>
                        {busy ? "Telechargement..." : "Telecharger maintenant"}
                    </button>
                ) : (
                    <button type="button" onClick={handleInstall} disabled={busy}>
                        {busy ? "Redemarrage..." : "Redemarrer maintenant"}
                    </button>
                )}
            </div>
        </div>
    );
}
