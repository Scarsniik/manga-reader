import React, { useState } from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import SimpleMarkdown from "@/renderer/components/Markdown/SimpleMarkdown";
import {
  getJapaneseGrammarReferenceByLink,
  type JapaneseGrammarReference,
} from "@/renderer/content/japaneseGrammar";
import "@/renderer/components/Modal/modales/JapaneseGrammarReferenceModal.scss";

type JapaneseGrammarReferenceModalContentProps = {
  reference: JapaneseGrammarReference;
};

type BreadcrumbProps = {
  entries: JapaneseGrammarReference[];
  currentReference: JapaneseGrammarReference;
  onSelect: (index: number) => void;
};

function JapaneseGrammarBreadcrumb({
  entries,
  currentReference,
  onSelect,
}: BreadcrumbProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <nav className="japanese-grammar-reference-modal__breadcrumb" aria-label="Fil d'Ariane">
      {entries.map((entry, index) => (
        <React.Fragment key={`${entry.title}-${index}`}>
          <button
            type="button"
            className="japanese-grammar-reference-modal__breadcrumb-link"
            onClick={() => onSelect(index)}
          >
            {entry.title}
          </button>
          <span className="japanese-grammar-reference-modal__breadcrumb-separator">/</span>
        </React.Fragment>
      ))}
      <span className="japanese-grammar-reference-modal__breadcrumb-current">
        {currentReference.title}
      </span>
    </nav>
  );
}

function JapaneseGrammarReferenceModalContent({
  reference,
}: JapaneseGrammarReferenceModalContentProps) {
  const [currentReference, setCurrentReference] = useState(reference);
  const [historyEntries, setHistoryEntries] = useState<JapaneseGrammarReference[]>([]);

  const openReference = (nextReference: JapaneseGrammarReference) => {
    setHistoryEntries((currentEntries) => [...currentEntries, currentReference]);
    setCurrentReference(nextReference);
  };

  const selectHistoryEntry = (index: number) => {
    const nextReference = historyEntries[index];
    if (!nextReference) {
      return;
    }

    setHistoryEntries((currentEntries) => currentEntries.slice(0, index));
    setCurrentReference(nextReference);
  };

  return (
    <div className="japanese-grammar-reference-modal__layout">
      <JapaneseGrammarBreadcrumb
        entries={historyEntries}
        currentReference={currentReference}
        onSelect={selectHistoryEntry}
      />

      <SimpleMarkdown
        markdown={currentReference.markdown}
        className="japanese-grammar-reference-modal__content"
        onLinkClick={(target) => {
          const nextReference = getJapaneseGrammarReferenceByLink(target);
          if (nextReference) {
            openReference(nextReference);
          }
        }}
      />
    </div>
  );
}

export default function buildJapaneseGrammarReferenceModal(
  reference: JapaneseGrammarReference,
): ModalOptions {
  return {
    className: "japanese-grammar-reference-modal",
    bodyClassName: "japanese-grammar-reference-modal__body",
    content: <JapaneseGrammarReferenceModalContent reference={reference} />,
    actions: [{
      label: "Fermer",
      variant: "secondary",
      autoFocus: true,
    }],
  };
}
