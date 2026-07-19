import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import BackgroundSearchQueueModalContent from "@/renderer/components/Modal/modales/BackgroundSearchQueueModalContent";

export default function buildBackgroundSearchQueueModal(): ModalOptions {
  return {
    title: (
      <div className="background-search-modal-title">
        <span className="background-search-modal-title__icon" aria-hidden="true"><MagnifyingGlassIcon /></span>
        <span>
          <strong>Recherches en arrière-plan</strong>
          <small>Exécution, résultats et fichiers temporaires</small>
        </span>
      </div>
    ),
    className: "background-search-dialog",
    bodyClassName: "background-search-dialog__body",
    content: <BackgroundSearchQueueModalContent />,
    actions: [{ label: "Fermer", variant: "secondary" }],
  };
}

