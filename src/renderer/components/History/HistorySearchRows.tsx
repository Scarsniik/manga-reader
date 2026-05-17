import React from "react";
import type { SearchHistoryRecord } from "@/shared/history";
import type { ScraperRecord } from "@/shared/scraper";
import {
  formatHistoryDate,
  formatSearchSettings,
} from "@/renderer/components/History/historyUtils";

type Props = {
  records: SearchHistoryRecord[];
  busyRecordId: string | null;
  scrapersById: Map<string, ScraperRecord>;
  onRemove: (record: SearchHistoryRecord) => void;
};

const getSearchSourceLabel = (
  record: SearchHistoryRecord,
  scrapersById: Map<string, ScraperRecord>,
): string => {
  if (record.sourceKind === "multiSource") {
    return "Multi-source";
  }

  return record.scraperId
    ? scrapersById.get(record.scraperId)?.name || record.scraperName || record.scraperId
    : record.scraperName || "Scrapper";
};

export default function HistorySearchRows({
  records,
  busyRecordId,
  scrapersById,
  onRemove,
}: Props) {
  return (
    <>
      {records.map((record) => {
        const isBusy = busyRecordId === record.id;
        const settingsLabel = record.sourceKind === "multiSource"
          ? formatSearchSettings(record.settings)
          : "";

        return (
          <article key={record.id} className="history-search-row">
            <div className="history-search-row__main">
              <div className="history-search-row__title">
                <strong>{record.query}</strong>
                <span>{getSearchSourceLabel(record, scrapersById)}</span>
              </div>
              <div className="history-search-row__metadata">
                {record.sourceKind === "multiSource" ? (
                  <span>{settingsLabel || "Settings non renseignes"}</span>
                ) : (
                  <span>Scrapper : {getSearchSourceLabel(record, scrapersById)}</span>
                )}
                <span>{formatHistoryDate(record.updatedAt)}</span>
              </div>
            </div>
            <div className="history-search-row__actions">
              <button
                type="button"
                className="danger"
                disabled={isBusy}
                onClick={() => onRemove(record)}
              >
                {isBusy ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </article>
        );
      })}
    </>
  );
}
