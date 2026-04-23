import React, { createContext, useContext, useMemo } from 'react';
import type { ScraperRecord } from '@/shared/scraper';

type ScraperConfigContextValue = {
  scraper: ScraperRecord;
  updateScraper: (scraper: ScraperRecord) => void;
};

type ScraperConfigProviderProps = {
  scraper: ScraperRecord;
  onScraperChange: (scraper: ScraperRecord) => void;
  children: React.ReactNode;
};

const ScraperConfigContext = createContext<ScraperConfigContextValue | null>(null);

export function ScraperConfigProvider({
  scraper,
  onScraperChange,
  children,
}: ScraperConfigProviderProps) {
  const value = useMemo(() => ({
    scraper,
    updateScraper: onScraperChange,
  }), [onScraperChange, scraper]);

  return (
    <ScraperConfigContext.Provider value={value}>
      {children}
    </ScraperConfigContext.Provider>
  );
}

export function useScraperConfig() {
  const context = useContext(ScraperConfigContext);

  if (!context) {
    throw new Error('useScraperConfig must be used within ScraperConfigProvider.');
  }

  return context;
}
