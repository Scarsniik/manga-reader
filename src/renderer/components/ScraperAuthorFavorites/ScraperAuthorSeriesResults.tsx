import React from "react";
import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import MergedChapterCardGrid from "@/renderer/components/ChapterGroups/MergedChapterCardGrid";
import type {
  AuthorSeriesChapterGroup,
  AuthorSeriesGroup,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesGroups";

type Props = {
  groups: AuthorSeriesGroup[];
  openingSeriesId?: string | null;
  onOpenSeries: (seriesId: string) => void;
  onCorrectAssignment: (
    series: AuthorSeriesGroup,
    chapter: AuthorSeriesChapterGroup,
  ) => void;
  renderCard: (card: MultiSearchMergedResult) => React.ReactNode;
};

const renderChapterCount = (series: AuthorSeriesGroup): string => (
  series.kind === "oneShots"
    ? `${series.chapters.length} œuvre(s) · ${series.sourceCount} source(s)`
    : `${series.chapters.length} chapitre(s) · ${series.sourceCount} source(s)`
);

export default function ScraperAuthorSeriesResults({
  groups,
  openingSeriesId = null,
  onOpenSeries,
  onCorrectAssignment,
  renderCard,
}: Props) {
  return (
    <div className="scraper-author-series-list">
      {groups.map((series) => (
        <section key={series.id} className="scraper-author-series-list__series">
          <header className="scraper-author-series-list__header">
            <div>
              <h3>{series.title}</h3>
              <span>{renderChapterCount(series)}</span>
            </div>
            {series.kind === "series" ? (
              <button
                type="button"
                disabled={Boolean(openingSeriesId)}
                onClick={() => onOpenSeries(series.id)}
              >
                {openingSeriesId === series.id ? "Ouverture…" : "Ouvrir la correspondance"}
              </button>
            ) : null}
          </header>
          <MergedChapterCardGrid
            entries={series.chapters}
            renderLabel={series.kind === "oneShots" ? () => "One Shot" : undefined}
            renderActions={(chapter) => (
              <button
                type="button"
                className="is-correction"
                onClick={() => onCorrectAssignment(series, chapter)}
              >
                Corriger le classement
              </button>
            )}
            renderCard={({ result }) => renderCard(result)}
          />
        </section>
      ))}
    </div>
  );
}
