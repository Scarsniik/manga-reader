import React from "react";
import ImageLightbox from "@/renderer/components/ImageLightbox/ImageLightbox";
import ScraperRuntimeThumbnailImage, {
  isScraperRuntimeCssSpriteThumbnail,
} from "@/renderer/components/ScraperRuntimeThumbnail/ScraperRuntimeThumbnailImage";
import {
  getScraperRuntimeThumbnailKey,
  type ScraperRuntimeThumbnail,
} from "@/renderer/utils/scraperRuntime";
import "@/renderer/components/QuickReview/thumbnails.scss";

type Props = {
  large: boolean;
  canLoadMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMoreLabel: string;
  onLoadMore: () => void;
  onPreviewIndexChange: (index: number | null) => void;
  previewIndex: number | null;
  resetKey: string;
  scrollRef: React.RefObject<HTMLDivElement>;
  thumbnailSize: number;
  thumbnails?: ScraperRuntimeThumbnail[];
  title: string;
};

type ThumbnailScrollStyle = React.CSSProperties & {
  "--quick-review-thumbnail-size": string;
};

const DEFAULT_SPRITE_WIDTH = 76;
const DEFAULT_SPRITE_HEIGHT = 106;
const THUMBNAIL_HEIGHT_RATIO = 1.5;

const renderThumbnail = (
  thumbnail: ScraperRuntimeThumbnail,
  alt: string,
  targetWidth = DEFAULT_SPRITE_WIDTH,
  expanded = false,
): React.ReactNode => {
  if (!isScraperRuntimeCssSpriteThumbnail(thumbnail)) {
    return <ScraperRuntimeThumbnailImage thumbnail={thumbnail} alt={alt} />;
  }

  const width = Math.max(1, thumbnail.width || DEFAULT_SPRITE_WIDTH);
  const height = Math.max(1, thumbnail.height || DEFAULT_SPRITE_HEIGHT);
  const maximumWidth = expanded
    ? window.innerWidth * 0.8
    : targetWidth;
  const maximumHeight = expanded
    ? window.innerHeight * 0.8
    : targetWidth * THUMBNAIL_HEIGHT_RATIO;
  const scale = Math.min(maximumWidth / width, maximumHeight / height, expanded ? 3 : 2.5);

  return (
    <span
      role="img"
      aria-label={alt}
      className="quick-review__thumbnail-sprite-frame"
      style={{ width: width * scale, height: height * scale }}
    >
      <ScraperRuntimeThumbnailImage
        thumbnail={thumbnail}
        alt={alt}
        className="quick-review__thumbnail-sprite"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
        }}
      />
    </span>
  );
};

export default function QuickReviewThumbnails({
  large,
  canLoadMore,
  loading,
  loadingMore,
  loadMoreLabel,
  onLoadMore,
  onPreviewIndexChange,
  previewIndex,
  resetKey,
  scrollRef,
  thumbnailSize,
  thumbnails = [],
  title,
}: Props) {
  const previewedThumbnail = previewIndex === null ? null : thumbnails[previewIndex] ?? null;
  const scrollStyle: ThumbnailScrollStyle = {
    "--quick-review-thumbnail-size": `${thumbnailSize}px`,
  };

  React.useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [resetKey, scrollRef]);

  return (
    <>
      <section className="quick-review__thumbnails" aria-label="Miniatures des pages">
        <div className="quick-review__thumbnails-head">
          <strong>Miniatures</strong>
          <span>{loading ? "Chargement…" : `${thumbnails.length} page(s)`}</span>
        </div>
        <div ref={scrollRef} className="quick-review__thumbnails-scroll" style={scrollStyle}>
          {loading ? Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="quick-review__thumbnail-skeleton" aria-hidden="true" />
          )) : (
            <>
              {thumbnails.length ? thumbnails.map((thumbnail, index) => (
                <button
                  key={`${getScraperRuntimeThumbnailKey(thumbnail)}-${index}`}
                  type="button"
                  className="quick-review__thumbnail"
                  onClick={() => onPreviewIndexChange(index)}
                  title={`Agrandir la page ${index + 1}`}
                  aria-label={`Agrandir la miniature de la page ${index + 1}`}
                >
                  {renderThumbnail(thumbnail, `${title} - Page ${index + 1}`, thumbnailSize)}
                  <span className="quick-review__thumbnail-page">{index + 1}</span>
                </button>
              )) : (
                <span className="quick-review__thumbnails-empty">Aucune miniature fournie par ce scraper.</span>
              )}
              {canLoadMore ? (
                <button
                  type="button"
                  className="quick-review__thumbnails-more"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Chargement…" : loadMoreLabel}
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <ImageLightbox
        open={Boolean(previewedThumbnail)}
        onClose={() => onPreviewIndexChange(null)}
        closeOnEscape={false}
        initialZoom={1}
        minZoom={0.5}
        maxZoom={4}
        zoomStep={0.25}
        resetKey={previewIndex ?? undefined}
        label={`Page ${(previewIndex ?? 0) + 1}`}
      >
        {previewedThumbnail ? renderThumbnail(
          previewedThumbnail,
          `${title} - Page ${(previewIndex ?? 0) + 1}`,
          thumbnailSize,
          true,
        ) : null}
      </ImageLightbox>
    </>
  );
}
