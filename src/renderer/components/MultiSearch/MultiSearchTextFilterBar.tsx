import React from "react";
import {
  CloseXIcon,
  MagnifyingGlassIcon,
} from "@/renderer/components/icons";

type Props = {
  value: string;
  baseQuery: string;
  onChange: (value: string) => void;
  onFillFromBaseQuery: () => void;
  onClear: () => void;
};

export default function MultiSearchTextFilterBar({
  value,
  baseQuery,
  onChange,
  onFillFromBaseQuery,
  onClear,
}: Props) {
  const canFillFromBaseQuery = Boolean(baseQuery.trim());
  const hasValue = Boolean(value.trim());

  return (
    <div className="multi-search__text-filter-bar" aria-label="Filtre texte des resultats">
      <button
        type="button"
        className="multi-search__text-filter-button"
        onClick={onFillFromBaseQuery}
        disabled={!canFillFromBaseQuery}
        title="Utiliser la recherche principale"
        aria-label="Utiliser la recherche principale"
      >
        <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
      </button>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filtrer les titres charges..."
        aria-label="Texte a rechercher dans les titres charges"
      />
      <button
        type="button"
        className="multi-search__text-filter-button"
        onClick={onClear}
        disabled={!hasValue}
        title="Vider le filtre"
        aria-label="Vider le filtre texte"
      >
        <CloseXIcon aria-hidden="true" focusable="false" />
      </button>
    </div>
  );
}
