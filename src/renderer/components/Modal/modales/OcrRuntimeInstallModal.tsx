import React from "react";
import { ModalOptions } from "@/renderer/context/ModalContext";
import OcrRuntimeInstallModalContent from "@/renderer/components/OcrRuntime/OcrRuntimeInstallModalContent";

type OcrRuntimeInstallModalOptions = {
    autoStart?: boolean;
    message?: string;
    title?: string;
};

export default function buildOcrRuntimeInstallModal(options: OcrRuntimeInstallModalOptions = {}): ModalOptions {
    return {
        title: options.title || "Installation OCR",
        content: (
            <OcrRuntimeInstallModalContent
                autoStart={!!options.autoStart}
                message={options.message}
            />
        ),
        className: "ocr-runtime-install-modal",
        actions: [
            { label: "Fermer", variant: "secondary" },
        ],
    };
}
