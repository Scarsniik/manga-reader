import React from "react";
import type {
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { recordScraperCardsSeen } from "@/renderer/stores/scraperViewHistory";
import {
  getScraperCardsViewState,
  getScraperCardViewStateClassName,
  getUniqueScraperViewHistoryIdentities,
  type ScraperCardViewState,
} from "@/renderer/utils/scraperViewHistory";

type RenderProps = {
  viewState: ScraperCardViewState;
  historyClassName: string;
  onViewed?: () => void;
};

type Props = {
  identities: ScraperViewHistoryCardIdentity[];
  recordsById: Map<string, ScraperViewHistoryRecord>;
  newCardIds: Set<string>;
  children: (props: RenderProps) => React.ReactElement;
};

export default function ScraperViewHistoryCard({
  identities,
  recordsById,
  newCardIds,
  children,
}: Props) {
  const uniqueIdentities = React.useMemo(
    () => getUniqueScraperViewHistoryIdentities(identities),
    [identities],
  );
  const viewState = React.useMemo(
    () => getScraperCardsViewState(recordsById, uniqueIdentities, newCardIds),
    [newCardIds, recordsById, uniqueIdentities],
  );
  const historyClassName = getScraperCardViewStateClassName(viewState);
  const handleViewed = React.useCallback(() => {
    if (!uniqueIdentities.length) {
      return;
    }

    void recordScraperCardsSeen(uniqueIdentities).catch((error) => {
      console.warn("Failed to record scraper card view", error);
    });
  }, [uniqueIdentities]);

  return children({
    viewState,
    historyClassName,
    onViewed: uniqueIdentities.length ? handleViewed : undefined,
  });
}
