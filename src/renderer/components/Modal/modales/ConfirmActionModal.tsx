import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import ConfirmActionModalContent from "@/renderer/components/Modal/modales/ConfirmActionModalContent";

type ConfirmActionModalInput = {
  title?: React.ReactNode;
  message: React.ReactNode;
  details?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
};

export default function buildConfirmActionModal({
  title = "Confirmer l'action",
  message,
  details,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  confirmVariant = "primary",
  onConfirm,
}: ConfirmActionModalInput): ModalOptions {
  return {
    title,
    content: (
      <ConfirmActionModalContent
        message={message}
        details={details}
      />
    ),
    className: "confirm-action-modal-shell",
    actions: [
      {
        label: cancelLabel,
        variant: "secondary",
        autoFocus: true,
      },
      {
        label: confirmLabel,
        variant: confirmVariant,
        onClick: onConfirm,
      },
    ],
  };
}
