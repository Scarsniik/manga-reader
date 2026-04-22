export const OCR_RUNTIME_MISSING_CODE = "OCR_RUNTIME_MISSING";
export const OCR_RUNTIME_INSTALL_REQUEST_EVENT = "ocr-runtime-install-request";
export const OCR_RUNTIME_OPEN_STATUS_EVENT = "ocr-runtime-open-status";
export const OCR_RUNTIME_NOTIFICATION_EVENT = "ocr-runtime-notification";

export type OcrRuntimeInstallRequestDetail = {
    autoStart?: boolean;
    reason?: string;
    title?: string;
    message?: string;
};

export type OcrRuntimeNotificationDetail = {
    kind?: "success" | "error" | "info" | "warning";
    title?: string;
    message?: string;
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error || "");
};

export const isOcrRuntimeMissingError = (error: unknown) => {
    const message = getErrorMessage(error);
    return message.includes(OCR_RUNTIME_MISSING_CODE)
        || (typeof error === "object"
            && error !== null
            && "code" in error
            && (error as { code?: unknown }).code === OCR_RUNTIME_MISSING_CODE);
};

export const requestOcrRuntimeInstall = (detail: OcrRuntimeInstallRequestDetail = {}) => {
    window.dispatchEvent(new CustomEvent<OcrRuntimeInstallRequestDetail>(
        OCR_RUNTIME_INSTALL_REQUEST_EVENT,
        { detail },
    ));
};

export const openOcrRuntimeStatus = (detail: OcrRuntimeInstallRequestDetail = {}) => {
    window.dispatchEvent(new CustomEvent<OcrRuntimeInstallRequestDetail>(
        OCR_RUNTIME_OPEN_STATUS_EVENT,
        { detail },
    ));
};

export const notifyOcrRuntimeMissing = (error: unknown, detail: OcrRuntimeInstallRequestDetail = {}) => {
    if (!isOcrRuntimeMissingError(error)) {
        return false;
    }

    requestOcrRuntimeInstall({
        title: "Installer l'OCR",
        message: "L'OCR n'est pas encore installe. Installe le runtime OCR pour utiliser cette action.",
        ...detail,
    });
    return true;
};
