import sharp from "sharp";
import type {
  VisualImageFingerprint,
  VisualImageFingerprintInput,
  VisualImageFingerprintRequest,
  VisualImageFingerprintResponse,
  VisualImageFingerprintResult,
} from "../../shared/visualImageFingerprint";
import { buildRemoteThumbnail } from "./remoteThumbnails";

const FINGERPRINT_SIZE = 24;
const MAX_REQUEST_IMAGE_COUNT = 2_000;
const FINGERPRINT_CONCURRENCY = 6;
const MAX_FINGERPRINT_CACHE_ENTRIES = 5_000;
const fingerprintCache = new Map<string, Promise<VisualImageFingerprint>>();

const normalizeHttpUrl = (value?: string): string => {
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) return "";

  try {
    const parsed = new URL(trimmedValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
};

export const createVisualImageFingerprint = async (
  imageBuffer: Buffer,
): Promise<VisualImageFingerprint> => {
  const sourceImage = sharp(imageBuffer).rotate();
  const metadata = await sourceImage.metadata();
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (!width || !height) throw new Error("Image dimensions are unavailable.");

  const luminance = await sourceImage
    .resize(FINGERPRINT_SIZE, FINGERPRINT_SIZE, { fit: "fill" })
    .grayscale()
    .blur(1)
    .normalize()
    .raw()
    .toBuffer();

  return {
    version: 1,
    width: FINGERPRINT_SIZE,
    height: FINGERPRINT_SIZE,
    luminanceBase64: luminance.toString("base64"),
    aspectRatio: width / height,
  };
};

const buildCacheKey = (input: VisualImageFingerprintInput): string => (
  `${input.url.trim()}\n${String(input.refererUrl ?? "").trim()}`
);

const loadVisualImageFingerprint = (
  input: VisualImageFingerprintInput,
): Promise<VisualImageFingerprint> => {
  const sourceUrl = normalizeHttpUrl(input.url);
  const refererUrl = normalizeHttpUrl(input.refererUrl);
  if (!sourceUrl) return Promise.reject(new Error("Unsupported image URL."));

  const cacheKey = buildCacheKey({ ...input, url: sourceUrl, refererUrl });
  const cached = fingerprintCache.get(cacheKey);
  if (cached) return cached;

  const fingerprintPromise = buildRemoteThumbnail(sourceUrl, refererUrl, 360, 78)
    .then(createVisualImageFingerprint)
    .catch((error) => {
      fingerprintCache.delete(cacheKey);
      throw error;
    });
  if (fingerprintCache.size >= MAX_FINGERPRINT_CACHE_ENTRIES) {
    const oldestCacheKey = fingerprintCache.keys().next().value;
    if (oldestCacheKey) fingerprintCache.delete(oldestCacheKey);
  }
  fingerprintCache.set(cacheKey, fingerprintPromise);
  return fingerprintPromise;
};

const processInput = async (
  input: VisualImageFingerprintInput,
): Promise<VisualImageFingerprintResult> => {
  try {
    return {
      key: String(input.key ?? ""),
      fingerprint: await loadVisualImageFingerprint(input),
    };
  } catch (error) {
    return {
      key: String(input.key ?? ""),
      error: error instanceof Error ? error.message : "Image fingerprinting failed.",
    };
  }
};

export const getVisualImageFingerprints = async (
  request: VisualImageFingerprintRequest,
): Promise<VisualImageFingerprintResponse> => {
  const images = Array.isArray(request?.images)
    ? request.images.slice(0, MAX_REQUEST_IMAGE_COUNT)
    : [];
  const results = new Array<VisualImageFingerprintResult>(images.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < images.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await processInput(images[index]);
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(FINGERPRINT_CONCURRENCY, images.length) },
    () => worker(),
  ));
  return { results };
};
