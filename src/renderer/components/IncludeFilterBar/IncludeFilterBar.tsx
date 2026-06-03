import React from "react";
import {
  buildIncludeFilterExcludedValue,
  splitIncludeFilterValues,
} from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import "./style.scss";

export type IncludeFilterOption = {
  id: string;
  label: string;
};

type Props = {
  title: string;
  allLabel: string;
  allButtonLabel: string;
  noneLabel?: string;
  noneButtonLabel?: string;
  emptySelectionLabel: string;
  emptyOptionsLabel?: string;
  ariaLabel: string;
  value: string[];
  options: IncludeFilterOption[];
  onChange: (value: string[]) => void;
  allValue?: string;
  noneValue?: string;
  className?: string;
  renderOptionContent?: (option: IncludeFilterOption) => React.ReactNode;
};

const formatSelectedLabels = (labels: string[]): string => {
  if (labels.length <= 4) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 4).join(", ")} et ${labels.length - 4} autre(s)`;
};

export default function IncludeFilterBar({
  title,
  allLabel,
  allButtonLabel,
  noneLabel,
  noneButtonLabel,
  emptySelectionLabel,
  emptyOptionsLabel,
  ariaLabel,
  value,
  options,
  onChange,
  allValue,
  noneValue,
  className,
  renderOptionContent,
}: Props) {
  const usesEmptyNoneSelection = Boolean(noneButtonLabel) && !noneValue && Boolean(allValue);
  const isNoneSelected = noneValue
    ? value.includes(noneValue)
    : usesEmptyNoneSelection && value.length === 0;
  const selectableValue = React.useMemo(
    () => value.filter((entry) => entry !== allValue && entry !== noneValue),
    [allValue, noneValue, value],
  );
  const { includedValues, excludedValues } = React.useMemo(
    () => splitIncludeFilterValues(selectableValue),
    [selectableValue],
  );
  const isAllSelected = allValue
    ? value.includes(allValue)
    : !isNoneSelected && selectableValue.length === 0;
  const selectedIds = React.useMemo(() => new Set(includedValues), [includedValues]);
  const excludedIds = React.useMemo(() => new Set(excludedValues), [excludedValues]);
  const selectedOptions = React.useMemo(
    () => options.filter((option) => selectedIds.has(option.id)),
    [options, selectedIds],
  );
  const excludedOptions = React.useMemo(
    () => options.filter((option) => excludedIds.has(option.id)),
    [excludedIds, options],
  );
  const selectedLabel = React.useMemo(() => {
    if (isAllSelected) {
      return allLabel;
    }

    if (isNoneSelected) {
      return noneLabel ?? emptySelectionLabel;
    }

    if (!selectableValue.length) {
      return noneLabel ?? emptySelectionLabel;
    }

    if (!selectedOptions.length && !excludedOptions.length) {
      return emptySelectionLabel;
    }

    const selectedText = selectedOptions.length
      ? formatSelectedLabels(selectedOptions.map((option) => option.label))
      : allLabel;
    const excludedText = excludedOptions.length
      ? `sauf ${formatSelectedLabels(excludedOptions.map((option) => option.label))}`
      : "";

    return [selectedText, excludedText].filter(Boolean).join(" ");
  }, [
    allLabel,
    emptySelectionLabel,
    excludedOptions,
    isAllSelected,
    isNoneSelected,
    noneLabel,
    selectableValue.length,
    selectedOptions,
  ]);

  const toggleOption = React.useCallback((optionId: string) => {
    const nextExcludedValues = excludedValues
      .filter((currentId) => currentId !== optionId)
      .map(buildIncludeFilterExcludedValue);

    if (selectedIds.has(optionId)) {
      onChange([
        ...includedValues.filter((currentId) => currentId !== optionId),
        ...nextExcludedValues,
      ]);
      return;
    }

    onChange([
      ...includedValues,
      ...nextExcludedValues,
      optionId,
    ]);
  }, [excludedValues, includedValues, onChange, selectedIds]);

  const toggleExcludedOption = React.useCallback((
    event: React.MouseEvent<HTMLButtonElement>,
    optionId: string,
  ) => {
    event.preventDefault();

    if (excludedIds.has(optionId)) {
      onChange([
        ...includedValues,
        ...excludedValues
          .filter((currentId) => currentId !== optionId)
          .map(buildIncludeFilterExcludedValue),
      ]);
      return;
    }

    onChange([
      ...includedValues.filter((currentId) => currentId !== optionId),
      ...excludedValues.map(buildIncludeFilterExcludedValue),
      buildIncludeFilterExcludedValue(optionId),
    ]);
  }, [excludedIds, excludedValues, includedValues, onChange]);

  return (
    <div className={["include-filter-bar", className].filter(Boolean).join(" ")}>
      <div className="include-filter-bar__summary">
        <strong>{title}</strong>
        <span>{selectedLabel}</span>
      </div>
      <div className="include-filter-bar__actions" aria-label={ariaLabel}>
        {options.length ? (
          <>
            {noneButtonLabel ? (
              <button
                type="button"
                className={isNoneSelected ? "is-active" : ""}
                onClick={() => onChange(noneValue ? [noneValue] : [])}
              >
                {noneButtonLabel}
              </button>
            ) : null}
            <button
              type="button"
              className={isAllSelected ? "is-active" : ""}
              onClick={() => onChange(allValue ? [allValue] : [])}
            >
              {allButtonLabel}
            </button>
            {options.map((option) => {
              const isActive = selectedIds.has(option.id);
              const isExcluded = excludedIds.has(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  className={[
                    isActive ? "is-active" : "",
                    isExcluded ? "is-excluded" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => toggleOption(option.id)}
                  onContextMenu={(event) => toggleExcludedOption(event, option.id)}
                  aria-pressed={isActive || isExcluded}
                  title={option.label}
                >
                  {renderOptionContent
                    ? renderOptionContent(option)
                    : <span>{option.label}</span>}
                </button>
              );
            })}
          </>
        ) : (
          <span className="include-filter-bar__empty">{emptyOptionsLabel ?? emptySelectionLabel}</span>
        )}
      </div>
    </div>
  );
}
