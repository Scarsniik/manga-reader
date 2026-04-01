import React, { useEffect, useRef } from 'react';
import './DetectedText.scss';

type Props = {
  autoText: string;
  inputText: string;
  isUsingManualText: boolean;
  setInputText: (s: string) => void;
  onValidate: () => Promise<void> | void;
  onReset: () => void;
};

export default function DetectedText({
  autoText,
  inputText,
  isUsingManualText,
  setInputText,
  onValidate,
  onReset,
}: Props) {
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
      <div className="detected-text__header">
        <div className="label">Texte analysé</div>
        <span className="detected-text__status">
          {isUsingManualText ? 'Texte corrigé manuellement' : 'Texte OCR brut'}
        </span>
      </div>
      <div className="manual-input">
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
        <button onClick={onValidate} className="validate-btn">Analyser</button>
        <button onClick={onReset} className="clear-btn">Texte OCR</button>
      </div>
      {autoText ? (
        <div className="auto-text">
          La phrase ci-dessous reste affichée exactement telle qu&apos;elle est transmise à JPDB.
        </div>
      ) : null}
    </div>
  );
}
