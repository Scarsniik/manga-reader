import React, { useMemo, useState } from "react";
import {
  type ScraperTitleAnalysisBlockConfig,
  type ScraperTitleAnalysisBlockKind,
  type ScraperTitleAnalysisConfig,
  type ScraperTitleAnalysisVariantConfig,
} from "@/shared/scraper";
import TitleAnalysisBlockSettings from "@/renderer/components/ScraperConfig/titleAnalysis/TitleAnalysisBlockSettings";
import {
  TITLE_ANALYSIS_BLOCK_KIND_LABELS,
  TITLE_ANALYSIS_BLOCK_KIND_OPTIONS,
  TITLE_ANALYSIS_FIELD_LABELS,
  createTitleAnalysisBlock,
  createTitleAnalysisVariant,
  moveArrayItem,
} from "@/renderer/components/ScraperConfig/titleAnalysis/titleAnalysisEditor.utils";

type Props = {
  config: ScraperTitleAnalysisConfig;
  activeVariantId: string | null;
  disabled?: boolean;
  onActiveVariantChange: (variantId: string) => void;
  onConfigChange: (config: ScraperTitleAnalysisConfig) => void;
};

const getBlockLabel = (block: ScraperTitleAnalysisBlockConfig): string => {
  if (block.kind === "bracketWithParentheses") {
    return `[${block.field ? TITLE_ANALYSIS_FIELD_LABELS[block.field] : "Valeur"} (${block.innerField ? TITLE_ANALYSIS_FIELD_LABELS[block.innerField] : "Valeur"})]`;
  }

  if (block.kind === "bracket") {
    return `[${block.field ? TITLE_ANALYSIS_FIELD_LABELS[block.field] : "Valeur"}]`;
  }

  if (block.kind === "parentheses") {
    return `(${block.field ? TITLE_ANALYSIS_FIELD_LABELS[block.field] : "Valeur"})`;
  }

  if (block.kind === "suffixes") {
    return "[Suffixes...]";
  }

  return block.field ? TITLE_ANALYSIS_FIELD_LABELS[block.field] : "Titre";
};

