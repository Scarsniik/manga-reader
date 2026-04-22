import React from "react";
import { requestOcrRuntimeInstall } from "@/renderer/utils/ocrRuntimeUi";
import "@/renderer/components/OcrRuntimeFirstLaunchGate/style.scss";

type OcrRuntimeStatus = {
    status?: "available" | "missing" | "invalid";
    state?: "unknown" | "skipped" | "installing" | "installed" | "failed" | "uninstalling";
    defaultRuntimePath?: string;
};

type OcrRuntimeApi = {
    ocrRuntimeMarkSkipped?: () => Promise<unknown>;
    ocrRuntimeStatus?: () => Promise<OcrRuntimeStatus>;
};

type GateState = "checking" | "open" | "closed";

const getOcrRuntimeApi = (): OcrRuntimeApi => (window.api ?? {}) as OcrRuntimeApi;

const shouldShowFirstLaunchChoice = (status: OcrRuntimeStatus | null) => (
    !!status
    && status.status !== "available"
    && status.state === "unknown"
);

export default function OcrRuntimeFirstLaunchGate() {
    const [gateState, setGateState] = React.useState<GateState>("checking");
    const [status, setStatus] = React.useState<OcrRuntimeStatus | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let disposed = false;
        const api = getOcrRuntimeApi();

        if (typeof api.ocrRuntimeStatus !== "function") {
            setGateState("closed");
            return () => {
                disposed = true;
            };
        }

        void api.ocrRuntimeStatus()
            .then((nextStatus) => {
                if (disposed) {
                    return;
                }

                setStatus(nextStatus);
                setGateState(shouldShowFirstLaunchChoice(nextStatus) ? "open" : "closed");
            })
            .catch(() => {
                if (!disposed) {
                    setGateState("closed");
                }
            });

        return () => {
            disposed = true;
        };
    }, []);

    const handleInstall = React.useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            setGateState("closed");
            requestOcrRuntimeInstall({
                autoStart: false,
                title: "Installation OCR",
                message: "Choisis ou confirme le dossier d'installation, puis lance l'installation. L'application reste utilisable pendant l'installation.",
            });
        } finally {
            setBusy(false);
        }
    }, []);

    const handleSkip = React.useCallback(async () => {
        const api = getOcrRuntimeApi();
        setBusy(true);
        setError(null);
        try {
            await api.ocrRuntimeMarkSkipped?.();
            setGateState("closed");
        } catch (skipError) {
            setError(skipError instanceof Error ? skipError.message : String(skipError));
        } finally {
            setBusy(false);
        }
    }, []);

    if (gateState !== "open") {
        return null;
    }

    return (
        <div className="ocr-runtime-first-launch" role="dialog" aria-modal="true" aria-labelledby="ocr-runtime-first-launch-title">
            <div className="ocr-runtime-first-launch__panel">
                <h2 id="ocr-runtime-first-launch-title">Installer l'OCR</h2>
                <p>
                    L'OCR permet de reconnaitre le texte present dans les images de manga pour l'analyser dans l'application.
                </p>
                <p>
                    Cette fonction necessite un runtime separe. L'application reste utilisable sans OCR.
                </p>
                {status?.defaultRuntimePath ? (
                    <p className="ocr-runtime-first-launch__path">
                        Emplacement propose : {status.defaultRuntimePath}
                    </p>
                ) : null}
                {error ? (
                    <p className="ocr-runtime-first-launch__error">{error}</p>
                ) : null}
                <div className="ocr-runtime-first-launch__actions">
                    <button type="button" className="ocr-runtime-first-launch__secondary" onClick={handleSkip} disabled={busy}>
                        Continuer sans OCR
                    </button>
                    <button type="button" className="ocr-runtime-first-launch__primary" onClick={handleInstall} disabled={busy}>
                        Installer l'OCR
                    </button>
                </div>
            </div>
        </div>
    );
}
