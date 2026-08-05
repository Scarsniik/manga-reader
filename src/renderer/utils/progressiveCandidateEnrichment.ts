export type ProgressiveCandidateEnrichmentOptions<Candidate> = {
  candidates: Candidate[];
  targetCount: number;
  enrichBatch: (candidates: Candidate[]) => Promise<Candidate[]>;
  isAccepted: (candidate: Candidate) => boolean;
  maxBatchSize?: number;
  onProgress?: (progress: ProgressiveCandidateEnrichmentProgress) => void;
};

export type ProgressiveCandidateEnrichmentProgress = {
  acceptedCandidateCount: number;
  processedCandidateCount: number;
  remainingCandidateCount: number;
  targetCount: number;
};

export type ProgressiveCandidateEnrichmentResult<Candidate> = {
  acceptedCandidates: Candidate[];
  remainingCandidates: Candidate[];
  processedCandidateCount: number;
};

export const enrichCandidatesForTarget = async <Candidate>({
  candidates,
  targetCount,
  enrichBatch,
  isAccepted,
  maxBatchSize,
  onProgress,
}: ProgressiveCandidateEnrichmentOptions<Candidate>): Promise<
  ProgressiveCandidateEnrichmentResult<Candidate>
> => {
  const normalizedTargetCount = Math.max(0, Math.floor(Number(targetCount) || 0));
  const normalizedMaxBatchSize = Math.max(1, Math.floor(Number(maxBatchSize) || candidates.length || 1));
  const acceptedCandidates: Candidate[] = [];
  let processedCandidateCount = 0;
  const reportProgress = () => onProgress?.({
    acceptedCandidateCount: acceptedCandidates.length,
    processedCandidateCount,
    remainingCandidateCount: candidates.length - processedCandidateCount,
    targetCount: normalizedTargetCount,
  });

  reportProgress();
  while (processedCandidateCount < candidates.length && acceptedCandidates.length < normalizedTargetCount) {
    const batchSize = Math.min(
      candidates.length - processedCandidateCount,
      normalizedTargetCount - acceptedCandidates.length,
      normalizedMaxBatchSize,
    );
    const candidateBatch = candidates.slice(processedCandidateCount, processedCandidateCount + batchSize);
    processedCandidateCount += candidateBatch.length;
    const enrichedBatch = await enrichBatch(candidateBatch);
    enrichedBatch.forEach((candidate) => {
      if (acceptedCandidates.length < normalizedTargetCount && isAccepted(candidate)) {
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
