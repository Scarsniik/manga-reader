import React, { createContext, useCallback, useState, ReactNode, useEffect } from 'react';

type RefreshContextValue = {
  refresh: () => void;
  refreshKey: string;
};

export const RefreshContext = createContext<RefreshContextValue | undefined>(undefined);

export const RefreshProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState(() => String(Date.now()));

  const refresh = useCallback(() => {
    // change the key so the consumer tree remounts
    setRefreshKey(String(Date.now()));
  }, []);

  useEffect(() => {
    const handler = () => setRefreshKey(String(Date.now()));
    window.addEventListener('settings-updated', handler as EventListener);
    return () => window.removeEventListener('settings-updated', handler as EventListener);
  }, []);

  return (
    <RefreshContext.Provider value={{ refresh, refreshKey }}>
        {children}
    </RefreshContext.Provider>
  );
};

