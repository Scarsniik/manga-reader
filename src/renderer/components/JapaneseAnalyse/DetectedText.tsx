import React, { useEffect, useRef } from 'react';
import './DetectedText.scss';

type Props = {
  autoText: string;
  inputText: string;
  isUsingManualText: boolean;
  setInputText: (s: string) => void;
  onValidate: () => Promise<void> | void;
  onReset: () => void;
  validateLoading?: boolean;
  validateError?: string | null;
  isDirty?: boolean;
  onCommitPending?: () => Promise<void> | void;
};

export default function DetectedText({
  autoText,
  inputText,
  isUsingManualText,
  setInputText,
  onValidate,
  onReset,
  validateLoading = false,
  validateError = null,
  isDirty = false,
  onCommitPending,
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
          {isDirty ? 'Modification non enregistrée' : isUsingManualText ? 'Texte corrigé manuellement' : 'Texte OCR brut'}
        </span>
      </div>
      <div
        className="manual-input"
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }

          if (!validateLoading && isDirty && typeof onCommitPending === 'function') {
            void onCommitPending();
          }
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.nativeEvent as KeyboardEvent).isComposing) {
              return;
            }

            if (e.key === 'Enter' && !e.shiftKey && !validateLoading) {
              e.preventDefault();
              void onValidate();
            }
          }}
          placeholder={autoText || 'Entrer le texte ici...'}
          aria-label="Texte à analyser"
          className="manual-input__input"
          rows={1}
        />
        <button onClick={onValidate} className="validate-btn" disabled={validateLoading} type="button">
          {validateLoading ? 'Enregistrement...' : 'Analyser'}
        </button>
        <button onClick={onReset} className="clear-btn" disabled={validateLoading} type="button">Texte OCR</button>
      </div>
      {isDirty ? (
        <div className="detected-text__hint">
          Appuie sur Entrée, clique Analyser, ou quitte le champ pour enregistrer la correction OCR.
        </div>
      ) : null}
      {validateError ? (
        <div className="detected-text__error">{validateError}</div>
      ) : null}
      {autoText ? (
        <div className="auto-text">
          La phrase ci-dessous reste affichée exactement telle qu&apos;elle est transmise à JPDB.
        </div>
      ) : null}
    </div>
  );
}
