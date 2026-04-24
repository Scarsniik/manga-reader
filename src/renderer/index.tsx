import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/renderer/App';
import { ModalProvider } from '@/renderer/context/ModalContext';
import { RefreshProvider, RefreshContext } from './context/RefreshContext';
import { useContext } from 'react';
import { TagsProvider } from '@/renderer/context/TagsContext';
import { AuthorsProvider } from '@/renderer/context/AuthorsContext';
import { SeriesProvider } from '@/renderer/context/SeriesContext';
import AppUpdateGlobalUi from "@/renderer/components/AppUpdate/AppUpdateGlobalUi";
import { ShortcutSettingsProvider } from "@/renderer/context/ShortcutSettingsContext";

const RefreshKeyedApp: React.FC = () => {
  const ctx = useContext(RefreshContext);
  const key = ctx?.refreshKey ?? String(Date.now());
  return <App key={key} />;
};

const container = document.getElementById('root') as HTMLElement | null;
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <RefreshProvider>
        <TagsProvider>
          <AuthorsProvider>
            <SeriesProvider>
              <ShortcutSettingsProvider>
                <ModalProvider>
                  <AppUpdateGlobalUi />
                  <RefreshKeyedApp />
                </ModalProvider>
              </ShortcutSettingsProvider>
            </SeriesProvider>
          </AuthorsProvider>
        </TagsProvider>
      </RefreshProvider>
    </React.StrictMode>
  );
}
