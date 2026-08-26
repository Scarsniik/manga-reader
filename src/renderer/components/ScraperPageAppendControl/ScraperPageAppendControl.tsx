import React, {
  FormEvent,
  useEffect,
  useId,
  useState,
} from "react";
import {
  LoadingSpinnerIcon,
  PlusSignIcon,
} from "@/renderer/components/icons";
import "@/renderer/components/ScraperPageAppendControl/style.scss";

type Props = {
  loading: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  initialCount?: number;
  label?: string;
  unitSingular?: string;
  unitPlural?: string;
  formAriaLabel?: string;
  inputAriaLabel?: string;
  submitLabel?: string;
  loadingLabel?: string;
  submitTitle?: string;
  submitIcon?: React.ReactNode;
  allowZero?: boolean;
  zeroUnitLabel?: string;
  onAppendPages: (pageCount: number) => void;
};

const normalizePageCount = (value: string, allowZero: boolean): number => {
  if (!value.trim()) return 1;
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return allowZero ? 0 : 1;
  }

  return Math.max(allowZero ? 0 : 1, Math.floor(parsedValue));
};

export default function ScraperPageAppendControl({
  loading,
  disabled = false,
  disabledTitle,
  initialCount = 1,
  label = "Ajouter",
  unitSingular = "page",
  unitPlural = "pages",
  formAriaLabel = "Ajouter des pages aux résultats affichés",
  inputAriaLabel = "Nombre de pages à scraper",
  submitLabel = "Scraper et ajouter",
  loadingLabel = "Scraping...",
  submitTitle = "Scraper et ajouter ces pages à la vue actuelle",
  submitIcon,
  allowZero = false,
  zeroUnitLabel,
  onAppendPages,
}: Props) {
  const inputId = useId();
  const [pageCount, setPageCount] = useState(String(normalizePageCount(
    String(initialCount),
    allowZero,
  )));

  useEffect(() => {
    setPageCount(String(normalizePageCount(String(initialCount), allowZero)));
  }, [allowZero, initialCount]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || disabled) {
      return;
    }

    const normalizedPageCount = normalizePageCount(pageCount, allowZero);
    setPageCount(String(normalizedPageCount));
    onAppendPages(normalizedPageCount);
  };

  return (
    <form
      className="scraper-page-append"
      onSubmit={handleSubmit}
      aria-label={formAriaLabel}
    >
      <label htmlFor={inputId} className="scraper-page-append__label">
        {label}
      </label>
      <input
        id={inputId}
        className="scraper-page-append__input"
        type="number"
        min={allowZero ? 0 : 1}
        step={1}
        inputMode="numeric"
        value={pageCount}
        onChange={(event) => setPageCount(event.target.value)}
        onBlur={() => setPageCount(String(normalizePageCount(pageCount, allowZero)))}
        disabled={loading}
        aria-label={inputAriaLabel}
      />
      <span className="scraper-page-append__unit" aria-hidden="true">
        {normalizePageCount(pageCount, allowZero) === 0 && zeroUnitLabel
          ? zeroUnitLabel
          : normalizePageCount(pageCount, allowZero) > 1 ? unitPlural : unitSingular}
      </span>
      <button
        type="submit"
        className="scraper-page-append__submit"
        disabled={loading || disabled}
        title={disabled
          ? disabledTitle ?? "Aucune page suivante disponible"
          : submitTitle}
      >
        {loading ? (
          <LoadingSpinnerIcon
            className="scraper-page-append__spinner"
            aria-hidden="true"
            focusable="false"
          />
        ) : submitIcon ? (
          submitIcon
        ) : (
          <PlusSignIcon aria-hidden="true" focusable="false" />
        )}
        <span>{loading ? loadingLabel : submitLabel}</span>
      </button>
    </form>
  );
}
