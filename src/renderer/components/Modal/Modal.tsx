import React from 'react';
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
  return (
    <div className="app-modal-overlay" onClick={onClose}>
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
