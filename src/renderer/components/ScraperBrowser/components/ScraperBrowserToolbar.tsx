import React, { FormEvent } from 'react';
import { ScraperBrowseMode } from '@/renderer/components/ScraperBrowser/types';
import { PlusSignIcon } from '@/renderer/components/icons';

type Props = {
  availableModes: ScraperBrowseMode[];
  mode: ScraperBrowseMode;
  query: string;
  activePlaceholder: string;
  helperText?: string;
  loading: boolean;
  canSaveSearch?: boolean;
  savedSearchesList?: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSaveSearch?: () => void;
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
  canSaveSearch = false,
  savedSearchesList = null,
  onSubmit,
  onSaveSearch,
  onModeChange,
  onQueryChange,
}: Props) {
  const modeLabels: Record<ScraperBrowseMode, string> = {
    search: 'Recherche',
    manga: 'Manga',
    author: 'Auteur',
  };

  return (
    <div className="scraper-browser__panel">
      <form className="scraper-browser__toolbar" onSubmit={onSubmit}>
        {availableModes.length > 1 ? (
          <select
            className="scraper-browser__mode-select"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as ScraperBrowseMode)}
          >
            {availableModes.map((availableMode) => (
              <option key={availableMode} value={availableMode}>{modeLabels[availableMode]}</option>
            ))}
          </select>
        ) : null}

        <input
          className="scraper-browser__query"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={activePlaceholder}
        />

        {canSaveSearch ? (
          <button
            type="button"
            className="scraper-browser__save-search"
            onClick={onSaveSearch}
            title="Enregistrer la recherche active"
            aria-label="Enregistrer la recherche active"
          >
            <PlusSignIcon focusable="false" />
          </button>
        ) : null}

        <button type="submit" className="scraper-browser__submit" disabled={loading}>
          {loading ? 'Chargement...' : mode === 'manga' ? 'Ouvrir' : 'Lancer'}
        </button>
      </form>

      {savedSearchesList}
      {helperText &&
        <div className="scraper-browser__helper">
          {helperText}
        </div>
      }
    </div>
  );
}
