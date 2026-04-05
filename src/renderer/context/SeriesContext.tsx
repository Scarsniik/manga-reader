import React, { createContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Series } from '@/renderer/types';
import generateId from '@/utils/id';

export type SeriesContextValue = {
  series: Series[];
  refresh: () => Promise<void>;
  // input should NOT contain id
  addSeries: (s: Omit<Series, 'id'>) => Promise<Series[]>;
  removeSeries: (id: string) => Promise<Series[]>;
  updateSeries: (s: Series) => Promise<Series[]>;
};

const SeriesContext = createContext<SeriesContextValue | undefined>(undefined);

export const SeriesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [series, setSeries] = useState<Series[]>([]);

  const load = useCallback(async () => {
    try {
      if (window.api && typeof (window.api as any).getSeries === 'function') {
        const data = await (window.api as any).getSeries();
        setSeries(data || []);
      }
    } catch (err) {
      console.error('SeriesProvider.load failed', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleSeriesUpdated = () => {
      void load();
    };

    window.addEventListener('series-updated', handleSeriesUpdated);
    return () => {
      window.removeEventListener('series-updated', handleSeriesUpdated);
    };
  }, [load]);

  const refresh = async () => load();

  const addSeries = async (s: Omit<Series, 'id'>) => {
    const toAdd: Series = { ...s, id: generateId() } as Series;
    const res = await (window.api as any).addSeries(toAdd);
    setSeries(res || []);
    return res;
  };

  const removeSeries = async (id: string) => {
    const res = await (window.api as any).removeSeries(id);
    setSeries(res || []);
    return res;
  };

  const updateSeries = async (s: Series) => {
    const res = await (window.api as any).updateSeries(s);
    setSeries(res || []);
    return res;
  };

  return (
    <SeriesContext.Provider value={{ series, refresh, addSeries, removeSeries, updateSeries }}>
      {children}
    </SeriesContext.Provider>
  );
};

export default SeriesContext;
