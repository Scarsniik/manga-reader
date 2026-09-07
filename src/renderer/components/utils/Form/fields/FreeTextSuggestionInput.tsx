import React from "react";
import AdaptiveDropdown from "@/renderer/components/AdaptiveDropdown/AdaptiveDropdown";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import "@/renderer/components/utils/Form/fields/FreeTextSuggestionInput.scss";

type Props = {
  id?: string;
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
};

const MAX_VISIBLE_OPTIONS = 8;

export default function FreeTextSuggestionInput({
  id,
  label,
  value,
  options,
  placeholder,
  autoFocus = false,
  onChange,
}: Props) {
  const generatedId = React.useId();
  const inputId = id ?? `free-text-suggestion-${generatedId}`;
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const visibleOptions = React.useMemo(() => {
    const query = normalizeFuzzyText(value);
    const uniqueOptions = Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)));
    return uniqueOptions
      .filter((option) => !query || normalizeFuzzyText(option).includes(query))
      .slice(0, MAX_VISIBLE_OPTIONS);
  }, [options, value]);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  const selectOption = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <AdaptiveDropdown
      className="free-text-suggestion-input"
      contentClassName="free-text-suggestion-input__options"
      contentRole="listbox"
      gap={4}
      matchTriggerWidth
      maxHeight={240}
      open={open && visibleOptions.length > 0}
      onOpenChange={setOpen}
      portal
      portalZIndex={10050}
      renderTrigger={({ contentId, isOpen, setTriggerRef }) => (
        <>
          <label htmlFor={inputId}>{label}</label>
          <input
            ref={setTriggerRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={contentId}
            aria-expanded={isOpen}
            aria-activedescendant={activeIndex >= 0 ? `${contentId}-${activeIndex}` : undefined}
            autoFocus={autoFocus}
            value={value}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && visibleOptions.length) {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => (current + 1) % visibleOptions.length);
              } else if (event.key === "ArrowUp" && visibleOptions.length) {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => (
                  current <= 0 ? visibleOptions.length - 1 : current - 1
                ));
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                selectOption(visibleOptions[activeIndex]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </>
      )}
    >
      {({ contentId }) => (
        <>
          {visibleOptions.map((option, index) => (
            <button
              id={`${contentId}-${index}`}
              key={option}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              {option}
            </button>
          ))}
        </>
      )}
    </AdaptiveDropdown>
  );
}
