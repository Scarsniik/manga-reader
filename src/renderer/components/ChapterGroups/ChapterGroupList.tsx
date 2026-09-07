import React from "react";
import { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";
import "@/renderer/components/ChapterGroups/style.scss";

export type ChapterGroupListEntry<T> = {
  chapter: string;
  value: T;
};

type Props<T> = {
  groups: Array<ChapterGroupListEntry<T>>;
  getKey?: (group: ChapterGroupListEntry<T>) => React.Key;
  getSubtitle?: (group: ChapterGroupListEntry<T>) => React.ReactNode;
  getTitle?: (group: ChapterGroupListEntry<T>) => React.ReactNode;
  isMuted?: (group: ChapterGroupListEntry<T>) => boolean;
  renderActions?: (group: ChapterGroupListEntry<T>) => React.ReactNode;
  renderContent: (group: ChapterGroupListEntry<T>) => React.ReactNode;
};

const getDefaultTitle = <T,>({ chapter }: ChapterGroupListEntry<T>): React.ReactNode => (
  chapter === "Non renseigné"
    ? "Chapitre non renseigné"
    : formatMangaCorrespondenceChapterLabel(chapter, true)
);

export default function ChapterGroupList<T>({
  groups,
  getKey = (group) => group.chapter,
  getSubtitle,
  getTitle = getDefaultTitle,
  isMuted,
  renderActions,
  renderContent,
}: Props<T>) {
  return (
    <div className="chapter-group-list">
      {groups.map((group) => (
        <section
          key={getKey(group)}
          className={[
            "chapter-group-list__group",
            isMuted?.(group) ? "is-muted" : "",
          ].filter(Boolean).join(" ")}
        >
          <header className="chapter-group-list__header">
            <div className="chapter-group-list__identity">
              <h3>{getTitle(group)}</h3>
              {getSubtitle ? <span>{getSubtitle(group)}</span> : null}
            </div>
            {renderActions ? (
              <div className="chapter-group-list__actions">
                {renderActions(group)}
              </div>
            ) : null}
          </header>
          {renderContent(group)}
        </section>
      ))}
    </div>
  );
}
