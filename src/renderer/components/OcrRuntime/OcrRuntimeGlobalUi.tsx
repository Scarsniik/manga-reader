import React, { useCallback, useEffect, useState } from "react";
import useModal from "@/renderer/hooks/useModal";
import buildOcrRuntimeInstallModal from "@/renderer/components/Modal/modales/OcrRuntimeInstallModal";
import {
    OCR_RUNTIME_INSTALL_REQUEST_EVENT,
    OCR_RUNTIME_NOTIFICATION_EVENT,
    OCR_RUNTIME_OPEN_STATUS_EVENT,
    OcrRuntimeInstallRequestDetail,
    OcrRuntimeNotificationDetail,
} from "@/renderer/utils/ocrRuntimeUi";
import "@/renderer/components/OcrRuntime/style.scss";

type Toast = Required<OcrRuntimeNotificationDetail> & {
    id: number;
};

const normalizeNotification = (detail?: OcrRuntimeNotificationDetail): Required<OcrRuntimeNotificationDetail> => ({
    kind: detail?.kind || "info",
    title: detail?.title || "OCR",
    message: detail?.message || "",
});

export default function OcrRuntimeGlobalUi() {
    const { openModal } = useModal();
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = React.useRef(0);

    const openInstallModal = useCallback((detail?: OcrRuntimeInstallRequestDetail) => {
        openModal(buildOcrRuntimeInstallModal({
            autoStart: !!detail?.autoStart,
            title: detail?.title,
            message: detail?.message,
        }));
    }, [openModal]);

    const addToast = useCallback((detail?: OcrRuntimeNotificationDetail) => {
        const notification = normalizeNotification(detail);
        if (!notification.message && !notification.title) {
            return;
        }

        toastIdRef.current += 1;
        const id = toastIdRef.current;
        setToasts((current) => [
            ...current.slice(-2),
            { id, ...notification },
        ]);

        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 6000);
    }, []);

    useEffect(() => {
        const handleInstallRequest = (event: Event) => {
            openInstallModal((event as CustomEvent<OcrRuntimeInstallRequestDetail>).detail);
        };
        const handleOpenStatus = (event: Event) => {
            openInstallModal((event as CustomEvent<OcrRuntimeInstallRequestDetail>).detail);
        };
        const handleNotification = (event: Event) => {
            addToast((event as CustomEvent<OcrRuntimeNotificationDetail>).detail);
        };

        window.addEventListener(OCR_RUNTIME_INSTALL_REQUEST_EVENT, handleInstallRequest);
        window.addEventListener(OCR_RUNTIME_OPEN_STATUS_EVENT, handleOpenStatus);
        window.addEventListener(OCR_RUNTIME_NOTIFICATION_EVENT, handleNotification);

        return () => {
            window.removeEventListener(OCR_RUNTIME_INSTALL_REQUEST_EVENT, handleInstallRequest);
            window.removeEventListener(OCR_RUNTIME_OPEN_STATUS_EVENT, handleOpenStatus);
            window.removeEventListener(OCR_RUNTIME_NOTIFICATION_EVENT, handleNotification);
        };
    }, [addToast, openInstallModal]);

    if (toasts.length === 0) {
        return null;
    }

    return (
        <div className="ocr-runtime-toasts" aria-live="polite">
            {toasts.map((toast) => (
                <button
                    key={toast.id}
                    type="button"
                    className={`ocr-runtime-toast ${toast.kind}`}
                    onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                >
                    <strong>{toast.title}</strong>
                    {toast.message ? <span>{toast.message}</span> : null}
                </button>
            ))}
        </div>
    );
}
