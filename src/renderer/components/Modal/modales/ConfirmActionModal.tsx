import React from "react";
import type { ModalAction, ModalOptions } from "@/renderer/context/ModalContext";
import ConfirmActionModalContent from "@/renderer/components/Modal/modales/ConfirmActionModalContent";

type ConfirmActionModalInput = {
  title?: React.ReactNode;
  message: React.ReactNode;
  details?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  confirmCloseOnClick?: boolean;
  extraActions?: ModalAction[];
  checkbox?: {
    label: React.ReactNode;
    defaultChecked?: boolean;
  };
  onCancel?: (checkboxChecked: boolean) => void;
  onConfirm: (checkboxChecked: boolean) => void;
};

export default function buildConfirmActionModal({
  title = "Confirmer l'action",
  message,
  details,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  confirmVariant = "primary",
  confirmCloseOnClick = true,
  extraActions = [],
  checkbox,
  onCancel,
  onConfirm,
}: ConfirmActionModalInput): ModalOptions {
  let checkboxChecked = checkbox?.defaultChecked ?? false;
  let actionCompleted = false;
  const handleCancel = () => {
    if (actionCompleted) return;
    actionCompleted = true;
    onCancel?.(checkboxChecked);
  };
  const handleConfirm = () => {
    if (actionCompleted) return;
    actionCompleted = true;
    onConfirm(checkboxChecked);
  };

  return {
    title,
    content: (
      <ConfirmActionModalContent
        message={message}
        details={details}
        checkbox={checkbox ? {
          ...checkbox,
          onChange: (checked) => {
            checkboxChecked = checked;
          },
        } : undefined}
      />
    ),
    className: "confirm-action-modal-shell",
    actions: [
      {
        label: cancelLabel,
        variant: "secondary",
        autoFocus: true,
        onClick: handleCancel,
      },
      ...extraActions,
      {
        label: confirmLabel,
        variant: confirmVariant,
        onClick: handleConfirm,
        closeOnClick: confirmCloseOnClick,
      },
    ],
    closeGuard: onCancel ? () => {
      handleCancel();
      return true;
    } : undefined,
  };
}
