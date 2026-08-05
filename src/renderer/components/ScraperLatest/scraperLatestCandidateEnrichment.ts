export type ScraperLatestCandidateEnrichmentOptions<Candidate> = {
  candidates: Candidate[];
  remainingResultSlots: number;
  enrichBatch: (candidates: Candidate[]) => Promise<Candidate[]>;
  isAccepted: (candidate: Candidate) => boolean;
  maxBatchSize?: number;
  onProgress?: (progress: ScraperLatestCandidateEnrichmentProgress) => void;
};

export type ScraperLatestCandidateEnrichmentProgress = {
  acceptedCandidateCount: number;
  processedCandidateCount: number;
  remainingCandidateCount: number;
  targetCount: number;
};

export type ScraperLatestCandidateEnrichmentResult<Candidate> = {
  acceptedCandidates: Candidate[];
  remainingCandidates: Candidate[];
  processedCandidateCount: number;
};

export const enrichScraperLatestCandidatesForSlots = async <Candidate>({
  candidates,
  remainingResultSlots,
  enrichBatch,
  isAccepted,
  maxBatchSize,
  onProgress,
}: ScraperLatestCandidateEnrichmentOptions<Candidate>): Promise<
  ScraperLatestCandidateEnrichmentResult<Candidate>
> => {
  const targetCount = Math.max(0, Math.floor(Number(remainingResultSlots) || 0));
  const normalizedMaxBatchSize = Math.max(1, Math.floor(Number(maxBatchSize) || candidates.length || 1));
  const acceptedCandidates: Candidate[] = [];
  let processedCandidateCount = 0;
  const reportProgress = () => onProgress?.({
    acceptedCandidateCount: acceptedCandidates.length,
    processedCandidateCount,
    remainingCandidateCount: candidates.length - processedCandidateCount,
    targetCount,
  });

  reportProgress();

  while (processedCandidateCount < candidates.length && acceptedCandidates.length < targetCount) {
    const batchSize = Math.min(
      candidates.length - processedCandidateCount,
      targetCount - acceptedCandidates.length,
      normalizedMaxBatchSize,
    );
    const candidateBatch = candidates.slice(
      processedCandidateCount,
      processedCandidateCount + batchSize,
    );
    processedCandidateCount += candidateBatch.length;
    const enrichedBatch = await enrichBatch(candidateBatch);
    enrichedBatch.forEach((candidate) => {
      if (acceptedCandidates.length < targetCount && isAccepted(candidate)) {
        acceptedCandidates.push(candidate);
      }
    });
    reportProgress();
  }

  return {
    acceptedCandidates,
    remainingCandidates: candidates.slice(processedCandidateCount),
    processedCandidateCount,
  };
};
