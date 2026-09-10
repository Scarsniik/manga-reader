import { buildQuickReviewSourceUrls } from "@/renderer/components/QuickReview/quickReviewImages";
import { uniqueQuickReviewText } from "@/renderer/components/QuickReview/quickReviewText";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import type { ScraperCardPotentialMatchInput } from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";

const buildPotentialMatchInput = (
  item: QuickReviewItem,
  details: ScraperRuntimeDetailsResult | null,
): ScraperCardPotentialMatchInput | null => {
  const result = item.primarySource.result;
  const sourceUrls = buildQuickReviewSourceUrls(item, details);
  const titles = uniqueQuickReviewText([
    details?.title,
    item.displayTitle,
    result.detailsTitle,
    result.title,
  ]);
  const title = titles.join(" | ");
  if (!title) return null;

  return {
    key: item.id,
    scraperId: item.primarySource.scraper.id,
    title,
    sourceUrl: sourceUrls[0],
    sourceIdentities: sourceUrls.map((sourceUrl) => ({
      scraperId: item.primarySource.scraper.id,
      sourceUrl,
    })),
    authorNames: uniqueQuickReviewText([
      ...(details?.authors ?? []),
      ...(result.authorNames ?? []),
    ]),
  };
};

export const buildQuickReviewPotentialMatchInputs = ({
  currentIndex,
  detailsByItemId,
  items,
  prefetchCount,
}: {
  currentIndex: number;
  detailsByItemId: ReadonlyMap<string, ScraperRuntimeDetailsResult | null>;
  items: QuickReviewItem[];
  prefetchCount: number;
}): ScraperCardPotentialMatchInput[] => items
  .slice(currentIndex, currentIndex + prefetchCount + 1)
  .map((item) => buildPotentialMatchInput(item, detailsByItemId.get(item.id) ?? null))
  .filter((input): input is ScraperCardPotentialMatchInput => Boolean(input));
