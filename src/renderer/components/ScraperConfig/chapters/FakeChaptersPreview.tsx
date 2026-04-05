import React from 'react';
import { FakeChaptersPreview as FakeChaptersPreviewData } from '@/renderer/components/ScraperConfig/chapters/chaptersFeatureEditor.utils';

type Props = {
  preview: FakeChaptersPreviewData | null;
};

export default function FakeChaptersPreview({ preview }: Props) {
  if (!preview?.chapters.length) {
    return null;
  }

  return (
    <div className="scraper-fake-chapters">
      {preview.chapters.map((chapter) => (
        <div key={`${chapter.url}-${chapter.label}`} className="scraper-fake-chapter-card">
          <div className="scraper-fake-chapter-card__media">
            {chapter.image ? (
              <img src={chapter.image} alt={chapter.label} />
            ) : (
              <div className="scraper-fake-chapter-card__media-placeholder">Image</div>
            )}
          </div>

          <div className="scraper-fake-chapter-card__content">
            <strong>{chapter.label}</strong>
            <span>{chapter.url}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
