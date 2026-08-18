import React from "react";
import {
  buildRemoteThumbnailUrl,
  isSupportedRemoteThumbnailUrl,
} from "@/renderer/utils/remoteThumbnails";

type Props = {
  thumbnailUrl?: string | null;
  thumbnailCandidates?: string[];
  refererUrl?: string | null;
  fallbackText: string;
};

const buildThumbnailUrls = (
  thumbnailUrl: string | null | undefined,
  thumbnailCandidates: string[],
  refererUrl: string | null | undefined,
): string[] => {
  const seenUrls = new Set<string>();

  return [thumbnailUrl, ...thumbnailCandidates].reduce<string[]>((urls, candidate) => {
    const normalizedCandidate = candidate?.trim();
    if (
      !normalizedCandidate
      || !isSupportedRemoteThumbnailUrl(normalizedCandidate)
      || seenUrls.has(normalizedCandidate)
    ) {
      return urls;
    }

    seenUrls.add(normalizedCandidate);
    const remoteThumbnailUrl = buildRemoteThumbnailUrl(normalizedCandidate, refererUrl);
    if (remoteThumbnailUrl && !seenUrls.has(remoteThumbnailUrl)) {
      seenUrls.add(remoteThumbnailUrl);
      urls.push(remoteThumbnailUrl);
    }
    urls.push(normalizedCandidate);
    return urls;
  }, []);
};

export default function AuthorCorrespondencePreviewImage({
  thumbnailUrl,
  thumbnailCandidates = [],
  refererUrl,
  fallbackText,
}: Props) {
  const thumbnailUrls = React.useMemo(
    () => buildThumbnailUrls(thumbnailUrl, thumbnailCandidates, refererUrl),
    [refererUrl, thumbnailCandidates, thumbnailUrl],
  );
  const thumbnailUrlsKey = thumbnailUrls.join("\n");
  const [thumbnailIndex, setThumbnailIndex] = React.useState(0);

  React.useEffect(() => {
    setThumbnailIndex(0);
  }, [thumbnailUrlsKey]);

  const activeThumbnailUrl = thumbnailUrls[thumbnailIndex];
  if (!activeThumbnailUrl) {
    return <span>{fallbackText.slice(0, 2)}</span>;
  }

  return (
    <img
      key={activeThumbnailUrl}
      src={activeThumbnailUrl}
      alt=""
      onError={() => setThumbnailIndex((currentIndex) => currentIndex + 1)}
    />
  );
}
