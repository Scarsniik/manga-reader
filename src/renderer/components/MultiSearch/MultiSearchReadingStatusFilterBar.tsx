import React from "react";
import {
  MULTI_SEARCH_READING_STATUS_LABELS,
} from "@/renderer/components/MultiSearch/multiSearchReadingStatusFilters";
import type {
  MultiSearchReadingStatusFilter,
} from "@/renderer/components/MultiSearch/types";

type Props = {
  selectedStatuses: MultiSearchReadingStatusFilter[];
  onToggleStatus: (status: MultiSearchReadingStatusFilter) => void;
};

const READING_STATUS_OPTIONS: MultiSearchReadingStatusFilter[] = [
  "unread",
  "inProgress",
  "read",
];

export default function MultiSearchReadingStatusFilterBar({
  selectedStatuses,
  onToggleStatus,
}: Props) {
  return (
    <div className="multi-search__reading-filter-bar" aria-label="Filtre d'etat de lecture">
      {READING_STATUS_OPTIONS.map((status) => {
        const isSelected = selectedStatuses.includes(status);

        return (
          <button
            key={status}
            type="button"
            className={[
              "multi-search__reading-filter-button",
              `is-${status}`,
              isSelected ? "is-selected" : "",
            ].join(" ")}
            onClick={() => onToggleStatus(status)}
            aria-pressed={isSelected}
          >
            {MULTI_SEARCH_READING_STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}
