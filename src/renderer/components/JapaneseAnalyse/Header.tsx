import React from 'react';
import './Header.scss';

type Props = {
  onClose?: () => void;
};

export default function Header({ onClose }: Props) {
  return (
    <div className="jp-analyse-header">
      <strong>Japanese Analyse (mock)</strong>
      {onClose ? (
        <button onClick={onClose} aria-label="Close" className="close-btn">Close</button>
      ) : null}
    </div>
  );
}
