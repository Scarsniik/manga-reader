import React, { useCallback } from "react";
import type { DetailsHistoryRecord, ReadingHistoryRecord } from "@/shared/history";
import type { ScraperRecord } from "@/shared/scraper";
import type { Manga } from "@/renderer/types";
import ScraperBookmarkButton from "@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton";
import HistoryCard from "@/renderer/components/History/HistoryCard";
import {
  buildProgressDisplay,
  buildScraperProgressIndexes,
  getReadingProgress,
} from "@/renderer/components/History/historyUtils";
import type { ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import { OpenBookIcon, TrashCanIcon } from "@/renderer/components/icons";
import { toLocalImageUrl } from "@/renderer/utils/history";
import {
  canOpenScraperReader,
  getScraperHistoryCover,
} from "@/renderer/components/History/historyReader";

type ProgressIndexes = ReturnType<typeof buildScraperProgressIndexes>;

type ReadingCardProps = {
  record: ReadingHistoryRecord;
  busyRecordId: string | null;
  mangaById: Map<string, Manga>;
  progressIndexes: ProgressIndexes;
  scrapersById: Map<string, ScraperRecord>;
  onOpenLibraryReader: (record: ReadingHistoryRecord, openInWorkspace?: boolean) => void;
  onOpenScraperReader: (record: ReadingHistoryRecord | DetailsHistoryRecord, openInWorkspace?: boolean) => void;
  onRemove: (record: ReadingHistoryRecord) => void;
  onMarkRead: (record: ReadingHistoryRecord) => void;
};

type DetailsCardProps = {
  record: DetailsHistoryRecord;
  busyRecordId: string | null;
  scrapersById: Map<string, ScraperRecord>;
  onOpenDetails: (record: DetailsHistoryRecord) => void;
  onOpenScraperReader: (record: ReadingHistoryRecord | DetailsHistoryRecord, openInWorkspace?: boolean) => void;
  onRemove: (record: DetailsHistoryRecord) => void;
};

const getReadingRecordSourceLabel = (
  record: ReadingHistoryRecord,
  scrapersById: Map<string, ScraperRecord>,
): string => {
  if (record.sourceKind === "library") {
    return "Bibliotheque locale";
  }

  return record.scraperId
    ? scrapersById.get(record.scraperId)?.name || `Scrapper ${record.scraperId}`
    : "Scrapper inconnu";
};

const getDetailsRecordSourceLabel = (
  record: DetailsHistoryRecord,
  scrapersById: Map<string, ScraperRecord>,
): string => (
  scrapersById.get(record.scraperId)?.name || `Scrapper ${record.scraperId}`
);

export function HistoryReadingCard({
  record,
  busyRecordId,
  mangaById,
  progressIndexes,
  scrapersById,
  onOpenLibraryReader,
  onOpenScraperReader,
  onRemove,
  onMarkRead,
}: ReadingCardProps) {
  const manga = record.mangaId ? mangaById.get(record.mangaId) ?? null : null;
  const scraper = record.scraperId ? scrapersById.get(record.scraperId) ?? null : null;
  const progress = getReadingProgress(record, mangaById, progressIndexes)
    ?? buildProgressDisplay(record.currentPage, record.totalPages);
  const isBusy = busyRecordId === record.id;
  const canRead = record.sourceKind === "library" || canOpenScraperReader(scraper, record.chapterUrl);
  const coverUrl = record.sourceKind === "library"
    ? toLocalImageUrl(manga?.thumbnailPath || record.cover)
    : getScraperHistoryCover(record.cover, record.sourceUrl);

  const actions = useCallback((): ScraperCardAction[] => {
    const nextActions: ScraperCardAction[] = [
      {
        id: "resume",
        type: "secondary",
        label: isBusy ? "Ouverture..." : "Reprendre",
        ariaLabel: `Reprendre ${record.title}`,
        icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
        onClick: () => {
          if (record.sourceKind === "library") {
            onOpenLibraryReader(record);
            return;
          }

          onOpenScraperReader(record);
        },
        onMiddleClick: () => {
          if (record.sourceKind === "library") {
            onOpenLibraryReader(record, true);
            return;
          }

          onOpenScraperReader(record, true);
        },
        disabled: isBusy || !canRead,
      },
      {
        id: "remove",
        type: "icon-secondary",
        label: "Supprimer de l'historique",
        icon: <TrashCanIcon aria-hidden="true" focusable="false" />,
        onClick: () => onRemove(record),
        disabled: isBusy,
      },
    ];

    if (record.sourceKind === "scraper" && record.scraperId && record.sourceUrl) {
      nextActions.push({
        id: "bookmark",
        type: "custom",
        label: "Basculer le bookmark",
        render: () => (
          <ScraperBookmarkButton
            scraperId={record.scraperId || ""}
            sourceUrl={record.sourceUrl || ""}
            title={record.title}
            cover={record.cover}
            excludedFields={scraper?.globalConfig.bookmark.excludedFields}
            size="sm"
          />
        ),
      });
    }

    nextActions.push({
      id: "mark-read",
      type: "secondary",
      label: progress?.isCompleted ? "Lu" : "Marquer lu",
      ariaLabel: `Marquer comme lu ${record.title}`,
      icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
      className: [
        "is-read-toggle",
        progress?.isCompleted ? "is-read" : "",
      ].join(" ").trim(),
      onClick: () => onMarkRead(record),
      disabled: isBusy || progress?.isCompleted,
    });

    return nextActions;
  }, [
    canRead,
    isBusy,
    onMarkRead,
    onOpenLibraryReader,
    onOpenScraperReader,
    onRemove,
    progress?.isCompleted,
    record,
    scraper?.globalConfig.bookmark.excludedFields,
  ]);

  return (
    <HistoryCard
      title={manga?.title || record.title}
      coverUrl={coverUrl}
      sourceLabel={getReadingRecordSourceLabel(record, scrapersById)}
      updatedAt={record.updatedAt}
      chapterLabel={record.chapterLabel}
      progress={progress}
      actions={actions()}
    />
  );
}

export function HistoryDetailsCard({
  record,
  busyRecordId,
  scrapersById,
  onOpenDetails,
  onOpenScraperReader,
  onRemove,
}: DetailsCardProps) {
  const scraper = scrapersById.get(record.scraperId) ?? null;
  const isBusy = busyRecordId === record.id;
  const actions: ScraperCardAction[] = [
    {
      id: "bookmark",
      type: "custom",
      label: "Basculer le bookmark",
      render: () => (
        <ScraperBookmarkButton
          scraperId={record.scraperId}
          sourceUrl={record.sourceUrl}
          title={record.title}
          cover={record.cover}
          excludedFields={scraper?.globalConfig.bookmark.excludedFields}
          size="sm"
        />
      ),
    },
    {
      id: "read",
      type: "secondary",
      label: isBusy ? "Ouverture..." : "Lecture",
      ariaLabel: `Ouvrir la lecture ${record.title}`,
      icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
      onClick: () => onOpenScraperReader(record),
      onMiddleClick: () => onOpenScraperReader(record, true),
      disabled: isBusy || !canOpenScraperReader(scraper),
    },
    {
      id: "remove",
      type: "icon-secondary",
      label: "Supprimer de l'historique",
      icon: <TrashCanIcon aria-hidden="true" focusable="false" />,
      onClick: () => onRemove(record),
      disabled: isBusy,
    },
  ];

  return (
    <HistoryCard
      title={record.title}
      coverUrl={getScraperHistoryCover(record.cover, record.sourceUrl)}
      sourceLabel={getDetailsRecordSourceLabel(record, scrapersById)}
      updatedAt={record.updatedAt}
      actions={actions}
      onClick={() => onOpenDetails(record)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        onOpenDetails(record);
      }}
    />
  );
}
