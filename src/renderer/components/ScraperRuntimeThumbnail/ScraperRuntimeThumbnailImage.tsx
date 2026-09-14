import React from "react";
import {
  getScraperRuntimeThumbnailUrl,
  type ScraperRuntimeThumbnail,
} from "@/renderer/utils/scraperRuntime";

type CssSpriteThumbnail = Extract<ScraperRuntimeThumbnail, { kind: "css_sprite" }>;

type Props = {
  alt: string;
  className?: string;
  spriteClassName?: string;
  style?: React.CSSProperties;
  thumbnail: ScraperRuntimeThumbnail;
};

const buildCssUrl = (url: string): string => `url("${url.replace(/"/g, '\\"')}")`;

export const isScraperRuntimeCssSpriteThumbnail = (
  thumbnail: ScraperRuntimeThumbnail,
): thumbnail is CssSpriteThumbnail => (
  typeof thumbnail !== "string" && thumbnail.kind === "css_sprite"
);

export default function ScraperRuntimeThumbnailImage({
  alt,
  className = "",
  spriteClassName = "",
  style,
  thumbnail,
}: Props) {
  if (isScraperRuntimeCssSpriteThumbnail(thumbnail)) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={[className, spriteClassName].filter(Boolean).join(" ")}
        style={{
          backgroundImage: buildCssUrl(thumbnail.url),
          backgroundPosition: `${thumbnail.positionX ?? 0}px ${thumbnail.positionY ?? 0}px`,
          backgroundRepeat: "no-repeat",
          backgroundSize: thumbnail.backgroundSize,
          ...style,
        }}
      />
    );
  }

  return (
    <img
      src={getScraperRuntimeThumbnailUrl(thumbnail)}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
    />
  );
}
