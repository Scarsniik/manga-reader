import React, { useCallback, useEffect, useState } from "react";
import {
    getOcrRuntimeApi,
    OcrRuntimeInstallStatus,
    OcrRuntimeStatus,
} from "@/renderer/components/OcrRuntime/types";
import { openOcrRuntimeStatus } from "@/renderer/utils/ocrRuntimeUi";
import "@/renderer/components/OcrRuntime/style.scss";

const terminalStages = new Set(["completed", "failed", "cancelled"]);

const isInstallRunning = (status?: OcrRuntimeInstallStatus | null) => !!status?.stage
    && status.stage !== "idle"
    && !terminalStages.has(status.stage);

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

const formatStatus = (status?: OcrRuntimeStatus | null, installStatus?: OcrRuntimeInstallStatus | null) => {
    if (isInstallRunning(installStatus)) {
        return "Installation en cours";
    }
    if (!status) {
        return "Verification...";
    }
    if (status.status === "available") {
        return "Installe";
    }
    if (status.status === "invalid") {
        return "Invalide";
    }
    return "Absent";
};

const formatInstallStage = (status?: OcrRuntimeInstallStatus | null) => {
    switch (status?.step) {
        case "manifest":
            return "Lecture du manifeste";
        case "download":
            return "Telechargement";
        case "assemble":
            return "Assemblage";
        case "extract":
            return "Decompression";
        case "verify":
            return "Verification";
        case "activate":
            return "Activation";
        case "completed":
            return "Terminee";
        default:
            break;
    }

    switch (status?.stage) {
        case "manifest":
            return "Lecture du manifeste";
        case "installing":
            return "Installation";
        case "completed":
            return "Terminee";
        case "failed":
            return "Erreur";
        case "cancelled":
            return "Annulee";
        default:
            return "En attente";
    }
};

