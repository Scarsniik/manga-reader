import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SHORTCUT_BINDINGS,
  ShortcutActionId,
  ShortcutBindingsByAction,
  normalizeShortcutSettings,
  setShortcutBindingSlot,
} from "@/renderer/utils/shortcutBindings";

declare global {
  interface Window {
    api: any;
  }
}

type ShortcutSettingsContextValue = {
  shortcuts: ShortcutBindingsByAction;
  loading: boolean;
  error: string | null;
  reloadShortcutSettings: () => Promise<void>;
  resetShortcutBindings: () => Promise<void>;
  updateShortcutBindingSlot: (
    actionId: ShortcutActionId,
    slotIndex: number,
    binding: string,
  ) => Promise<void>;
};

export const ShortcutSettingsContext = createContext<ShortcutSettingsContextValue | undefined>(undefined);

const readShortcutSettings = async (): Promise<ShortcutBindingsByAction> => {
  if (!window.api || typeof window.api.getSettings !== "function") {
    return normalizeShortcutSettings({});
  }

  const settings = await window.api.getSettings();
  return normalizeShortcutSettings(settings);
};

const areShortcutBindingsEqual = (
  left: ShortcutBindingsByAction,
  right: ShortcutBindingsByAction,
): boolean => (
  Object.entries(left).every(([actionId, leftSlots]) => {
    const rightSlots = right[actionId as ShortcutActionId];
    return leftSlots.length === rightSlots.length
      && leftSlots.every((slot, index) => slot === rightSlots[index]);
  })
);

export function ShortcutSettingsProvider({ children }: { children: React.ReactNode }) {
  const [shortcuts, setShortcuts] = useState<ShortcutBindingsByAction>(DEFAULT_SHORTCUT_BINDINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedShortcutsRef = React.useRef(false);

  const reloadShortcutSettings = useCallback(async () => {
    if (!hasLoadedShortcutsRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      setShortcuts(await readShortcutSettings());
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Impossible de charger les raccourcis.");
      setShortcuts(normalizeShortcutSettings({}));
    } finally {
      hasLoadedShortcutsRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadShortcutSettings();
  }, [reloadShortcutSettings]);

  useEffect(() => {
    const onSettingsUpdated = () => {
      void reloadShortcutSettings();
    };

    window.addEventListener("settings-updated", onSettingsUpdated as EventListener);
    return () => window.removeEventListener("settings-updated", onSettingsUpdated as EventListener);
  }, [reloadShortcutSettings]);

  const saveShortcuts = useCallback(async (nextShortcuts: ShortcutBindingsByAction) => {
    setShortcuts(nextShortcuts);
    setError(null);

    try {
      if (window.api && typeof window.api.saveSettings === "function") {
        const settings = await window.api.saveSettings({ shortcuts: nextShortcuts });
        const persistedShortcuts = normalizeShortcutSettings(settings);
        if (!areShortcutBindingsEqual(nextShortcuts, persistedShortcuts)) {
          setShortcuts(persistedShortcuts);
        }
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer les raccourcis.");
      setShortcuts(await readShortcutSettings());
    }
  }, []);

  const updateShortcutBindingSlot = useCallback(async (
    actionId: ShortcutActionId,
    slotIndex: number,
    binding: string,
  ) => {
    await saveShortcuts(setShortcutBindingSlot(shortcuts, actionId, slotIndex, binding));
  }, [saveShortcuts, shortcuts]);

  const resetShortcutBindings = useCallback(async () => {
    await saveShortcuts(DEFAULT_SHORTCUT_BINDINGS);
  }, [saveShortcuts]);

  const value = useMemo<ShortcutSettingsContextValue>(() => ({
    shortcuts,
    loading,
    error,
    reloadShortcutSettings,
    resetShortcutBindings,
    updateShortcutBindingSlot,
  }), [
    error,
    loading,
    reloadShortcutSettings,
    resetShortcutBindings,
    shortcuts,
    updateShortcutBindingSlot,
  ]);

  return (
    <ShortcutSettingsContext.Provider value={value}>
      {children}
    </ShortcutSettingsContext.Provider>
  );
}
