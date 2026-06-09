import React from "react";
import type { ScraperTagListItem } from "@/shared/scraper";
import type { ScraperRuntimeTagListPageResult } from "@/renderer/utils/scraperRuntime";

type Props = {
  previewTags: ScraperTagListItem[];
  previewPage: ScraperRuntimeTagListPageResult | null;
  previewPageIndex: number;
  usesTemplatePaging: boolean;
  validating: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export default function TagListFeaturePreview({
  previewTags,
  previewPage,
  previewPageIndex,
  usesTemplatePaging,
  validating,
  onPreviousPage,
  onNextPage,
}: Props) {
  if (!previewTags.length) {
    return null;
  }

  const hasPaginationLinks = Boolean(previewPage?.paginationUrls.length);
  const canGoNext = usesTemplatePaging || Boolean(previewPage?.nextPageUrl) || hasPaginationLinks;

  return (
    <>
      {previewPage?.nextPageUrl ? (
        <div className="scraper-config-preview">
          <span>Page suivante detectee</span>
          <strong>{previewPage.nextPageUrl}</strong>
        </div>
      ) : null}

      {hasPaginationLinks ? (
        <div className="scraper-config-preview">
          <span>Liens pages ou lettres detectes</span>
          <strong>{previewPage?.paginationUrls.length}</strong>
        </div>
      ) : null}

      {canGoNext || previewPageIndex > 0 ? (
        <div className="scraper-search-preview-pagination">
          <button
            type="button"
            className="secondary"
            onClick={onPreviousPage}
            disabled={validating || previewPageIndex <= 0}
          >
            Tester page precedente
          </button>
          <span>
            Page testee : {previewPageIndex + 1}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={onNextPage}
            disabled={validating || !canGoNext}
          >
            Tester page suivante
          </button>
        </div>
      ) : null}

      <div className="scraper-tag-list-preview">
        {previewTags.map((tag) => (
          <div
            key={`${tag.url ?? tag.name}-${tag.name}`}
            className="scraper-tag-list-preview__item"
          >
            <span>{tag.name}</span>
            {tag.count ? <small>{tag.count}</small> : null}
            {tag.url ? <code>{tag.url}</code> : null}
          </div>
        ))}
      </div>
    </>
  );
}
