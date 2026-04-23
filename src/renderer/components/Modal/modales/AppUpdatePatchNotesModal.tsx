import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import AppUpdatePatchNotesPanel from "@/renderer/components/AppUpdate/AppUpdatePatchNotesPanel";

export default function buildAppUpdatePatchNotesModal(): ModalOptions {
    return {
        title: "20 dernieres patchnotes",
        className: "app-update-patchnotes-modal-shell",
        content: (
            <AppUpdatePatchNotesPanel
                description="Historique recent des releases publiees sur GitHub."
                limit={20}
                emptyMessage="Aucune release publiee avec patchnote pour le moment."
            />
        ),
    };
}
