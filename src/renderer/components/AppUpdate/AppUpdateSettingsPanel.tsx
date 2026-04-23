import React, { useCallback, useEffect, useState } from "react";
import useParams from "@/renderer/hooks/useParams";
import {
    getAppUpdateApi,
    type AppUpdateNotificationPayload,
    type AppUpdateStatus,
} from "@/renderer/components/AppUpdate/types";
import "@/renderer/components/AppUpdate/style.scss";

const ACTIVE_STATES = new Set(["checking", "downloading"]);

const formatStatusLabel = (status?: AppUpdateStatus | null) => {
    switch (status?.state) {
        case "checking":
            return "Verification";
        case "available":
            return "Disponible";
        case "not-available":
            return "A jour";
        case "downloading":
            return "Telechargement";
        case "downloaded":
            return "Pret a redemarrer";
        case "error":
            return "Erreur";
        default:
            return status?.isSupported === false ? "Indisponible" : "En attente";
    }
};

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return "Jamais";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(parsed);
};

const formatBytes = (value?: number | null) => {
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
};

export default function AppUpdateSettingsPanel() {
    const { params, setParams } = useParams();
    const [status, setStatus] = useState<AppUpdateStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        const api = getAppUpdateApi();
        const nextStatus = await api.appUpdateStatus?.();
        setStatus(nextStatus || null);
    }, []);

    useEffect(() => {
        void loadStatus().catch((loadError) => {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        });
    }, [loadStatus]);

    useEffect(() => {
        const statusState = status?.state || "idle";
        if (!ACTIVE_STATES.has(statusState)) {
            return undefined;
        }

        const timer = window.setInterval(() => {
            void loadStatus().catch(() => undefined);
        }, 1000);

        return () => window.clearInterval(timer);
    }, [loadStatus, status?.state]);

    useEffect(() => {
        const handleNotification = (event: Event) => {
            const customEvent = event as CustomEvent<AppUpdateNotificationPayload>;
            if (customEvent.detail?.status) {
                setStatus(customEvent.detail.status);
            } else {
                void loadStatus().catch(() => undefined);
            }
        };

        window.addEventListener("app-update-notification", handleNotification);
        return () => window.removeEventListener("app-update-notification", handleNotification);
    }, [loadStatus]);

    const runAction = useCallback(async (action: () => Promise<unknown>, successMessage?: string | null) => {
        setBusy(true);
        setMessage(null);
        setError(null);

        try {
            await action();
            if (successMessage) {
                setMessage(successMessage);
            }
            await loadStatus();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : String(actionError));
        } finally {
            setBusy(false);
        }
    }, [loadStatus]);

    const toggleAutoCheck = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        setMessage(null);
        setError(null);

        try {
            setParams({
                appUpdateAutoCheck: checked,
            }, {
                broadcast: false,
            });
            await loadStatus();
            setMessage(checked
                ? "Verification automatique activee."
                : "Verification automatique desactivee.");
        } catch (toggleError) {
            setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
        }
    }, [loadStatus, setParams]);

    const checkForUpdates = useCallback(() => (
        runAction(async () => {
            const result = await getAppUpdateApi().appUpdateCheck?.();
            if (result?.started === false && result.reason === "unsupported") {
                throw new Error(status?.supportReason || "Mise a jour automatique indisponible.");
            }
        })
    ), [runAction, status?.supportReason]);

    const downloadUpdate = useCallback(() => (
        runAction(async () => {
            const result = await getAppUpdateApi().appUpdateDownload?.();
            if (result?.started === false) {
                throw new Error("Le telechargement de la mise a jour ne peut pas demarrer.");
            }
        })
    ), [runAction]);

    const installUpdate = useCallback(() => (
        runAction(async () => {
            const result = await getAppUpdateApi().appUpdateInstall?.();
            if (result?.started === false) {
                throw new Error("Aucune mise a jour prete a etre installee.");
            }
        }, "Redemarrage pour installer la mise a jour.")
    ), [runAction]);

    const openReleasePage = useCallback(() => (
        runAction(async () => {
            const result = await getAppUpdateApi().appUpdateOpenReleasePage?.();
            if (!result?.opened) {
                throw new Error(result?.error || "Impossible d'ouvrir la page GitHub.");
            }
        })
    ), [runAction]);

    const currentVersion = status?.currentVersion || "Inconnue";
    const availableVersion = status?.availableVersion || "Aucune";
    const autoCheckEnabled = params?.appUpdateAutoCheck !== false;
    const progressPercent = Math.max(0, Math.min(100, Number(status?.progressPercent || 0)));
    const downloadedBytes = Number(status?.transferredBytes || 0);
    const totalBytes = Number(status?.totalBytes || 0);
    const showProgress = status?.state === "downloading";
    const supportWarning = status?.isSupported === false ? (status.supportReason || "Mise a jour automatique indisponible.") : null;
    const canCheck = !busy && status?.state !== "checking" && status?.state !== "downloading";
    const canDownload = !busy && status?.state === "available";
    const canInstall = !busy && status?.state === "downloaded";

    return (
        <section className="app-update-settings">
            <div className="app-update-settings__header">
                <div>
                    <h3>Mise a jour de l'application</h3>
                    <p>Verifie les releases de l'application installee et telecharge une nouvelle version avant redemarrage.</p>
                </div>
                <span className={`app-update-status-pill ${status?.state || "idle"}`}>
                    {formatStatusLabel(status)}
                </span>
            </div>

            <div className="app-update-status-grid">
                <div className="app-update-status-card">
                    <strong>Version actuelle</strong>
                    <span>{currentVersion}</span>
                </div>
                <div className="app-update-status-card">
                    <strong>Version disponible</strong>
                    <span>{availableVersion}</span>
                </div>
                <div className="app-update-status-card">
                    <strong>Derniere verification</strong>
                    <span>{formatDateTime(status?.lastCheckedAt)}</span>
                </div>
            </div>

            {showProgress ? (
                <>
                    <div className="app-update-progress" aria-label="Progression telechargement mise a jour">
                        <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="app-update-progress__label">
                        {progressPercent.toFixed(0)}% {totalBytes > 0 ? `- ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : ""}
                    </div>
                </>
            ) : null}

            {supportWarning ? <div className="app-update-warning">{supportWarning}</div> : null}
            {status?.message ? <div className="app-update-message">{status.message}</div> : null}
            {message ? <div className="app-update-message">{message}</div> : null}
            {status?.errorMessage ? <div className="app-update-error">{status.errorMessage}</div> : null}
            {error ? <div className="app-update-error">{error}</div> : null}

            <div className="app-update-preferences">
                <label className="app-update-toggle">
                    <input
                        type="checkbox"
                        checked={autoCheckEnabled}
                        onChange={toggleAutoCheck}
                    />
                    <span>Verifier automatiquement les mises a jour au lancement</span>
                </label>
            </div>

            <div className="app-update-actions">
                <button type="button" onClick={checkForUpdates} disabled={!canCheck}>
                    Verifier les mises a jour
                </button>
                <button type="button" className="secondary" onClick={downloadUpdate} disabled={!canDownload}>
                    Telecharger
                </button>
                <button type="button" className="secondary" onClick={installUpdate} disabled={!canInstall}>
                    Redemarrer pour installer
                </button>
                <button type="button" className="secondary" onClick={openReleasePage} disabled={busy}>
                    Ouvrir la release
                </button>
            </div>
        </section>
    );
}
