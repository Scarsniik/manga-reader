import React, { FormEvent, useId, useState } from "react";
import {
  LoadingSpinnerIcon,
  PlusSignIcon,
} from "@/renderer/components/icons";
import "@/renderer/components/ScraperPageAppendControl/style.scss";

type Props = {
  loading: boolean;
  disabled?: boolean;
  disabledTitle?: string;
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
  onAppendPages,
}: Props) {
  const inputId = useId();
  const [pageCount, setPageCount] = useState("1");

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
      aria-label="Ajouter des pages aux resultats affiches"
    >
      <label htmlFor={inputId} className="scraper-page-append__label">
        Ajouter
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
        aria-label="Nombre de pages a scraper"
      />
      <span className="scraper-page-append__unit" aria-hidden="true">
        {normalizePageCount(pageCount) > 1 ? "pages" : "page"}
      </span>
      <button
        type="submit"
        className="scraper-page-append__submit"
        disabled={loading || disabled}
        title={disabled
          ? disabledTitle ?? "Aucune page suivante disponible"
          : "Scraper et ajouter ces pages a la vue actuelle"}
      >
        {loading ? (
          <LoadingSpinnerIcon
            className="scraper-page-append__spinner"
            aria-hidden="true"
            focusable="false"
          />
        ) : (
          <PlusSignIcon aria-hidden="true" focusable="false" />
        )}
        <span>{loading ? "Scraping..." : "Scraper et ajouter"}</span>
      </button>
    </form>
  );
}
