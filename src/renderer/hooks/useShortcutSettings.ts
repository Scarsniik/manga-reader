import { useContext } from "react";
import { ShortcutSettingsContext } from "@/renderer/context/ShortcutSettingsContext";

export default function useShortcutSettings() {
  const context = useContext(ShortcutSettingsContext);
  if (!context) {
    throw new Error("useShortcutSettings must be used within a ShortcutSettingsProvider");
  }

  return context;
}
