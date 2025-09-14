import { useContext } from 'react';
import SeriesContext from '@/renderer/context/SeriesContext';

export function useSeries() {
  const ctx = useContext(SeriesContext);
  if (!ctx) throw new Error('useSeries must be used within a SeriesProvider');
  return ctx;
}

export default useSeries;
