import React, { createContext, useState, ReactNode } from 'react';
import Modal from '@/renderer/components/Modal/Modal';

export type ModalAction = {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  id?: string;
};

export type ModalOptions = {
  title?: ReactNode;
  content?: ReactNode;
  actions?: ModalAction[];
};

export type ModalContextValue = {
  openModal: (opts: ModalOptions) => void;
  closeModal: () => void;
};

export const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalOptions | null>(null);

  const openModal = (opts: ModalOptions) => setModal(opts);
  const closeModal = () => setModal(null);

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      {modal ? (
        <Modal
          title={modal.title}
          content={modal.content}
          actions={modal.actions}
          onClose={closeModal}
        />
      ) : null}
    </ModalContext.Provider>
  );
};

export default ModalContext;
