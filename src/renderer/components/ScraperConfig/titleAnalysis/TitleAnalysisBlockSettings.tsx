import React from "react";
import {
  type ScraperTitleAnalysisBlockConfig,
  type ScraperTitleAnalysisBlockKind,
  type ScraperTitleAnalysisField,
} from "@/shared/scraper";
import {
  TITLE_ANALYSIS_BLOCK_KIND_OPTIONS,
  TITLE_ANALYSIS_FIELD_OPTIONS,
} from "@/renderer/components/ScraperConfig/titleAnalysis/titleAnalysisEditor.utils";

type Props = {
  block: ScraperTitleAnalysisBlockConfig;
  blockCount: number;
  label: string;
  disabled?: boolean;
  onUpdate: (updater: (block: ScraperTitleAnalysisBlockConfig) => ScraperTitleAnalysisBlockConfig) => void;
  onKindChange: (kind: ScraperTitleAnalysisBlockKind) => void;
  onRemove: () => void;
};

export default function TitleAnalysisBlockSettings({
  block,
  blockCount,
  label,
  disabled = false,
  onUpdate,
  onKindChange,
  onRemove,
}: Props) {
  return (
    <div className="title-analysis-block-settings">
      <div className="title-analysis-block-settings__header">
        <strong>{label}</strong>
        <button
          type="button"
          className="secondary"
          onClick={onRemove}
          disabled={disabled || blockCount <= 1}
        >
          Supprimer le bloc
        </button>
      </div>

      <div className="title-analysis-settings-grid">
        <label>
          <span>Type de bloc</span>
          <select
            value={block.kind}
            onChange={(event) => onKindChange(event.target.value as ScraperTitleAnalysisBlockKind)}
            disabled={disabled}
          >
            {TITLE_ANALYSIS_BLOCK_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {block.kind !== "suffixes" ? (
          <label>
            <span>Champ capture</span>
            <select
              value={block.field ?? ""}
              onChange={(event) => onUpdate((currentBlock) => ({
                ...currentBlock,
                field: event.target.value as ScraperTitleAnalysisField || undefined,
              }))}
              disabled={disabled}
            >
              <option value="">Aucun</option>
              {TITLE_ANALYSIS_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        {block.kind === "bracketWithParentheses" ? (
          <label>
            <span>Champ interne</span>
            <select
              value={block.innerField ?? ""}
              onChange={(event) => onUpdate((currentBlock) => ({
                ...currentBlock,
                innerField: event.target.value as ScraperTitleAnalysisField || undefined,
              }))}
              disabled={disabled}
            >
              <option value="">Aucun</option>
              {TITLE_ANALYSIS_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span>Validation</span>
          <select
            value={block.validation ?? "none"}
            onChange={(event) => onUpdate((currentBlock) => ({
              ...currentBlock,
              validation: event.target.value === "language" ? "language" : "none",
            }))}
            disabled={disabled}
          >
            <option value="none">Aucune</option>
            <option value="language">Doit etre une langue</option>
          </select>
        </label>

        <label>
          <span>Si validation echoue</span>
          <select
            value={block.onValidationFailure ?? "rejectVariant"}
            onChange={(event) => onUpdate((currentBlock) => ({
              ...currentBlock,
              onValidationFailure: event.target.value === "continue" ? "continue" : "rejectVariant",
            }))}
            disabled={disabled}
          >
            <option value="rejectVariant">Passer a la variante suivante</option>
            <option value="continue">Continuer</option>
          </select>
        </label>
      </div>

      <div className="title-analysis-checks">
        <label>
          <input
            type="checkbox"
            checked={block.enabled}
            onChange={(event) => onUpdate((currentBlock) => ({
              ...currentBlock,
              enabled: event.target.checked,
            }))}
            disabled={disabled}
          />
          <span>Bloc actif</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={block.optional}
            onChange={(event) => onUpdate((currentBlock) => ({
              ...currentBlock,
              optional: event.target.checked,
            }))}
            disabled={disabled}
          />
          <span>Bloc optionnel</span>
        </label>
      </div>
    </div>
  );
}

