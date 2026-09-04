import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import { uniqueQuickReviewText } from "@/renderer/components/QuickReview/quickReviewText";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";

export const buildQuickReviewSourceUrls = (
  item: QuickReviewItem | null,
  details: ScraperRuntimeDetailsResult | null,
): string[] => uniqueQuickReviewText([
  details?.finalUrl,
  details?.requestedUrl,
  item?.primarySource.result.detailsSourceUrl,
  item?.primarySource.result.detailUrl,
]);

export const getQuickReviewSourceUrl = (
  item: QuickReviewItem | null,
  details: ScraperRuntimeDetailsResult | null,
): string => buildQuickReviewSourceUrls(item, details)[0] || "";

export const buildQuickReviewCoverUrls = (
  item: QuickReviewItem,
  details: ScraperRuntimeDetailsResult | null,
): string[] => {
  const primaryResult = item.primarySource.result;
  const sourceUrl = getQuickReviewSourceUrl(item, details);
  const rawUrls = uniqueQuickReviewText([
    item.displayCoverUrl,
    details?.cover,
    ...(details?.coverCandidates ?? []),
    primaryResult.thumbnailUrl,
    ...(primaryResult.thumbnailCandidates ?? []),
  ]);

  return uniqueQuickReviewText(rawUrls.flatMap((url) => [
    buildRemoteThumbnailUrl(url, sourceUrl),
    url,
  ]));
};
