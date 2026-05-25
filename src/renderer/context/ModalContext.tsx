import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { createPortal } from "react-dom";
import Modal from '@/renderer/components/Modal/Modal';

export type ModalAction = {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  id?: string;
  closeOnClick?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
};

export type ModalCloseGuard = () => boolean;

export type ModalOptions = {
  title?: ReactNode;
  content?: ReactNode;
  actions?: ModalAction[];
  className?: string;
  bodyClassName?: string;
  closeGuard?: ModalCloseGuard | null;
};

export type CloseModalOptions = {
  count?: number;
  force?: boolean;
};

export type ModalContextValue = {
  openModal: (opts: ModalOptions) => void;
  closeModal: (options?: CloseModalOptions) => void;
  setModalActions: (actions: ModalAction[], instanceId?: number | null) => void;
  setModalCloseGuard: (guard: ModalCloseGuard | null, instanceId?: number | null) => void;
};

export const ModalContext = createContext<ModalContextValue | undefined>(undefined);
export const ModalInstanceContext = createContext<number | null>(null);

type ModalStackItem = ModalOptions & {
  instanceId: number;
};

const getFullscreenModalTarget = (): Element | null => {
  if (typeof document === "undefined") {
    return null;
  }

  return document.fullscreenElement;
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalStack, setModalStack] = useState<ModalStackItem[]>([]);
  const [fullscreenModalTarget, setFullscreenModalTarget] = useState<Element | null>(getFullscreenModalTarget);
  const modalStackRef = useRef<ModalStackItem[]>([]);
  const nextModalInstanceIdRef = useRef(1);

  useEffect(() => {
    modalStackRef.current = modalStack;
  }, [modalStack]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const syncFullscreenModalTarget = () => {
      setFullscreenModalTarget(getFullscreenModalTarget());
    };

    document.addEventListener("fullscreenchange", syncFullscreenModalTarget);
    syncFullscreenModalTarget();

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenModalTarget);
    };
  }, []);

  const openModal = useCallback((opts: ModalOptions) => {
    const instanceId = nextModalInstanceIdRef.current;
    nextModalInstanceIdRef.current += 1;
    setModalStack((currentStack) => [...currentStack, { ...opts, instanceId }]);
  }, []);
  const closeModal = useCallback((options: CloseModalOptions = {}) => {
    const count = Math.max(1, options.count ?? 1);
    const topModal = modalStackRef.current[modalStackRef.current.length - 1];
    if (!options.force && count === 1 && topModal?.closeGuard && !topModal.closeGuard()) {
      return;
    }

    setModalStack((currentStack) => currentStack.slice(0, Math.max(0, currentStack.length - count)));
  }, []);
  const setModalActions = useCallback((actions: ModalAction[], instanceId?: number | null) => {
    setModalStack((currentStack) => {
      if (currentStack.length === 0) {
        return currentStack;
      }

      const targetIndex = instanceId
        ? currentStack.findIndex((modal) => modal.instanceId === instanceId)
        : currentStack.length - 1;

      if (targetIndex < 0) {
        return currentStack;
      }

      return currentStack.map((modal, index) => (
        index === targetIndex
          ? { ...modal, actions }
          : modal
      ));
    });
  }, []);
  const setModalCloseGuard = useCallback((guard: ModalCloseGuard | null, instanceId?: number | null) => {
    setModalStack((currentStack) => {
      if (currentStack.length === 0) {
        return currentStack;
      }

      const targetIndex = instanceId
        ? currentStack.findIndex((modal) => modal.instanceId === instanceId)
        : currentStack.length - 1;

      if (targetIndex < 0) {
        return currentStack;
      }

      return currentStack.map((modal, index) => (
        index === targetIndex
          ? { ...modal, closeGuard: guard }
          : modal
      ));
    });
  }, []);

  const value = useMemo(() => ({
    openModal,
    closeModal,
    setModalActions,
    setModalCloseGuard,
  }), [closeModal, openModal, setModalActions, setModalCloseGuard]);

  const modalNodes = modalStack.map((modal) => (
    <ModalInstanceContext.Provider key={modal.instanceId} value={modal.instanceId}>
      <Modal
        title={modal.title}
        content={modal.content}
        actions={modal.actions}
        className={modal.className}
        bodyClassName={modal.bodyClassName}
        onClose={closeModal}
      />
    </ModalInstanceContext.Provider>
  ));

  return (
    <ModalContext.Provider value={value}>
      {children}
      {fullscreenModalTarget
        ? createPortal(modalNodes, fullscreenModalTarget)
        : modalNodes}
    </ModalContext.Provider>
  );
};

export default ModalContext;
