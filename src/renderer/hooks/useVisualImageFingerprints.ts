import React from "react";
import type {
  VisualImageFingerprint,
  VisualImageFingerprintInput,
  VisualImageFingerprintResponse,
} from "@/shared/visualImageFingerprint";

type VisualImageFingerprintState = {
  fingerprintsByKey: ReadonlyMap<string, VisualImageFingerprint>;
  loading: boolean;
};

const EMPTY_FINGERPRINTS = new Map<string, VisualImageFingerprint>();

export default function useVisualImageFingerprints(
  images: VisualImageFingerprintInput[],
  enabled: boolean,
): VisualImageFingerprintState {
  const [fingerprintsByKey, setFingerprintsByKey] = React.useState<
    ReadonlyMap<string, VisualImageFingerprint>
  >(EMPTY_FINGERPRINTS);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!enabled || !images.length || typeof window.api?.getVisualImageFingerprints !== "function") {
      setFingerprintsByKey(EMPTY_FINGERPRINTS);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void window.api.getVisualImageFingerprints({ images })
      .then((response: VisualImageFingerprintResponse) => {
        if (cancelled) return;
        const nextFingerprints = new Map<string, VisualImageFingerprint>();
        response.results.forEach((result) => {
          if (result.key && result.fingerprint) {
            nextFingerprints.set(result.key, result.fingerprint);
          }
        });
        setFingerprintsByKey(nextFingerprints);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("Failed to load visual image fingerprints", error);
          setFingerprintsByKey(EMPTY_FINGERPRINTS);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, images]);

  return { fingerprintsByKey, loading };
}
