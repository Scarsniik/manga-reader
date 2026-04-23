import type { OcrRuntimeDetection } from "./types";

export const OCR_RUNTIME_MISSING_CODE = "OCR_RUNTIME_MISSING";

export class OcrRuntimeUnavailableError extends Error {
    code = OCR_RUNTIME_MISSING_CODE;
    runtimeStatus: OcrRuntimeDetection | null;
    details: string[];

    constructor(message: string, runtimeStatus: OcrRuntimeDetection | null = null, details: string[] = []) {
        super(`${OCR_RUNTIME_MISSING_CODE}: ${message}`);
        this.name = "OcrRuntimeUnavailableError";
        this.runtimeStatus = runtimeStatus;
        this.details = details;
    }
}

export const isOcrRuntimeUnavailableError = (error: unknown): error is OcrRuntimeUnavailableError => (
    error instanceof OcrRuntimeUnavailableError
    || !!(
        error
        && typeof error === "object"
        && "code" in error
        && (error as { code?: unknown }).code === OCR_RUNTIME_MISSING_CODE
    )
);
