import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import AppUpdateInstallModalContent from "@/renderer/components/AppUpdate/AppUpdateInstallModalContent";
import type { AppUpdateStatus } from "@/renderer/components/AppUpdate/types";

type AppUpdateInstallModalOptions = {
    onDismiss?: () => void;
    status: AppUpdateStatus;
};

export default function buildAppUpdateInstallModal(options: AppUpdateInstallModalOptions): ModalOptions {
    return {
        title: "Mise a jour prete",
        content: (
            <AppUpdateInstallModalContent
                onDismiss={options.onDismiss}
                status={options.status}
            />
        ),
        className: "app-update-install-modal-shell",
    };
}
