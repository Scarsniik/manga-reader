import React from "react";
import ReadingListCard from "@/renderer/components/ReadingList/ReadingListCard";
import type { ReadingListDropEdge } from "@/renderer/components/ReadingList/readingListOrdering";
import type { ReadingListItem } from "@/renderer/types/readingList";

export const READING_LIST_ITEM_DRAG_TYPE = "application/x-scaramanga-reading-list-item";

export type ReadingListDropPosition = {
  axis: "horizontal" | "vertical";
  edge: ReadingListDropEdge;
};

type Props = {
  dropPosition: ReadingListDropPosition | null;
  index: number;
  isDragging: boolean;
  item: ReadingListItem;
  onDragEnd: () => void;
  onDragLeave: (itemId: string) => void;
  onDragOver: (itemId: string, dropPosition: ReadingListDropPosition) => void;
  onDragStart: (itemId: string) => void;
  onDrop: (itemId: string, dropPosition: ReadingListDropPosition) => void;
  onMove: (itemId: string, offset: number) => void;
  onOpenDetails: (item: ReadingListItem) => void;
  onRemove: (itemId: string) => void;
  totalItems: number;
};

const getDropPosition = (
  event: React.DragEvent<HTMLLIElement>,
): ReadingListDropPosition => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const gridStyles = event.currentTarget.parentElement
    ? window.getComputedStyle(event.currentTarget.parentElement)
    : null;
  const columnCount = gridStyles?.gridTemplateColumns
    .split(/\s+/)
    .filter(Boolean)
    .length ?? 1;
  const axis = columnCount > 1 ? "horizontal" : "vertical";
  const pointerPosition = axis === "horizontal" ? event.clientX : event.clientY;
  const midpoint = axis === "horizontal"
    ? bounds.left + (bounds.width / 2)
    : bounds.top + (bounds.height / 2);

  return {
    axis,
    edge: pointerPosition < midpoint ? "before" : "after",
  };
};

export default function ReadingListSortableCard({
  dropPosition,
  index,
  isDragging,
  item,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onMove,
  onOpenDetails,
  onRemove,
  totalItems,
}: Props) {
  return (
    <li
      className={[
        "reading-list-sortable-card",
        isDragging ? "is-dragging" : "",
        dropPosition ? `is-drop-${dropPosition.axis}` : "",
        dropPosition ? `is-drop-${dropPosition.edge}` : "",
      ].filter(Boolean).join(" ")}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onDragOver(item.id, getDropPosition(event));
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
          return;
        }

        onDragLeave(item.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop(item.id, getDropPosition(event));
      }}
    >
      <ReadingListCard
        item={item}
        index={index}
        onOpenDetails={onOpenDetails}
        onRemove={onRemove}
      />
      <button
        type="button"
        className="reading-list-sortable-card__handle"
        draggable
        aria-label={`Déplacer ${item.metadata.title}, position ${index + 1} sur ${totalItems}`}
        title="Faire glisser pour déplacer. Utilisez les flèches pour un déplacement au clavier."
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.id);
          event.dataTransfer.setData(READING_LIST_ITEM_DRAG_TYPE, item.id);
          onDragStart(item.id);
        }}
        onDragEnd={(event) => {
          event.stopPropagation();
          onDragEnd();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            onMove(item.id, -1);
          } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            onMove(item.id, 1);
          }
        }}
      >
        <span aria-hidden="true">⠿</span>
      </button>
    </li>
  );
}
