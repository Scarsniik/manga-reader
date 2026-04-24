import React from "react";
import { TrashCanIcon } from "@/renderer/components/icons";
import useShortcutSettings from "@/renderer/hooks/useShortcutSettings";
import {
  SHORTCUT_ACTION_GROUPS,
  SHORTCUT_BINDING_SLOT_COUNT,
  ShortcutActionId,
  formatShortcutBinding,
  getShortcutBindingFromKeyboardEvent,
  normalizeShortcutBinding,
} from "@/renderer/utils/shortcutBindings";
import "@/renderer/components/ShortcutSettings/style.scss";

type RecordingSlot = {
  actionId: ShortcutActionId;
  slotIndex: number;
};

const isSameRecordingSlot = (
  recordingSlot: RecordingSlot | null,
  actionId: ShortcutActionId,
  slotIndex: number,
) => (
  recordingSlot?.actionId === actionId && recordingSlot.slotIndex === slotIndex
);

export default function ShortcutSettingsPanel() {
  const {
    shortcuts,
    loading,
    error,
    resetShortcutBindings,
    updateShortcutBindingSlot,
  } = useShortcutSettings();
  const [recordingSlot, setRecordingSlot] = React.useState<RecordingSlot | null>(null);
  const duplicateBindings = React.useMemo(() => {
    const bindingCounts = new Map<string, number>();

    Object.values(shortcuts).forEach((slots) => {
      slots.forEach((slot) => {
        const binding = normalizeShortcutBinding(slot);
        if (!binding) {
          return;
        }

        bindingCounts.set(binding, (bindingCounts.get(binding) ?? 0) + 1);
      });
    });

    return new Set(
      Array.from(bindingCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([binding]) => binding),
    );
  }, [shortcuts]);

  React.useEffect(() => {
    if (!recordingSlot) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.repeat) {
        return;
      }

      if (event.key === "Escape") {
        setRecordingSlot(null);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        void updateShortcutBindingSlot(recordingSlot.actionId, recordingSlot.slotIndex, "");
        setRecordingSlot(null);
        return;
      }

      const binding = getShortcutBindingFromKeyboardEvent(event);
      if (!binding) {
        return;
      }

      void updateShortcutBindingSlot(recordingSlot.actionId, recordingSlot.slotIndex, binding);
      setRecordingSlot(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingSlot, updateShortcutBindingSlot]);

  if (loading) {
    return (
      <section className="shortcut-settings">
        <div className="shortcut-settings__placeholder">Chargement des raccourcis...</div>
      </section>
    );
  }

  return (
    <section className="shortcut-settings">
      <div className="shortcut-settings__header">
        <div>
          <h3>Raccourcis</h3>
          <p>Chaque action peut utiliser jusqu'a trois raccourcis.</p>
        </div>
        <button
          type="button"
          className="shortcut-settings__reset"
          onClick={() => void resetShortcutBindings()}
        >
          Réinitialiser
        </button>
      </div>

      {error ? <div className="shortcut-settings__error">{error}</div> : null}

      {SHORTCUT_ACTION_GROUPS.map((group) => (
        <div key={group.id} className="shortcut-settings__group">
          <h4>{group.label}</h4>

          <div className="shortcut-settings__rows">
            {group.actions.map((action) => (
              <div key={action.id} className="shortcut-settings__row">
                <div className="shortcut-settings__action">{action.label}</div>
                <div className="shortcut-settings__slots">
                  {Array.from({ length: SHORTCUT_BINDING_SLOT_COUNT }, (_, slotIndex) => {
                    const binding = shortcuts[action.id][slotIndex] ?? "";
                    const normalizedBinding = normalizeShortcutBinding(binding);
                    const isDuplicate = normalizedBinding
                      ? duplicateBindings.has(normalizedBinding)
                      : false;
                    const isRecording = isSameRecordingSlot(recordingSlot, action.id, slotIndex);

                    return (
                      <div key={`${action.id}-${slotIndex}`} className="shortcut-settings__slot-group">
                        <button
                          type="button"
                          className={[
                            "shortcut-settings__slot",
                            binding ? "has-binding" : "is-empty",
                            isDuplicate ? "is-duplicate" : "",
                            isRecording ? "is-recording" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => setRecordingSlot({ actionId: action.id, slotIndex })}
                          title={isDuplicate ? "Raccourci déjà utilisé ailleurs" : "Modifier ce raccourci"}
                          aria-invalid={isDuplicate}
                        >
                          {isRecording ? "Appuie sur une touche" : formatShortcutBinding(binding)}
                        </button>

                        <button
                          type="button"
                          className="shortcut-settings__slot-clear"
                          onClick={() => void updateShortcutBindingSlot(action.id, slotIndex, "")}
                          disabled={!binding || isRecording}
                          title="Vider ce raccourci"
                          aria-label={`Vider le raccourci ${slotIndex + 1} pour ${action.label}`}
                        >
                          <TrashCanIcon aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
