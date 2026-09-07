import React from "react";
import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";
import "@/renderer/components/ChapterGroups/style.scss";

export type MergedChapterCardGridEntry = {
  chapter: string;
  result: MultiSearchMergedResult;
};

type Props = {
  entries: MergedChapterCardGridEntry[];
  isExcluded?: (entry: MergedChapterCardGridEntry) => boolean;
  renderLabel?: (entry: MergedChapterCardGridEntry) => React.ReactNode;
  renderActions?: (entry: MergedChapterCardGridEntry) => React.ReactNode;
  renderCard: (entry: MergedChapterCardGridEntry) => React.ReactNode;
};

export default function MergedChapterCardGrid({
  entries,
  isExcluded,
  renderLabel,
  renderActions,
  renderCard,
}: Props) {
  return (
    <div className="manga-correspondence-view__results">
      {entries.map((entry) => {
        const assigned = entry.chapter !== "Non renseigné";
        const excluded = isExcluded?.(entry) === true;
        const actions = renderActions?.(entry);
        return (
          <div
            key={entry.result.id}
            className={[
              "manga-correspondence-view__result",
              excluded ? "is-reading-list-excluded" : "",
            ].filter(Boolean).join(" ")}
          >
            <div
              className={[
                "manga-correspondence-view__list-preparation",
                assigned ? "" : "is-unassigned",
              ].filter(Boolean).join(" ")}
            >
              <span>
                {renderLabel ? renderLabel(entry) : assigned
                  ? `Liste de lecture · ${formatMangaCorrespondenceChapterLabel(entry.chapter)}`
                  : "Hors liste · numéro de chapitre non déterminé"}
              </span>
              {actions ? (
                <div className="manga-correspondence-view__list-preparation-actions">
                  {actions}
                </div>
              ) : null}
            </div>
            {renderCard(entry)}
          </div>
        );
      })}
    </div>
  );
}
