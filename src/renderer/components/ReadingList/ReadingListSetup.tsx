import React from "react";
import ReadingListCard from "@/renderer/components/ReadingList/ReadingListCard";
import type { ReadingListItem, ReadingListOptions } from "@/renderer/types/readingList";

type Props = {
  items: ReadingListItem[];
  loading: boolean;
  onOpenDetails: (item: ReadingListItem) => void;
  onOptionChange: (option: keyof ReadingListOptions, checked: boolean) => void;
  onRemove: (itemId: string) => void;
  onSave: () => void;
  onStart: () => void;
  options: ReadingListOptions;
  saveError: string | null;
  saved: boolean;
  saving: boolean;
};

export default function ReadingListSetup({
  items,
  loading,
  onOpenDetails,
  onOptionChange,
  onRemove,
  onSave,
  onStart,
  options,
  saveError,
  saved,
  saving,
}: Props) {
  return (
    <section className="reading-list-view">
      <header className="reading-list-view__header">
        <span className="reading-list-view__eyebrow">Préparation</span>
        <h2>Liste de lecture</h2>
        <p>{items.length} manga(s), dans l&apos;ordre de la liste.</p>
      </header>

      <div className="reading-list-launch-panel">
        <div className="reading-list-options" aria-label="Options de lecture">
          <label>
            <input
              type="checkbox"
              checked={options.randomOrder}
              onChange={(event) => onOptionChange("randomOrder", event.target.checked)}
            />
            <span>Lecture aléatoire</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.removeBookmarkAfterReading}
              onChange={(event) => onOptionChange("removeBookmarkAfterReading", event.target.checked)}
            />
            <span>Retirer le bookmark après lecture</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.resumeProgress}
              onChange={(event) => onOptionChange("resumeProgress", event.target.checked)}
            />
            <span>Reprendre depuis la progression</span>
          </label>
        </div>

        <div className="reading-list-launch-actions">
          <button
            type="button"
            className="reading-list-secondary-action"
            disabled={items.length === 0 || saving || saved}
            onClick={onSave}
          >
            {saving ? "Enregistrement..." : saved ? "Liste enregistrée" : "Enregistrer la liste"}
          </button>
          <button
            type="button"
            className="reading-list-primary-action"
            disabled={items.length === 0 || loading}
            onClick={onStart}
          >
            {loading ? "Préparation..." : "Lancer la lecture"}
          </button>
          {saveError ? <p className="reading-list-save-error" role="alert">{saveError}</p> : null}
        </div>
      </div>

      <div className="reading-list-grid">
        {items.map((item, index) => (
          <ReadingListCard
            key={item.id}
            item={item}
            index={index}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  );
}
