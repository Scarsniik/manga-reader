import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import AppUpdatePromptModalContent, { type AppUpdatePromptMode } from "@/renderer/components/AppUpdate/AppUpdatePromptModalContent";
import type { AppUpdateStatus } from "@/renderer/components/AppUpdate/types";

type AppUpdatePromptModalOptions = {
    mode: AppUpdatePromptMode;
    onDismiss?: () => void;
    status: AppUpdateStatus;
};

export default function buildAppUpdatePromptModal(options: AppUpdatePromptModalOptions): ModalOptions {
    const title = options.mode === "available"
        ? "Mise a jour disponible"
        : options.mode === "downloading"
            ? "Telechargement en cours"
        : "Mise a jour prete";

    return {
        title,
        content: (
            <AppUpdatePromptModalContent
                mode={options.mode}
                onDismiss={options.onDismiss}
                status={options.status}
            />
        ),
        className: "app-update-install-modal-shell",
    };
}
