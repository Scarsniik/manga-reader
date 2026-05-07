import React from "react";
import "@/renderer/components/Modal/modales/ConfirmActionModalContent.scss";

type Props = {
  message: React.ReactNode;
  details?: React.ReactNode;
};

const ConfirmActionModalContent: React.FC<Props> = ({
  message,
  details,
}) => (
  <div className="confirm-action-modal">
    <div className="confirm-action-modal__message">{message}</div>
    {details ? (
      <div className="confirm-action-modal__details">{details}</div>
    ) : null}
  </div>
);

export default ConfirmActionModalContent;
