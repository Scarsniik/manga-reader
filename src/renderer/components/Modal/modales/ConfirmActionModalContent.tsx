import React from "react";
import "@/renderer/components/Modal/modales/ConfirmActionModalContent.scss";

type Props = {
  message: React.ReactNode;
  details?: React.ReactNode;
  checkbox?: {
    label: React.ReactNode;
    defaultChecked?: boolean;
    onChange: (checked: boolean) => void;
  };
};

const ConfirmActionModalContent: React.FC<Props> = ({
  message,
  details,
  checkbox,
}) => (
  <div className="confirm-action-modal">
    <div className="confirm-action-modal__message">{message}</div>
    {details ? (
      <div className="confirm-action-modal__details">{details}</div>
    ) : null}
    {checkbox ? (
      <label className="confirm-action-modal__checkbox">
        <input
          type="checkbox"
          defaultChecked={checkbox.defaultChecked}
          onChange={(event) => checkbox.onChange(event.currentTarget.checked)}
        />
        <span className="confirm-action-modal__checkbox-control" aria-hidden="true" />
        <span className="confirm-action-modal__checkbox-label">{checkbox.label}</span>
      </label>
    ) : null}
  </div>
);

export default ConfirmActionModalContent;
