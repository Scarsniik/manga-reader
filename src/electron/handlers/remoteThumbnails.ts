import { protocol } from "electron";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { ensureThumbnailsDir, thumbnailsDir } from "../utils";

const REMOTE_THUMBNAILS_DIR = path.join(thumbnailsDir, "remote");
const DEFAULT_THUMBNAIL_WIDTH = 360;
const MIN_THUMBNAIL_WIDTH = 120;
const MAX_THUMBNAIL_WIDTH = 720;
const DEFAULT_THUMBNAIL_QUALITY = 78;
const MAX_REMOTE_IMAGE_BYTES = 16 * 1024 * 1024;
const REMOTE_THUMBNAIL_USER_AGENT = "Manga Helper Remote Thumbnail/1.0";

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const normalizeHttpUrl = (value: string | null): string => {
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) {
    return "";
  }

  try {
    const parsed = new URL(trimmedValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
};

const buildCachePath = (sourceUrl: string, width: number, quality: number): string => {
  const hash = crypto
    .createHash("sha1")
    .update(`${sourceUrl}\n${width}\n${quality}`)
    .digest("hex");

  return path.join(REMOTE_THUMBNAILS_DIR, `${hash}.webp`);
};

const readCachedThumbnail = async (cachePath: string): Promise<Buffer | null> => {
  try {
    return await fs.readFile(cachePath);
  } catch {
    return null;
  }
};

const fetchRemoteImage = async (sourceUrl: string, refererUrl: string): Promise<Buffer> => {
  const response = await fetch(sourceUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": REMOTE_THUMBNAIL_USER_AGENT,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(refererUrl ? { Referer: refererUrl } : {}),
    },
  });

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error("Remote image is too large.");
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || (contentType && !contentType.startsWith("image/"))) {
    throw new Error("Remote URL did not return an image.");
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  if (sourceBuffer.length > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error("Remote image is too large.");
  }

  return sourceBuffer;
};

const buildRemoteThumbnail = async (
  sourceUrl: string,
  refererUrl: string,
  width: number,
  quality: number,
): Promise<Buffer> => {
  await ensureThumbnailsDir();
  await fs.mkdir(REMOTE_THUMBNAILS_DIR, { recursive: true });

  const cachePath = buildCachePath(sourceUrl, width, quality);
  const cachedThumbnail = await readCachedThumbnail(cachePath);
  if (cachedThumbnail) {
    return cachedThumbnail;
  }

  const sourceBuffer = await fetchRemoteImage(sourceUrl, refererUrl);
  const thumbnailBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();

  await fs.writeFile(cachePath, thumbnailBuffer);
  return thumbnailBuffer;
};

export const registerRemoteThumbnailProtocol = (): void => {
  protocol.registerBufferProtocol("scraper-thumb", (request, callback) => {
    void (async () => {
      try {
        const parsedRequest = new URL(request.url);
        const sourceUrl = normalizeHttpUrl(parsedRequest.searchParams.get("url"));
        const refererUrl = normalizeHttpUrl(parsedRequest.searchParams.get("referer"));
        const width = clampInteger(
          parsedRequest.searchParams.get("width"),
          DEFAULT_THUMBNAIL_WIDTH,
          MIN_THUMBNAIL_WIDTH,
          MAX_THUMBNAIL_WIDTH,
        );
        const quality = clampInteger(
          parsedRequest.searchParams.get("quality"),
          DEFAULT_THUMBNAIL_QUALITY,
          50,
          90,
        );

        if (!sourceUrl) {
          callback({ error: -300 });
          return;
        }

        const data = await buildRemoteThumbnail(sourceUrl, refererUrl, width, quality);
        callback({
          data,
          mimeType: "image/webp",
        });
      } catch (error) {
        console.warn("Failed to build remote thumbnail", error);
        callback({ error: -2 });
      }
    })();
  });
};
