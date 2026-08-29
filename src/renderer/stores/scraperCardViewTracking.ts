import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_SCRAPER_VIEW_HISTORY_DWELL_SECONDS,
  DEFAULT_SCRAPER_VIEW_HISTORY_VISIBILITY_PERCENT,
  normalizeScraperViewHistorySettings,
} from "@/shared/scraper";

type ScraperCardViewTrackingState = {
  loaded: boolean;
  intersectionRatio: number;
  dwellMs: number;
};

type SettingsUpdatedEventDetail = {
  settings?: Record<string, unknown>;
};

const listeners = new Set<() => void>();

const DEFAULT_STATE: ScraperCardViewTrackingState = {
  loaded: false,
  intersectionRatio: DEFAULT_SCRAPER_VIEW_HISTORY_VISIBILITY_PERCENT / 100,
  dwellMs: DEFAULT_SCRAPER_VIEW_HISTORY_DWELL_SECONDS * 1000,
};

let state = DEFAULT_STATE;
let inFlightLoad: Promise<void> | null = null;
let hasBoundWindowEvents = false;

const emitChange = () => listeners.forEach((listener) => listener());

const applySettings = (settings: Record<string, unknown> | null | undefined) => {
  const normalized = normalizeScraperViewHistorySettings(settings);
  state = {
    loaded: true,
    intersectionRatio: normalized.scraperViewHistoryVisibilityPercent / 100,
    dwellMs: normalized.scraperViewHistoryDwellSeconds * 1000,
  };
  emitChange();
};

const loadSettings = async (force = false): Promise<void> => {
  if (!force && state.loaded) {
    return;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  inFlightLoad = (async () => {
    try {
      const api = typeof window !== "undefined" ? (window as any).api : null;
      if (!api || typeof api.getSettings !== "function") {
        applySettings({});
        return;
      }

      const settings = await api.getSettings();
      applySettings(settings && typeof settings === "object" ? settings : {});
    } catch (error) {
      console.warn("Failed to load scraper card view tracking settings", error);
      applySettings({});
    } finally {
      inFlightLoad = null;
    }
  })();

  return inFlightLoad;
};

const handleSettingsUpdated = (event: Event) => {
  const detail = event instanceof CustomEvent
    ? event.detail as SettingsUpdatedEventDetail | undefined
    : undefined;
  if (detail?.settings && typeof detail.settings === "object") {
    applySettings(detail.settings);
    return;
  }

  void loadSettings(true);
};

const bindWindowEvents = () => {
  if (hasBoundWindowEvents || typeof window === "undefined") {
    return;
  }

  window.addEventListener("settings-updated", handleSettingsUpdated as EventListener);
  hasBoundWindowEvents = true;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const subscribeDisabled = () => () => {};
const getSnapshot = () => state;
const getDisabledSnapshot = () => DEFAULT_STATE;

export const useScraperCardViewTrackingSettings = (enabled: boolean) => {
  bindWindowEvents();
  const snapshot = useSyncExternalStore(
    enabled ? subscribe : subscribeDisabled,
    enabled ? getSnapshot : getDisabledSnapshot,
    enabled ? getSnapshot : getDisabledSnapshot,
  );

  useEffect(() => {
    if (enabled) {
      void loadSettings();
    }
  }, [enabled]);

  return snapshot;
};
