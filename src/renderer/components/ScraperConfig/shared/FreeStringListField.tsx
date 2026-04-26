import React, { useMemo, useState } from "react";

type FreeStringListOption = {
  label: string;
  value: string;
};

type Props = {
  id: string;
  label: string;
  value: string[];
  placeholder?: string;
  options?: FreeStringListOption[];
  onChange: (value: string[]) => void;
};

const normalizeText = (value: string): string => (
  value.trim().replace(/\s+/g, " ")
);

const normalizeKey = (value: string): string => (
  normalizeText(value).toLowerCase()
);

export default function FreeStringListField({
  id,
  label,
  value,
  placeholder,
  options = [],
  onChange,
}: Props) {
  const [inputValue, setInputValue] = useState("");
  const selectedKeys = useMemo(
    () => new Set(value.map((entry) => normalizeKey(entry))),
    [value],
  );
  const optionByKey = useMemo(
    () => new Map(options.flatMap((option) => [
      [normalizeKey(option.value), option],
      [normalizeKey(option.label), option],
    ])),
    [options],
  );
  const visibleOptions = useMemo(() => {
    const query = normalizeKey(inputValue);

    return options
      .filter((option) => !selectedKeys.has(normalizeKey(option.value)))
      .filter((option) => {
        if (!query) {
          return true;
        }

        return normalizeKey(option.label).includes(query)
          || normalizeKey(option.value).includes(query);
      })
      .slice(0, 8);
  }, [inputValue, options, selectedKeys]);

  const getDisplayValue = (entry: string): string => (
    optionByKey.get(normalizeKey(entry))?.label ?? entry
  );

  const commitValue = (rawValue: string) => {
    const normalizedValue = normalizeText(rawValue);
    if (!normalizedValue) {
      return;
    }

    const option = optionByKey.get(normalizeKey(normalizedValue));
    const nextValue = option?.value ?? normalizedValue;
    const nextKey = normalizeKey(nextValue);

    if (selectedKeys.has(nextKey)) {
      setInputValue("");
      return;
    }

    onChange([...value, nextValue]);
    setInputValue("");
  };

  const removeValue = (entry: string) => {
    const removedKey = normalizeKey(entry);
    onChange(value.filter((candidate) => normalizeKey(candidate) !== removedKey));
  };

  return (
    <div className="scraper-free-list-field">
      <label htmlFor={id}>{label}</label>

      <div className="scraper-free-list-field__input-row">
        <input
          id={id}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== ",") {
              return;
            }

            event.preventDefault();
            commitValue(inputValue);
          }}
        />
        <button
          type="button"
          className="secondary"
          onClick={() => commitValue(inputValue)}
          disabled={!normalizeText(inputValue)}
        >
          Ajouter
        </button>
      </div>

      {visibleOptions.length ? (
        <div className="scraper-free-list-field__suggestions" aria-label={`${label} suggestions`}>
          {visibleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="secondary"
              onClick={() => commitValue(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="scraper-free-list-field__chips">
        {value.length ? value.map((entry) => (
          <span key={entry} className="scraper-free-list-field__chip">
            {getDisplayValue(entry)}
            <button
              type="button"
              onClick={() => removeValue(entry)}
              aria-label={`Retirer ${getDisplayValue(entry)}`}
            >
              x
            </button>
          </span>
        )) : (
          <span className="scraper-free-list-field__empty">Aucune valeur renseignee</span>
        )}
      </div>
    </div>
  );
}
