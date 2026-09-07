import React from "react";
import useBackgroundSearchJob from "@/renderer/backgroundSearch/useBackgroundSearchJob";
import type { MangaCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import MangaCorrespondenceView from "@/renderer/components/MangaCorrespondence/MangaCorrespondenceView";
import type { MangaCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type { AuthorSeriesCorrespondenceSnapshot } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesCorrespondence";

type Props = {
  jobId: string;
  onBack: () => void;
  onSnapshot: (snapshot: AuthorSeriesCorrespondenceSnapshot) => void;
};

export default function AuthorSeriesCorrespondenceView({ jobId, onBack, onSnapshot }: Props) {
  const { job } = useBackgroundSearchJob(jobId);
  const input = job?.input as MangaCorrespondenceBackgroundInput | undefined;
  const result = job?.result as MangaCorrespondenceBackgroundResult | undefined;

  React.useEffect(() => {
    if (input && result) onSnapshot({ input, result });
  }, [input, onSnapshot, result]);

  return (
    <section className="scraper-author-series-correspondence">
      <button
        type="button"
        className="scraper-author-favorites-view__back"
        onClick={onBack}
      >
        Retour à toutes les séries
      </button>
      <MangaCorrespondenceView backgroundSearchJobId={jobId} />
    </section>
  );
}