export default function OcrRuntimeSettingsPanel() {
    const [runtimeStatus, setRuntimeStatus] = useState<OcrRuntimeStatus | null>(null);
    const [installStatus, setInstallStatus] = useState<OcrRuntimeInstallStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        const api = getOcrRuntimeApi();
        const nextInstallStatus = await api.ocrRuntimeInstallStatus?.();
        setInstallStatus(nextInstallStatus || null);

        if (isInstallRunning(nextInstallStatus)) {
            return;
        }

        const nextRuntimeStatus = await api.ocrRuntimeStatus?.();
        setRuntimeStatus(nextRuntimeStatus || null);
    }, []);

    useEffect(() => {
        void loadStatus().catch((statusError) => {
            setError(statusError instanceof Error ? statusError.message : String(statusError));
        });

        const timer = window.setInterval(() => {
            void loadStatus().catch(() => {
                // keep the last visible state while polling
            });
        }, 1000);

        return () => window.clearInterval(timer);
    }, [loadStatus]);

    const verifyRuntime = useCallback(async () => {
        const api = getOcrRuntimeApi();
        if (typeof api.ocrRuntimeVerify !== "function") {
            setError("Verification OCR indisponible.");
            return;
        }

        setBusy(true);
        setMessage(null);
        setError(null);
        try {
            const result = await api.ocrRuntimeVerify();
            setMessage(result?.ok ? "Runtime OCR valide." : "Runtime OCR absent ou invalide.");
            await loadStatus();
        } catch (verifyError) {
            setError(verifyError instanceof Error ? verifyError.message : String(verifyError));
        } finally {
            setBusy(false);
        }
    }, [loadStatus]);

    const repairRuntime = useCallback(() => {
        openOcrRuntimeStatus({
            title: "Reparer l'OCR",
            message: "Relance l'installation OCR pour remplacer le runtime actuel.",
        });
    }, []);

    const uninstallRuntime = useCallback(async () => {
        const api = getOcrRuntimeApi();
        if (typeof api.ocrRuntimeUninstall !== "function") {
            setError("Desinstallation OCR indisponible.");
            return;
        }

        setBusy(true);
        setMessage(null);
        setError(null);
        try {
            const dryRun = await api.ocrRuntimeUninstall({ dryRun: true });
            const runtimePath = String(dryRun?.runtimePath || runtimeStatus?.runtimePath || "");
            if (!runtimePath) {
                setMessage("Aucun runtime OCR configure.");
                return;
            }

            const confirmed = window.confirm(`Desinstaller le runtime OCR ?\n\n${runtimePath}`);
            if (!confirmed) {
                return;
            }

            const result = await api.ocrRuntimeUninstall({ confirmRuntimePath: runtimePath });
            setMessage(result?.uninstalled ? "Runtime OCR desinstalle." : "Runtime OCR non desinstalle.");
            await loadStatus();
        } catch (uninstallError) {
            setError(uninstallError instanceof Error ? uninstallError.message : String(uninstallError));
        } finally {
            setBusy(false);
        }
    }, [loadStatus, runtimeStatus?.runtimePath]);

    const openRuntimeFolder = useCallback(async () => {
        const targetPath = runtimeStatus?.runtimePath || installStatus?.runtimePath;
        if (!targetPath) {
            return;
        }

        await getOcrRuntimeApi().openPath?.(targetPath);
    }, [installStatus?.runtimePath, runtimeStatus?.runtimePath]);

    const openLog = useCallback(async () => {
        await getOcrRuntimeApi().ocrRuntimeOpenInstallLog?.();
    }, []);

    const isInstalling = isInstallRunning(installStatus);
    const statusClassName = isInstalling ? "installing" : runtimeStatus?.status || "missing";
    const runtimePath = runtimeStatus?.runtimePath || installStatus?.runtimePath || runtimeStatus?.defaultRuntimePath || "Non configure";
    const runtimeVersion = runtimeStatus?.metadata?.runtimeVersion || installStatus?.manifest?.manifest?.runtimeVersion || "Non installe";
    const installProgress = Math.max(0, Math.min(100, Number(installStatus?.progress || 0)));
    const downloadedBytes = Number(installStatus?.downloadedBytes || 0);
    const totalBytes = Number(installStatus?.totalBytes || 0);
    const downloadLabel = totalBytes > 0 ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : "";
    const showInstallProgress = !!installStatus?.stage && installStatus.stage !== "idle" && installStatus.stage !== "completed";
    const showRuntimeIssues = !isInstalling && !!runtimeStatus?.issues?.length;
    const showLastError = !isInstalling && !!runtimeStatus?.config?.lastError;

    return (
        <section className="ocr-runtime-settings">
            <div className="ocr-runtime-settings__header">
                <div>
                    <h3>Runtime OCR</h3>
                    <p>L'OCR permet de reconnaitre le texte present dans les images de manga pour l'analyser dans l'application.</p>
                </div>
                <span className={`ocr-runtime-status-pill ${statusClassName}`}>
                    {formatStatus(runtimeStatus, installStatus)}
                </span>
            </div>

            <div className="ocr-runtime-status-grid">
                <div className="ocr-runtime-status-card">
                    <strong>Chemin</strong>
                    <span>{runtimePath}</span>
                </div>
                <div className="ocr-runtime-status-card">
                    <strong>Version</strong>
                    <span>{runtimeVersion}</span>
                </div>
                <div className="ocr-runtime-status-card">
                    <strong>Installation</strong>
                    <span>{installStatus?.stage === "idle" ? "Aucune en cours" : `${formatInstallStage(installStatus)} - ${installStatus?.message || "En cours"}`}</span>
                </div>
            </div>

            {showInstallProgress ? (
                <>
                    <div className="ocr-runtime-progress" aria-label="Progression installation OCR">
                        <span style={{ width: `${installProgress}%` }} />
                    </div>
                    <div className="ocr-runtime-progress__label">
                        {installProgress}% {downloadLabel ? `- ${downloadLabel}` : ""}
                    </div>
                    <div className="ocr-runtime-message">
                        <strong>{formatInstallStage(installStatus)}</strong>
                        <span>{installStatus?.message || "Installation OCR en cours."}</span>
                        {installStatus?.currentItem ? <small>{installStatus.currentItem}</small> : null}
                    </div>
                </>
            ) : null}

            {showRuntimeIssues ? (
                <div className="ocr-runtime-warning">{runtimeStatus?.issues?.join(" ")}</div>
            ) : null}
            {showLastError ? (
                <div className="ocr-runtime-error">{runtimeStatus?.config?.lastError}</div>
            ) : null}
            {message ? <div className="ocr-runtime-message">{message}</div> : null}
            {error ? <div className="ocr-runtime-error">{error}</div> : null}

            <div className="ocr-runtime-actions">
                <button type="button" onClick={() => openOcrRuntimeStatus({ title: "Installation OCR" })}>
                    {isInstalling ? "Voir l'installation" : "Installer / statut"}
                </button>
                <button type="button" className="secondary" onClick={verifyRuntime} disabled={busy || isInstalling}>
                    Verifier
                </button>
                <button type="button" className="secondary" onClick={repairRuntime} disabled={busy || isInstalling}>
                    Reparer
                </button>
                <button type="button" className="secondary" onClick={openRuntimeFolder} disabled={!runtimeStatus?.runtimePath && !installStatus?.runtimePath}>
                    Ouvrir le dossier
                </button>
                <button type="button" className="secondary" onClick={openLog}>
                    Ouvrir le log
                </button>
                <button type="button" className="danger" onClick={uninstallRuntime} disabled={busy || isInstalling || runtimeStatus?.status !== "available"}>
                    Desinstaller
                </button>
            </div>
        </section>
    );
}
