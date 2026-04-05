import React, { FormEvent } from 'react';
import { ScraperBrowseMode } from '@/renderer/components/ScraperBrowser/types';

type Props = {
  availableModes: ScraperBrowseMode[];
  mode: ScraperBrowseMode;
  query: string;
  activePlaceholder: string;
  helperText: string;
  loading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onModeChange: (mode: ScraperBrowseMode) => void;
  onQueryChange: (value: string) => void;
};

export default function ScraperBrowserToolbar({
  availableModes,
  mode,
  query,
  activePlaceholder,
  helperText,
  loading,
  onSubmit,
  onModeChange,
  onQueryChange,
}: Props) {
  return (
    <div className="scraper-browser__panel">
      <form className="scraper-browser__toolbar" onSubmit={onSubmit}>
        {availableModes.length > 1 ? (
          <select
            className="scraper-browser__mode-select"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as ScraperBrowseMode)}
          >
            <option value="search">Recherche</option>
            <option value="manga">Manga</option>
          </select>
        ) : null}

        <input
          className="scraper-browser__query"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={activePlaceholder}
        />

        <button type="submit" className="scraper-browser__submit" disabled={loading}>
          {loading ? 'Chargement...' : mode === 'manga' ? 'Ouvrir' : 'Lancer'}
        </button>
      </form>

      <div className="scraper-browser__helper">
        {helperText}
      </div>
    </div>
  );
}
