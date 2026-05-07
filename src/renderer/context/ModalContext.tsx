import React, { createContext, useCallback, useMemo, useState, ReactNode } from 'react';
import Modal from '@/renderer/components/Modal/Modal';

export type ModalAction = {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  id?: string;
  closeOnClick?: boolean;
  autoFocus?: boolean;
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
  const [modalStack, setModalStack] = useState<ModalOptions[]>([]);

  const openModal = useCallback((opts: ModalOptions) => {
    setModalStack((currentStack) => [...currentStack, opts]);
  }, []);
  const closeModal = useCallback(() => {
    setModalStack((currentStack) => currentStack.slice(0, -1));
  }, []);
  const setModalActions = useCallback((actions: ModalAction[]) => {
    setModalStack((currentStack) => {
      if (currentStack.length === 0) {
        return currentStack;
      }

      return currentStack.map((modal, index) => (
        index === currentStack.length - 1
          ? { ...modal, actions }
          : modal
      ));
    });
  }, []);

  const value = useMemo(() => ({
    openModal,
    closeModal,
    setModalActions,
  }), [closeModal, openModal, setModalActions]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      {modalStack.map((modal, index) => (
        <Modal
          key={index}
          title={modal.title}
          content={modal.content}
          actions={modal.actions}
          className={modal.className}
          bodyClassName={modal.bodyClassName}
          onClose={closeModal}
        />
      ))}
    </ModalContext.Provider>
  );
};

export default ModalContext;
