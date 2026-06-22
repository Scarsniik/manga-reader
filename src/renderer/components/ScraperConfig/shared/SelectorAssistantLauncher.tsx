import React from "react";

type Props = {
  opening: boolean;
  error?: string | null;
  disabled?: boolean;
  onOpen: () => void;
};

export default function SelectorAssistantLauncher({ opening, error, disabled = false, onOpen }: Props) {
  return (
    <div className="selector-assistant-launcher">
      <div>
        <strong>Assistant visuel</strong>
        <span>Navigue depuis le site, definis le pattern d&apos;URL puis construis les selecteurs visuellement.</span>
      </div>
      <button type="button" className="secondary" disabled={disabled || opening} onClick={onOpen}>
        {opening ? "Ouverture…" : "Ouvrir l'assistant"}
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