export default function TitleAnalysisVariantEditor({
  config,
  activeVariantId,
  disabled = false,
  onActiveVariantChange,
  onConfigChange,
}: Props) {
  const [draggedVariantId, setDraggedVariantId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const activeVariant = useMemo(() => (
    config.variants.find((variant) => variant.id === activeVariantId) ?? config.variants[0] ?? null
  ), [activeVariantId, config.variants]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(activeVariant?.blocks[0]?.id ?? null);
  const activeBlock = activeVariant?.blocks.find((block) => block.id === activeBlockId)
    ?? activeVariant?.blocks[0]
    ?? null;

  const updateVariants = (updater: (variants: ScraperTitleAnalysisVariantConfig[]) => ScraperTitleAnalysisVariantConfig[]) => {
    onConfigChange({
      ...config,
      variants: updater(config.variants),
    });
  };

  const updateActiveVariant = (
    updater: (variant: ScraperTitleAnalysisVariantConfig) => ScraperTitleAnalysisVariantConfig,
  ) => {
    if (!activeVariant) {
      return;
    }

    updateVariants((variants) => variants.map((variant) => (
      variant.id === activeVariant.id ? updater(variant) : variant
    )));
  };

  const updateActiveBlock = (
    updater: (block: ScraperTitleAnalysisBlockConfig) => ScraperTitleAnalysisBlockConfig,
  ) => {
    if (!activeBlock) {
      return;
    }

    updateActiveVariant((variant) => ({
      ...variant,
      blocks: variant.blocks.map((block) => (
        block.id === activeBlock.id ? updater(block) : block
      )),
    }));
  };

  const handleAddVariant = () => {
    const variant = createTitleAnalysisVariant();
    updateVariants((variants) => [...variants, variant]);
    onActiveVariantChange(variant.id);
    setActiveBlockId(variant.blocks[0]?.id ?? null);
  };

  const handleRemoveVariant = (variantId: string) => {
    updateVariants((variants) => variants.filter((variant) => variant.id !== variantId));
    if (activeVariantId === variantId) {
      const nextVariant = config.variants.find((variant) => variant.id !== variantId);
      if (nextVariant) {
        onActiveVariantChange(nextVariant.id);
      }
    }
  };

  const handleDropVariant = (targetVariantId: string) => {
    if (!draggedVariantId || draggedVariantId === targetVariantId) {
      return;
    }

    const fromIndex = config.variants.findIndex((variant) => variant.id === draggedVariantId);
    const toIndex = config.variants.findIndex((variant) => variant.id === targetVariantId);
    updateVariants((variants) => moveArrayItem(variants, fromIndex, toIndex));
    setDraggedVariantId(null);
  };

  const handleAddBlock = (kind: ScraperTitleAnalysisBlockKind) => {
    const block = createTitleAnalysisBlock(kind);
    updateActiveVariant((variant) => ({
      ...variant,
      blocks: [...variant.blocks, block],
    }));
    setActiveBlockId(block.id);
  };

  const handleRemoveBlock = (blockId: string) => {
    updateActiveVariant((variant) => ({
      ...variant,
      blocks: variant.blocks.filter((block) => block.id !== blockId),
    }));
    if (activeBlockId === blockId) {
      const nextBlock = activeVariant?.blocks.find((block) => block.id !== blockId);
      setActiveBlockId(nextBlock?.id ?? null);
    }
  };

  const handleDropBlock = (targetBlockId: string) => {
    if (!activeVariant || !draggedBlockId || draggedBlockId === targetBlockId) {
      return;
    }

    const fromIndex = activeVariant.blocks.findIndex((block) => block.id === draggedBlockId);
    const toIndex = activeVariant.blocks.findIndex((block) => block.id === targetBlockId);
    updateActiveVariant((variant) => ({
      ...variant,
      blocks: moveArrayItem(variant.blocks, fromIndex, toIndex),
    }));
    setDraggedBlockId(null);
  };

  const handleBlockKindChange = (kind: ScraperTitleAnalysisBlockKind) => {
    updateActiveBlock((block) => ({
      ...block,
      kind,
      field: kind === "suffixes" ? undefined : block.field,
      innerField: kind === "bracketWithParentheses" ? block.innerField ?? "authors" : undefined,
    }));
  };

  return (
    <div className="title-analysis-layout">
      <div className="title-analysis-variants">
        <div className="title-analysis-variants__header">
          <strong>Variantes</strong>
          <button type="button" className="secondary" onClick={handleAddVariant} disabled={disabled}>
            Ajouter
          </button>
        </div>

        <div className="title-analysis-variants__list">
          {config.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              draggable={!disabled}
              className={[
                "title-analysis-variant-row",
                activeVariant?.id === variant.id ? "is-active" : "",
                !variant.enabled ? "is-disabled" : "",
              ].join(" ").trim()}
              onClick={() => {
                onActiveVariantChange(variant.id);
                setActiveBlockId(variant.blocks[0]?.id ?? null);
              }}
              onDragStart={() => setDraggedVariantId(variant.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropVariant(variant.id)}
              disabled={disabled}
            >
              <span>{variant.name}</span>
              <small>{variant.blocks.filter((block) => block.enabled).length} bloc(s)</small>
            </button>
          ))}
        </div>
      </div>

      {activeVariant ? (
        <div className="title-analysis-editor">
          <div className="title-analysis-editor__header">
            <label>
              <span>Nom de la variante</span>
              <input
                type="text"
                value={activeVariant.name}
                onChange={(event) => updateActiveVariant((variant) => ({
                  ...variant,
                  name: event.target.value,
                }))}
                disabled={disabled}
              />
            </label>
            <label className="title-analysis-toggle">
              <input
                type="checkbox"
                checked={activeVariant.enabled}
                onChange={(event) => updateActiveVariant((variant) => ({
                  ...variant,
                  enabled: event.target.checked,
                }))}
                disabled={disabled}
              />
              <span>Active</span>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => handleRemoveVariant(activeVariant.id)}
              disabled={disabled || config.variants.length <= 1}
            >
              Supprimer
            </button>
          </div>

          <div className="title-analysis-phrase">
            {activeVariant.blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                draggable={!disabled}
                className={[
                  "title-analysis-block",
                  activeBlock?.id === block.id ? "is-active" : "",
                  !block.enabled ? "is-disabled" : "",
                ].join(" ").trim()}
                onClick={() => setActiveBlockId(block.id)}
                onDragStart={() => setDraggedBlockId(block.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDropBlock(block.id)}
                disabled={disabled}
              >
                {getBlockLabel(block)}
              </button>
            ))}
          </div>

          <div className="title-analysis-palette">
            {TITLE_ANALYSIS_BLOCK_KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="secondary"
                onClick={() => handleAddBlock(option.value)}
                disabled={disabled}
              >
                {option.label}
              </button>
            ))}
          </div>

          {activeBlock ? (
            <TitleAnalysisBlockSettings
              block={activeBlock}
              blockCount={activeVariant.blocks.length}
              label={getBlockLabel(activeBlock)}
              disabled={disabled}
              onUpdate={updateActiveBlock}
              onKindChange={handleBlockKindChange}
              onRemove={() => handleRemoveBlock(activeBlock.id)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
