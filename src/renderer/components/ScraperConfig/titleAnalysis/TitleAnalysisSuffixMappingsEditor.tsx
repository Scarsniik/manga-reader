import React from "react";
import { type ScraperTitleSuffixMapping } from "@/shared/scraper";
import {
  createTitleAnalysisSuffixMapping,
} from "@/renderer/components/ScraperConfig/titleAnalysis/titleAnalysisEditor.utils";

type Props = {
  suffixMappings: ScraperTitleSuffixMapping[];
  disabled?: boolean;
  onChange: (suffixMappings: ScraperTitleSuffixMapping[]) => void;
};

export default function TitleAnalysisSuffixMappingsEditor({
  suffixMappings,
  disabled = false,
  onChange,
}: Props) {
  const updateMappings = (
    updater: (mappings: ScraperTitleSuffixMapping[]) => ScraperTitleSuffixMapping[],
  ) => {
    onChange(updater(suffixMappings));
  };

  return (
    <>
      <div className="title-analysis-suffixes">
        {suffixMappings.map((mapping, index) => (
          <div key={`${mapping.value}-${index}`} className="title-analysis-suffix-row">
            <input
              type="text"
              value={mapping.value}
              onChange={(event) => updateMappings((mappings) => mappings.map((candidate, candidateIndex) => (
                candidateIndex === index ? { ...candidate, value: event.target.value } : candidate
              )))}
              placeholder="English, Uncensored..."
              disabled={disabled}
            />
            <select
              value={mapping.kind}
              onChange={(event) => updateMappings((mappings) => mappings.map((candidate, candidateIndex) => (
                candidateIndex === index
                  ? {
                    ...candidate,
                    kind: event.target.value === "language" ? "language" : "tag",
                  }
                  : candidate
              )))}
              disabled={disabled}
            >
              <option value="language">Langue</option>
              <option value="tag">Tag</option>
            </select>
            <input
              type="text"
              value={mapping.languageCode ?? ""}
              onChange={(event) => updateMappings((mappings) => mappings.map((candidate, candidateIndex) => (
                candidateIndex === index ? { ...candidate, languageCode: event.target.value } : candidate
              )))}
              placeholder="en, fr, ja..."
              disabled={disabled || mapping.kind !== "language"}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => updateMappings((mappings) => mappings.filter((_, candidateIndex) => candidateIndex !== index))}
              disabled={disabled}
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

      <div className="scraper-config-section__actions">
        <button
          type="button"
          className="secondary"
          onClick={() => updateMappings((mappings) => [...mappings, createTitleAnalysisSuffixMapping()])}
          disabled={disabled}
        >
          Ajouter un suffixe
        </button>
      </div>
    </>
  );
}

