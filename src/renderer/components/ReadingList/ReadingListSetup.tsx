import React, { useState } from "react";
import ReadingListSortableCard, {
  READING_LIST_ITEM_DRAG_TYPE,
  type ReadingListDropPosition,
} from "@/renderer/components/ReadingList/ReadingListSortableCard";
import type { ReadingListDropEdge } from "@/renderer/components/ReadingList/readingListOrdering";
import type { ReadingListItem, ReadingListOptions } from "@/renderer/types/readingList";

type DropTarget = ReadingListDropPosition & {
  itemId: string;
};

type Props = {
  autoSortLoading: boolean;
  items: ReadingListItem[];
  loading: boolean;
  onAutoSort: () => boolean;
  onMove: (itemId: string, offset: number) => void;
  onOpenDetails: (item: ReadingListItem) => void;
  onOptionChange: (option: keyof ReadingListOptions, checked: boolean) => void;
  onRemove: (itemId: string) => void;
  onReorder: (
    sourceItemId: string,
    targetItemId: string,
    dropEdge: ReadingListDropEdge,
  ) => void;
  onSave: () => void;
  onStart: () => void;
  options: ReadingListOptions;
  saveError: string | null;
  saved: boolean;
  saving: boolean;
};

export default function ReadingListSetup({
  autoSortLoading,
  items,
  loading,
  onAutoSort,
  onMove,
  onOpenDetails,
  onOptionChange,
  onRemove,
  onReorder,
  onSave,
  onStart,
  options,
  saveError,
  saved,
  saving,
}: Props) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [orderAnnouncement, setOrderAnnouncement] = useState("");

  const clearDragState = () => {
    setDraggedItemId(null);
    setDropTarget(null);
  };

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

      <div className="reading-list-order-toolbar">
        <p>Faites glisser les mangas pour ajuster l&apos;ordre, ou laissez les titres guider le tri.</p>
        <button
          type="button"
          className="reading-list-secondary-action"
          disabled={items.length < 2 || autoSortLoading}
          onClick={() => {
            const orderChanged = onAutoSort();
            setOrderAnnouncement(orderChanged
              ? "Tri automatique appliqué à la liste."
              : "La liste est déjà dans l'ordre détecté.");
          }}
        >
          {autoSortLoading ? "Analyse des titres..." : "Tri automatique"}
        </button>
      </div>

      <p className="reading-list-order-announcement" aria-live="polite">{orderAnnouncement}</p>

      <ol
        className="reading-list-grid is-sortable"
        aria-label="Mangas à lire dans l'ordre"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(READING_LIST_ITEM_DRAG_TYPE)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDropTarget(null);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(READING_LIST_ITEM_DRAG_TYPE)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          clearDragState();
        }}
      >
        {items.map((item, index) => (
          <ReadingListSortableCard
            key={item.id}
            item={item}
            index={index}
            isDragging={draggedItemId === item.id}
            dropPosition={dropTarget?.itemId === item.id ? dropTarget : null}
            totalItems={items.length}
            onDragStart={(itemId) => {
              setDraggedItemId(itemId);
              setDropTarget(null);
            }}
            onDragLeave={(itemId) => {
              setDropTarget((currentTarget) => (
                currentTarget?.itemId === itemId ? null : currentTarget
              ));
            }}
            onDragOver={(itemId, position) => {
              if (!draggedItemId || draggedItemId === itemId) {
                setDropTarget(null);
                return;
              }

              setDropTarget((currentTarget) => (
                currentTarget?.itemId === itemId
                && currentTarget.axis === position.axis
                && currentTarget.edge === position.edge
                  ? currentTarget
                  : { ...position, itemId }
              ));
            }}
            onDrop={(itemId, position) => {
              if (draggedItemId && draggedItemId !== itemId) {
                const sourceIndex = items.findIndex(({ id }) => id === draggedItemId);
                const targetIndex = items.findIndex(({ id }) => id === itemId);
                const movedItem = items[sourceIndex];
                if (movedItem && targetIndex >= 0) {
                  const targetIndexWithoutSource = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
                  const destinationIndex = targetIndexWithoutSource + (position.edge === "after" ? 1 : 0);
                  onReorder(draggedItemId, itemId, position.edge);
                  setOrderAnnouncement(
                    `${movedItem.metadata.title} déplacé en position ${destinationIndex + 1}.`,
                  );
                }
              }
              clearDragState();
            }}
            onDragEnd={clearDragState}
            onMove={(itemId, offset) => {
              const sourceIndex = items.findIndex(({ id }) => id === itemId);
              const destinationIndex = sourceIndex + offset;
              const movedItem = items[sourceIndex];
              if (!movedItem || destinationIndex < 0 || destinationIndex >= items.length) {
                setOrderAnnouncement("Ce manga est déjà à la limite de la liste.");
                return;
              }

              onMove(itemId, offset);
              setOrderAnnouncement(
                `${movedItem.metadata.title} déplacé en position ${destinationIndex + 1}.`,
              );
            }}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
          />
        ))}
      </ol>
    </section>
  );
}
