import React from "react";
import { ModalOptions } from "@/renderer/context/ModalContext";
import LibraryMetadataModalContent from "@/renderer/components/Modal/modales/LibraryMetadataModalContent";

export default function buildLibraryMetadataModal(): ModalOptions {
  return {
    title: "Métadonnées de la bibliothèque",
    className: "library-metadata-modal",
    bodyClassName: "library-metadata-modal__body",
    content: <LibraryMetadataModalContent />,
    actions: [
      {
        label: "Fermer",
        variant: "secondary",
      },
    ],
  };
}
