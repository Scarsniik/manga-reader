import { useContext } from 'react';
import { RefreshContext } from '@/renderer/context/RefreshContext';

export function useRefresh() {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used within a RefreshProvider');
  return ctx;
}

export default useRefresh;
