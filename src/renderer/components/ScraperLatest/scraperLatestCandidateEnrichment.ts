import {
  enrichCandidatesForTarget,
  type ProgressiveCandidateEnrichmentOptions,
  type ProgressiveCandidateEnrichmentProgress,
  type ProgressiveCandidateEnrichmentResult,
} from "@/renderer/utils/progressiveCandidateEnrichment";

export type ScraperLatestCandidateEnrichmentOptions<Candidate> = Omit<
  ProgressiveCandidateEnrichmentOptions<Candidate>,
  "targetCount"
> & {
  remainingResultSlots: number;
};

export type ScraperLatestCandidateEnrichmentProgress = ProgressiveCandidateEnrichmentProgress;
export type ScraperLatestCandidateEnrichmentResult<Candidate> = ProgressiveCandidateEnrichmentResult<Candidate>;

export const enrichScraperLatestCandidatesForSlots = async <Candidate>({
  remainingResultSlots,
  ...options
}: ScraperLatestCandidateEnrichmentOptions<Candidate>): Promise<
  ScraperLatestCandidateEnrichmentResult<Candidate>
> => enrichCandidatesForTarget({
  ...options,
  targetCount: remainingResultSlots,
});
