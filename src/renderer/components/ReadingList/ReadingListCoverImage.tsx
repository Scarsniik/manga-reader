import React, { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ReadingListItem } from "@/renderer/types/readingList";
import { buildReadingListCoverSources } from "@/renderer/components/ReadingList/readingListCovers";

type Props = {
  alt: string;
  fallback: ReactNode;
  item: Pick<ReadingListItem, "metadata" | "sourceTarget">;
};

export default function ReadingListCoverImage({ alt, fallback, item }: Props) {
  const sources = useMemo(
    () => buildReadingListCoverSources(item),
    [item.metadata.cover, item.metadata.coverCandidates, item.sourceTarget],
  );
  const sourcesKey = sources.join("\n");
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sourcesKey]);

  const source = sources[sourceIndex];
  if (!source) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={source}
      alt={alt}
      onError={() => setSourceIndex((currentIndex) => currentIndex + 1)}
    />
  );
}
