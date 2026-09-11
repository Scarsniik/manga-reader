import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { ChevronLeftIcon, FolderExternalLinkIcon, LoadingSpinnerIcon } from "@/renderer/components/icons";
import type { QuickReviewSeriesGroup } from "@/renderer/components/QuickReview/types";
import { getLanguageLabel } from "@/renderer/utils/languageDetection";
import "@/renderer/components/QuickReview/series.scss";

type Props = {
  chapterIndex: number;
  contextLabel?: string;
  nextSeriesShortcut: string;
  onNextSeries: () => void;
  onOpenSeries?: () => void;
  onPreviousSeries: () => void;
  onSelectChapter: (itemId: string) => void;
  openSeriesShortcut: string;
  openingSeries: boolean;
  previousSeriesShortcut: string;
  series: QuickReviewSeriesGroup;
  seriesIndex: number;
  seriesCount: number;
};

const pluralize = (count: number, singular: string, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

export default function QuickReviewSeriesHeader({
  chapterIndex,
  contextLabel,
  nextSeriesShortcut,
  onNextSeries,
  onOpenSeries,
  onPreviousSeries,
  onSelectChapter,
  openSeriesShortcut,
  openingSeries,
  previousSeriesShortcut,
  series,
  seriesIndex,
  seriesCount,
}: Props) {
  return (
    <section className="quick-review-series" aria-label={`Série ${series.title}`}>
      <div className="quick-review-series__heading">
        <div className="quick-review-series__identity">
          <span className="quick-review-series__eyebrow">
            {contextLabel ? `${contextLabel} · ` : ""}
            Série {seriesIndex + 1}/{seriesCount}
          </span>
          <h2>{series.title}</h2>
          <div className="quick-review-series__facts">
            <span>{pluralize(series.chapterCount, "chapitre")}</span>
            <span>{pluralize(series.sourceCount, "source")}</span>
            {series.languageAvailability.map((availability) => (
              <span
                key={availability.languageCode}
                className="quick-review-series__language"
                title={`${getLanguageLabel(availability.languageCode)} : ${availability.chapterCount}/${series.chapterCount} chapitre(s)`}
                aria-label={`${getLanguageLabel(availability.languageCode)} : ${availability.chapterCount}/${series.chapterCount} chapitre(s)`}
              >
                <LanguageFlags languageCodes={[availability.languageCode]} />
                {availability.chapterCount}/{series.chapterCount}
              </span>
            ))}
          </div>
        </div>

        <div className="quick-review-series__actions">
          <button
            type="button"
            onClick={onPreviousSeries}
            disabled={seriesIndex === 0}
            title={`Série précédente${previousSeriesShortcut ? ` (${previousSeriesShortcut})` : ""}`}
            aria-label="Série précédente"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </button>
          <button
            type="button"
            className="is-next"
            onClick={onNextSeries}
            disabled={seriesIndex >= seriesCount - 1}
            title={`Série suivante${nextSeriesShortcut ? ` (${nextSeriesShortcut})` : ""}`}
            aria-label="Série suivante"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </button>
          {onOpenSeries ? (
            <button
              type="button"
              className="is-open"
              onClick={onOpenSeries}
              disabled={openingSeries}
              title={`Ouvrir la série dans un nouvel onglet${openSeriesShortcut ? ` (${openSeriesShortcut})` : ""}`}
              aria-label={`Ouvrir ${series.title} dans un nouvel onglet`}
            >
              {openingSeries
                ? <LoadingSpinnerIcon aria-hidden="true" />
                : <FolderExternalLinkIcon aria-hidden="true" />}
              <span>Ouvrir la série</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="quick-review-series__chapters" aria-label="Chapitres de la série">
        {series.chapters.map((chapter, index) => (
          <button
            key={chapter.itemId}
            type="button"
            className={index === chapterIndex ? "is-active" : ""}
            aria-current={index === chapterIndex ? "true" : undefined}
            onClick={() => onSelectChapter(chapter.itemId)}
            title={`Chapitre ${chapter.label}`}
          >
            {chapter.label}
          </button>
        ))}
      </div>
    </section>
  );
}
