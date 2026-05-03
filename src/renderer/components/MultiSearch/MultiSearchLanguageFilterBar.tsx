import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { getMultiSearchLanguageFilterMode } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { getLanguageLabel } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
} from "@/renderer/components/MultiSearch/types";

type Props = {
  languageCodes: string[];
  filterModes: MultiSearchLanguageFilterModes;
  onToggleFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
};

export default function MultiSearchLanguageFilterBar({
  languageCodes,
  filterModes,
  onToggleFilterMode,
}: Props) {
  if (!languageCodes.length) {
    return null;
  }

  return (
    <div className="multi-search__language-filter-bar" aria-label="Filtre de langue des resultats">
      {languageCodes.map((languageCode) => {
        const filterMode = getMultiSearchLanguageFilterMode(filterModes, languageCode);
        const languageLabel = getLanguageLabel(languageCode);

        return (
          <button
            key={languageCode}
            type="button"
            className={[
              "multi-search__language-filter-button",
              `is-${filterMode}`,
            ].join(" ")}
            onClick={() => onToggleFilterMode(languageCode, "only")}
            onContextMenu={(event) => {
              event.preventDefault();
              onToggleFilterMode(languageCode, "without");
            }}
            title={languageLabel}
            aria-label={`${languageLabel} : ${filterMode}`}
          >
            <LanguageFlags languageCodes={[languageCode]} />
          </button>
        );
      })}
    </div>
  );
}
