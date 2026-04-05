import React from 'react';

type Props = {
  currentPreviewUrl: string | null;
  previewIndex: number;
  previewUrls: string[];
  onPrevious: () => void;
  onNext: () => void;
};

export default function FakeReaderPreview({
  currentPreviewUrl,
  previewIndex,
  previewUrls,
  onPrevious,
  onNext,
}: Props) {
  if (!currentPreviewUrl) {
    return null;
  }

  return (
    <div className="scraper-fake-reader">
      <div className="scraper-fake-reader__viewport">
        <img src={currentPreviewUrl} alt={`Page ${previewIndex + 1}`} />
      </div>
      <div className="scraper-fake-reader__controls">
        <button
          type="button"
          className="secondary"
          onClick={onPrevious}
          disabled={previewIndex <= 0}
        >
          Precedent
        </button>
        <span>{previewIndex + 1} / {previewUrls.length}</span>
        <button
          type="button"
          className="secondary"
          onClick={onNext}
          disabled={previewIndex >= previewUrls.length - 1}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
