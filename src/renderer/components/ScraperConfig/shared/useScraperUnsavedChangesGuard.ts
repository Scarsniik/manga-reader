import { useCallback, useEffect, useContext } from 'react';
import buildConfirmActionModal from '@/renderer/components/Modal/modales/ConfirmActionModal';
import { useModal } from '@/renderer/hooks/useModal';
import { ModalInstanceContext } from '@/renderer/context/ModalContext';

type Options = {
  hasUnsavedChanges: boolean;
  enableModalCloseGuard?: boolean;
  onSave?: () => boolean | void | Promise<boolean | void>;
};

export default function useScraperUnsavedChangesGuard({
  hasUnsavedChanges,
  enableModalCloseGuard = false,
  onSave,
}: Options) {
  const {
    openModal,
    closeModal,
    setModalCloseGuard,
  } = useModal();
  const modalInstanceId = useContext(ModalInstanceContext);

  const buildSaveAndLeaveAction = useCallback((leave: () => void) => (
    onSave
      ? [{
        label: 'Enregistrer et quitter',
        variant: 'primary' as const,
        closeOnClick: false,
        onClick: async () => {
          const saveSucceeded = await onSave();
          if (saveSucceeded === false) {
            return;
          }

          closeModal({ force: true });
          leave();
        },
      }]
      : []
  ), [closeModal, onSave]);

  const requestLeave = useCallback((leave: () => void) => {
    if (!hasUnsavedChanges) {
      leave();
      return;
    }

    openModal(buildConfirmActionModal({
      title: 'Modifications non enregistrees',
      message: 'Quitter sans enregistrer ?',
      details: 'Les changements apportes a ce composant seront perdus.',
      confirmLabel: 'Quitter sans enregistrer',
      cancelLabel: 'Continuer l\'edition',
      confirmVariant: 'danger',
      extraActions: buildSaveAndLeaveAction(leave),
      onConfirm: leave,
    }));
  }, [buildSaveAndLeaveAction, hasUnsavedChanges, openModal]);

  const requestClose = useCallback(() => {
    if (!hasUnsavedChanges) {
      closeModal();
      return;
    }

    openModal(buildConfirmActionModal({
      title: 'Modifications non enregistrees',
      message: 'Fermer sans enregistrer ?',
      details: 'Les changements apportes a ce composant seront perdus.',
      confirmLabel: 'Fermer sans enregistrer',
      cancelLabel: 'Continuer l\'edition',
      confirmVariant: 'danger',
      confirmCloseOnClick: false,
      extraActions: onSave
        ? [{
          label: 'Enregistrer et fermer',
          variant: 'primary',
          closeOnClick: false,
          onClick: async () => {
            const saveSucceeded = await onSave();
            if (saveSucceeded === false) {
              return;
            }

            closeModal({ count: 2, force: true });
          },
        }]
        : [],
      onConfirm: () => {
        closeModal({ count: 2, force: true });
      },
    }));
  }, [closeModal, hasUnsavedChanges, onSave, openModal]);

  useEffect(() => {
    if (!enableModalCloseGuard || modalInstanceId === null) {
      return undefined;
    }

    setModalCloseGuard(() => {
      if (!hasUnsavedChanges) {
        return true;
      }

      requestClose();
      return false;
    }, modalInstanceId);

    return () => {
      setModalCloseGuard(null, modalInstanceId);
    };
  }, [
    enableModalCloseGuard,
    hasUnsavedChanges,
    modalInstanceId,
    requestClose,
    setModalCloseGuard,
  ]);

  return {
    requestClose,
    requestLeave,
  };
}
