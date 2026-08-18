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
  onAppendPages: (pageCount: number) => void;
};

const normalizePageCount = (value: string): number => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsedValue));
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
  onAppendPages,
}: Props) {
  const inputId = useId();
  const [pageCount, setPageCount] = useState(String(Math.max(1, Math.floor(initialCount))));

  useEffect(() => {
    setPageCount(String(Math.max(1, Math.floor(initialCount))));
  }, [initialCount]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || disabled) {
      return;
    }

    const normalizedPageCount = normalizePageCount(pageCount);
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
        min={1}
        step={1}
        inputMode="numeric"
        value={pageCount}
        onChange={(event) => setPageCount(event.target.value)}
        onBlur={() => setPageCount(String(normalizePageCount(pageCount)))}
        disabled={loading}
        aria-label={inputAriaLabel}
      />
      <span className="scraper-page-append__unit" aria-hidden="true">
        {normalizePageCount(pageCount) > 1 ? unitPlural : unitSingular}
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
