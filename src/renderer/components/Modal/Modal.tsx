import React, { useEffect, useRef } from 'react';
import '@/renderer/components/Modal/style.scss';

type Action = {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  id?: string;
};

const Modal: React.FC<{
  title?: React.ReactNode;
  content?: React.ReactNode;
  actions?: Action[];
  onClose?: () => void;
}> = ({ title, content, actions = [], onClose }) => {
  const backdropPressStarted = useRef(false);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    backdropPressStarted.current = event.target === event.currentTarget;
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const isDirectOverlayClick = event.target === event.currentTarget;

    if (backdropPressStarted.current && isDirectOverlayClick) {
      onClose?.();
    }

    backdropPressStarted.current = false;
  };

  return (
    <div
      className="app-modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div className="app-modal" onClick={(e) => e.stopPropagation()}>
        {title ? <div className="app-modal-header">{title}</div> : null}
        <div className="app-modal-body">{content}</div>
        <div className="app-modal-actions">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              id={a.id}
              className={`app-modal-btn ${a.variant === 'primary' ? 'primary' : 'secondary'}`}
              onClick={() => {
                a.onClick?.();
                onClose?.();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Modal;
