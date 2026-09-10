import React from "react";
import type { ScraperEntityListItem, ScraperEntityListKind } from "@/shared/scraper";
import type { ScraperRuntimeTagListPageResult } from "@/renderer/utils/scraperRuntime";

type Props = {
  entityKind: ScraperEntityListKind;
  previewItems: ScraperEntityListItem[];
  previewPage: ScraperRuntimeTagListPageResult | null;
  previewPageIndex: number;
  usesTemplatePaging: boolean;
  validating: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export default function TagListFeaturePreview({
  entityKind,
  previewItems,
  previewPage,
  previewPageIndex,
  usesTemplatePaging,
  validating,
  onPreviousPage,
  onNextPage,
}: Props) {
  if (!previewItems.length) {
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
        <span className="sr-only">
          Apercu des {entityKind === "author" ? "auteurs" : "tags"} extraits
        </span>
        {previewItems.map((item) => (
          <div
            key={`${item.url ?? item.name}-${item.name}`}
            className="scraper-tag-list-preview__item"
          >
            <span>{item.name}</span>
            {item.count ? <small>{item.count}</small> : null}
            {item.url ? <code>{item.url}</code> : null}
          </div>
        ))}
      </div>
    </>
  );
}
