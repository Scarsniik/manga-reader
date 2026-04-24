import React, { createContext, useCallback, useMemo, useState, ReactNode } from 'react';
import Modal from '@/renderer/components/Modal/Modal';

export type ModalAction = {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  id?: string;
  closeOnClick?: boolean;
};

export type ModalOptions = {
  title?: ReactNode;
  content?: ReactNode;
  actions?: ModalAction[];
  className?: string;
  bodyClassName?: string;
};

export type ModalContextValue = {
  openModal: (opts: ModalOptions) => void;
  closeModal: () => void;
  setModalActions: (actions: ModalAction[]) => void;
};

export const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalOptions | null>(null);

  const openModal = useCallback((opts: ModalOptions) => setModal(opts), []);
  const closeModal = useCallback(() => setModal(null), []);
  const setModalActions = useCallback((actions: ModalAction[]) => {
    setModal((currentModal) => currentModal ? { ...currentModal, actions } : currentModal);
  }, []);

  const value = useMemo(() => ({
    openModal,
    closeModal,
    setModalActions,
  }), [closeModal, openModal, setModalActions]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      {modal ? (
        <Modal
          title={modal.title}
          content={modal.content}
          actions={modal.actions}
          className={modal.className}
          bodyClassName={modal.bodyClassName}
          onClose={closeModal}
        />
      ) : null}
    </ModalContext.Provider>
  );
};

export default ModalContext;
