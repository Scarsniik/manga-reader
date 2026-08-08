export type SearchProductivityState = {
  consecutiveUnproductiveUnits: number;
  scannedCandidateCount: number;
  productiveCandidateCount: number;
};

export const EMPTY_SEARCH_PRODUCTIVITY_STATE: SearchProductivityState = {
  consecutiveUnproductiveUnits: 0,
  scannedCandidateCount: 0,
  productiveCandidateCount: 0,
};

export const advanceSearchProductivity = (
  state: SearchProductivityState,
  unit: { scannedCandidateCount: number; productiveCandidateCount: number },
): SearchProductivityState => {
  const scannedCandidateCount = Math.max(0, Math.floor(unit.scannedCandidateCount));
  const productiveCandidateCount = Math.max(0, Math.floor(unit.productiveCandidateCount));
  return {
    consecutiveUnproductiveUnits: productiveCandidateCount === 0
      ? state.consecutiveUnproductiveUnits + 1
      : 0,
    scannedCandidateCount: state.scannedCandidateCount + scannedCandidateCount,
    productiveCandidateCount: state.productiveCandidateCount + productiveCandidateCount,
  };
};

export const shouldStopUnproductiveSearch = (
  state: SearchProductivityState,
  consecutiveUnitLimit: number,
): boolean => (
  state.consecutiveUnproductiveUnits >= Math.max(1, Math.floor(consecutiveUnitLimit))
);

export const shouldAutoInvalidateUnproductiveSeed = ({
  protectedSeed,
  scannedCandidateCount,
  acceptedCandidateCount,
  stoppedUnproductiveSourceCount,
  minimumCandidateCount,
}: {
  protectedSeed: boolean;
  scannedCandidateCount: number;
  acceptedCandidateCount: number;
  stoppedUnproductiveSourceCount: number;
  minimumCandidateCount: number;
}): boolean => (
  !protectedSeed
  && Math.max(0, Math.floor(acceptedCandidateCount)) === 0
  && Math.max(0, Math.floor(stoppedUnproductiveSourceCount)) > 0
  && Math.max(0, Math.floor(scannedCandidateCount)) >= Math.max(1, Math.floor(minimumCandidateCount))
);

export const hasAbnormalDistinctValueCount = (
  distinctValueCount: number,
  warningLimit: number,
): boolean => (
  Math.max(0, Math.floor(distinctValueCount)) >= Math.max(1, Math.floor(warningLimit))
);
