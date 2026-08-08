export const throwIfSearchAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new DOMException("Recherche annulee", "AbortError");
  }
};
