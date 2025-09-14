import React, { useEffect, useRef } from 'react';
import './DetectedText.scss';

type Props = {
  autoText: string;
  inputText: string;
  setInputText: (s: string) => void;
  onValidate: () => Promise<void> | void;
  onReset: () => void;
};

export default function DetectedText({ autoText, inputText, setInputText, onValidate, onReset }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Reset height to compute new scrollHeight
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [inputText]);

  return (
    <div className="detected-text">
      <div className="label">Texte à analyser :</div>
      <div className="manual-input">
        {/* Auto-resizing textarea: Enter submits, Shift+Enter inserts newline */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onValidate();
            }
          }}
          placeholder={autoText || 'Entrer le texte ici...'}
          aria-label="Texte à analyser"
          className="manual-input__input"
          rows={1}
        />
        <button onClick={onValidate} className="validate-btn">Valider</button>
        <button onClick={onReset} className="clear-btn">Réinitialiser</button>
      </div>
    </div>
  );
}
