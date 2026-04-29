const normalizeHttpUrl = (value?: string | null): string => {
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

const hasElectronApi = (): boolean => (
  typeof window !== "undefined" && Boolean((window as any).api)
);

export const buildRemoteThumbnailUrl = (
  imageUrl?: string | null,
  refererUrl?: string | null,
): string | null => {
  const sourceUrl = normalizeHttpUrl(imageUrl);
  if (!sourceUrl || !hasElectronApi()) {
    return imageUrl?.trim() || null;
  }

  const params = new URLSearchParams({
    url: sourceUrl,
    width: "360",
    quality: "78",
  });
  const normalizedRefererUrl = normalizeHttpUrl(refererUrl);
  if (normalizedRefererUrl) {
    params.set("referer", normalizedRefererUrl);
  }

  return `scraper-thumb://image?${params.toString()}`;
};
