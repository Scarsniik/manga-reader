import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime/types";

export const hasRenderableDetails = (details: ScraperRuntimeDetailsResult): boolean =>
  Boolean(
    details.title ||
    details.cover ||
    details.description ||
    details.authors.length ||
    details.tags.length ||
    (details.thumbnails?.length ?? 0) > 0 ||
    details.mangaStatus ||
    details.pageCount ||
    details.languageCodes.length,
  );
