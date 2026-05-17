import React from "react";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import type { HistoryProgress } from "@/renderer/components/History/historyUtils";
import { formatHistoryDate } from "@/renderer/components/History/historyUtils";

type Props = {
  title: string;
  coverUrl?: string | null;
  sourceLabel: string;
  updatedAt: string;
  chapterLabel?: string | null;
  progress?: HistoryProgress | null;
  actions: ScraperCardAction[];
  className?: string;
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
};

export default function HistoryCard({
  title,
  coverUrl,
  sourceLabel,
  updatedAt,
  chapterLabel = null,
  progress = null,
  actions,
  className = "",
  onClick,
  onKeyDown,
}: Props) {
  const formattedDate = formatHistoryDate(updatedAt);

  return (
    <ScraperCard
      title={title}
      coverUrl={coverUrl}
      coverAlt={title}
      eyebrow={(
        <span className="history-card__source">
          {sourceLabel}
        </span>
      )}
      metadata={(
        <div className="history-card__metadata">
          {chapterLabel ? (
            <span className="history-card__pill">{chapterLabel}</span>
          ) : null}
          {formattedDate ? (
            <span className="history-card__pill">{formattedDate}</span>
          ) : null}
          {progress ? (
            <div
              className="history-card__progress"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={progress.totalPages ?? undefined}
              aria-valuenow={progress.currentPage}
              aria-valuetext={progress.label}
            >
              <div className="history-card__progress-track">
                <span style={{ width: `${progress.percent ?? 100}%` }} />
              </div>
              <strong>{progress.label}</strong>
            </div>
          ) : null}
        </div>
      )}
      actions={actions}
      className={["history-card", className].join(" ").trim()}
      isActionable={Boolean(onClick)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      ariaLabel={onClick ? `Ouvrir ${title}` : undefined}
    />
  );
}
