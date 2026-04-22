import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    getOcrRuntimeApi,
    OcrRuntimeInstallStatus,
    OcrRuntimeStatus,
} from "@/renderer/components/OcrRuntime/types";
import "@/renderer/components/OcrRuntime/style.scss";

type Props = {
    autoStart?: boolean;
    message?: string;
};

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

const formatRuntimeStatus = (status?: OcrRuntimeStatus | null) => {
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

export default function OcrRuntimeInstallModalContent({ autoStart = false, message }: Props) {
    const [runtimeStatus, setRuntimeStatus] = useState<OcrRuntimeStatus | null>(null);
    const [installStatus, setInstallStatus] = useState<OcrRuntimeInstallStatus | null>(null);
    const [runtimePath, setRuntimePath] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const autoStartedRef = React.useRef(false);

    const loadStatus = useCallback(async () => {
        const api = getOcrRuntimeApi();
        const nextInstallStatus = typeof api.ocrRuntimeInstallStatus === "function"
            ? await api.ocrRuntimeInstallStatus()
            : null;

        if (nextInstallStatus) {
            setInstallStatus(nextInstallStatus);
            setRuntimePath((currentPath) => currentPath || nextInstallStatus.runtimePath || "");
        }

        if (isInstallRunning(nextInstallStatus)) {
            return;
        }

        const nextRuntimeStatus = typeof api.ocrRuntimeStatus === "function"
            ? await api.ocrRuntimeStatus()
            : null;

        if (nextRuntimeStatus) {
            setRuntimeStatus(nextRuntimeStatus);
            setRuntimePath((currentPath) => currentPath || nextRuntimeStatus.runtimePath || nextRuntimeStatus.defaultRuntimePath || "");
        }
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

    const startInstall = useCallback(async () => {
        const api = getOcrRuntimeApi();
        if (typeof api.ocrRuntimeStartInstall !== "function") {
            setError("Installation OCR indisponible dans cette version.");
            return;
        }

        setBusy(true);
        setError(null);
        try {
            const result = await api.ocrRuntimeStartInstall({
                ...(runtimePath.trim() ? { runtimePath: runtimePath.trim() } : {}),
            });
            if (!result?.started && result?.reason !== "installation-already-running") {
                setError("Impossible de lancer l'installation OCR.");
            }
            await loadStatus();
        } catch (startError) {
            setError(startError instanceof Error ? startError.message : String(startError));
        } finally {
            setBusy(false);
        }
    }, [loadStatus, runtimePath]);

    useEffect(() => {
        if (!autoStart || autoStartedRef.current) {
            return;
        }
        if (!runtimePath.trim()) {
            return;
        }

        autoStartedRef.current = true;
        void startInstall();
    }, [autoStart, runtimePath, startInstall]);

    const cancelInstall = useCallback(async () => {
        const api = getOcrRuntimeApi();
        if (typeof api.ocrRuntimeCancelInstall !== "function") {
            return;
        }

        setBusy(true);
        try {
            await api.ocrRuntimeCancelInstall();
            await loadStatus();
        } catch (cancelError) {
            setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
        } finally {
            setBusy(false);
        }
    }, [loadStatus]);

    const pickRuntimePath = useCallback(async () => {
        const api = getOcrRuntimeApi();
        if (typeof api.openDirectory !== "function") {
            setError("Selection de dossier indisponible.");
            return;
        }

        const selectedPath = await api.openDirectory();
        if (selectedPath) {
            setRuntimePath(selectedPath);
        }
    }, []);

    const openLog = useCallback(async () => {
        const api = getOcrRuntimeApi();
        await api.ocrRuntimeOpenInstallLog?.();
    }, []);

    const openRuntimeFolder = useCallback(async () => {
        const targetPath = runtimeStatus?.runtimePath || installStatus?.runtimePath || runtimePath;
        if (!targetPath) {
            return;
        }

        await getOcrRuntimeApi().openPath?.(targetPath);
    }, [installStatus?.runtimePath, runtimePath, runtimeStatus?.runtimePath]);

    const progress = Math.max(0, Math.min(100, Number(installStatus?.progress || 0)));
    const isInstalling = isInstallRunning(installStatus);
    const canStart = !busy && !isInstalling;
    const canCancel = !busy && !!installStatus?.cancellable;

    const downloadLabel = useMemo(() => {
        const downloadedBytes = Number(installStatus?.downloadedBytes || 0);
        const totalBytes = Number(installStatus?.totalBytes || 0);
        if (totalBytes <= 0) {
            return null;
        }

        return `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
    }, [installStatus?.downloadedBytes, installStatus?.totalBytes]);

    const runtimeStatusLabel = isInstalling ? "Installation en cours" : formatRuntimeStatus(runtimeStatus);
    const showRuntimeIssues = !isInstalling && !!runtimeStatus?.issues?.length;

    return (
        <div className="ocr-runtime-modal">
            {message ? <p className="ocr-runtime-modal__intro">{message}</p> : null}

            <div className="ocr-runtime-status-grid">
                <div className="ocr-runtime-status-card">
                    <strong>Runtime OCR</strong>
                    <span>{runtimeStatusLabel}</span>
                </div>
                <div className="ocr-runtime-status-card">
                    <strong>Version</strong>
                    <span>{runtimeStatus?.metadata?.runtimeVersion || installStatus?.manifest?.manifest?.runtimeVersion || "Non installe"}</span>
                </div>
                <div className="ocr-runtime-status-card">
                    <strong>Installation</strong>
                    <span>{formatInstallStage(installStatus)}</span>
                </div>
            </div>

            <label className="ocr-runtime-path-field">
                <span>Dossier d'installation OCR</span>
                <div>
                    <input
                        type="text"
                        value={runtimePath}
                        onChange={(event) => setRuntimePath(event.target.value)}
                        disabled={isInstalling}
                    />
                    <button type="button" className="secondary" onClick={pickRuntimePath} disabled={isInstalling}>
                        Choisir
                    </button>
                </div>
            </label>

            <div className="ocr-runtime-progress" aria-label="Progression installation OCR">
                <span style={{ width: `${progress}%` }} />
            </div>
            <div className="ocr-runtime-progress__label">
                {progress}% {downloadLabel ? `- ${downloadLabel}` : ""}
            </div>

            <div className="ocr-runtime-message">
                <strong>{formatInstallStage(installStatus)}</strong>
                <span>{installStatus?.message || "Aucune installation OCR en cours."}</span>
                {installStatus?.currentItem ? <small>{installStatus.currentItem}</small> : null}
            </div>

            {showRuntimeIssues ? (
                <div className="ocr-runtime-warning">
                    {runtimeStatus?.issues?.join(" ")}
                </div>
            ) : null}
            {installStatus?.lastError ? (
                <div className="ocr-runtime-error">{installStatus.lastError}</div>
            ) : null}
            {error ? <div className="ocr-runtime-error">{error}</div> : null}

            <div className="ocr-runtime-actions">
                <button type="button" onClick={startInstall} disabled={!canStart}>
                    {installStatus?.stage === "failed" || runtimeStatus?.status === "invalid" ? "Relancer" : "Installer l'OCR"}
                </button>
                <button type="button" className="secondary" onClick={cancelInstall} disabled={!canCancel}>
                    Annuler
                </button>
                <button type="button" className="secondary" onClick={() => { void loadStatus(); }} disabled={busy}>
                    Actualiser
                </button>
                <button type="button" className="secondary" onClick={openLog}>
                    Ouvrir le log
                </button>
                <button type="button" className="secondary" onClick={openRuntimeFolder} disabled={!runtimePath && !runtimeStatus?.runtimePath}>
                    Ouvrir le dossier
                </button>
            </div>
        </div>
    );
}
