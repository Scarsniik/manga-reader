export type VisualImageFingerprint = {
  version: 1;
  width: number;
  height: number;
  luminanceBase64: string;
  aspectRatio: number;
};

export type VisualImageFingerprintInput = {
  key: string;
  url: string;
  refererUrl?: string;
};

export type VisualImageFingerprintRequest = {
  images: VisualImageFingerprintInput[];
  executionId?: string;
};

export type VisualImageFingerprintResult = {
  key: string;
  fingerprint?: VisualImageFingerprint;
  error?: string;
};

export type VisualImageFingerprintResponse = {
  results: VisualImageFingerprintResult[];
};

const decodeBase64 = (value: string): Uint8Array => {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const getVisualImageSimilarity = (
  left: VisualImageFingerprint,
  right: VisualImageFingerprint,
): number => {
  if (
    left.version !== right.version
    || left.width !== right.width
    || left.height !== right.height
    || !left.luminanceBase64
    || !right.luminanceBase64
  ) {
    return 0;
  }

  const largestAspectRatio = Math.max(left.aspectRatio, right.aspectRatio);
  const aspectRatioDifference = largestAspectRatio > 0
    ? Math.abs(left.aspectRatio - right.aspectRatio) / largestAspectRatio
    : 1;
  if (aspectRatioDifference > 0.08) return 0;

  try {
    const leftPixels = decodeBase64(left.luminanceBase64);
    const rightPixels = decodeBase64(right.luminanceBase64);
    if (!leftPixels.length || leftPixels.length !== rightPixels.length) return 0;

    let absoluteDifference = 0;
    for (let index = 0; index < leftPixels.length; index += 1) {
      absoluteDifference += Math.abs(leftPixels[index] - rightPixels[index]);
    }

    return Math.max(0, 1 - (absoluteDifference / (leftPixels.length * 255)));
  } catch {
    return 0;
  }
};

export const areVisualImagesEquivalent = (
  left: VisualImageFingerprint,
  right: VisualImageFingerprint,
  minimumSimilarity = 0.955,
): boolean => getVisualImageSimilarity(left, right) >= minimumSimilarity;
