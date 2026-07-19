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
  backgroundEnabled?: boolean;
  backgroundOptionAvailable?: boolean;
  backgroundAttached?: boolean;
  savedSearchesList?: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSaveSearch?: () => void;
  onModeChange: (mode: ScraperBrowseMode) => void;
  onQueryChange: (value: string) => void;
  onBackgroundEnabledChange?: (value: boolean) => void;
};

export default function ScraperBrowserToolbar({
  availableModes,
  mode,
  query,
  activePlaceholder,
  helperText,
  loading,
  canSaveSearch = false,
  backgroundEnabled = false,
  backgroundOptionAvailable = false,
  backgroundAttached = false,
  savedSearchesList = null,
  onSubmit,
  onSaveSearch,
  onModeChange,
  onQueryChange,
  onBackgroundEnabledChange,
}: Props) {
  const modeLabels: Record<ScraperBrowseMode, string> = {
    homepage: 'Homepage',
    search: 'Recherche',
    manga: 'Manga',
    author: 'Auteur',
    tag: 'Tag',
    tagList: 'Tags',
  };
  const isHomepageMode = mode === 'homepage';
  const isTagListMode = mode === 'tagList';

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
          value={isHomepageMode ? '' : query}
          onChange={(event) => {
            if (!isHomepageMode) {
              onQueryChange(event.target.value);
            }
          }}
          placeholder={activePlaceholder}
          disabled={isHomepageMode}
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

        <button type="submit" className="scraper-browser__submit" disabled={loading || backgroundAttached}>
          {backgroundAttached ? 'Attaché' : loading ? 'Chargement...' : mode === 'manga' ? 'Ouvrir' : isHomepageMode ? 'Charger' : isTagListMode ? 'Filtrer' : 'Lancer'}
        </button>
      </form>

      {backgroundOptionAvailable ? (
        <label className="background-search-toggle">
          <input
            type="checkbox"
            checked={backgroundEnabled}
            disabled={backgroundAttached}
            onChange={(event) => onBackgroundEnabledChange?.(event.target.checked)}
          />
          <span>
            <strong>En arrière-plan</strong>
            <small>{backgroundAttached ? "Rattaché à la recherche en cours" : "La page auteur continue à se charger en changeant de vue"}</small>
          </span>
        </label>
      ) : null}

      {savedSearchesList}
      {helperText &&
        <div className="scraper-browser__helper">
          {helperText}
        </div>
      }
    </div>
  );
}
