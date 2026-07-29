export const normalizeAuthorCorrespondenceTarget = (value: string): string => {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString().replace(/%[0-9a-f]{2}/gi, (encodedByte) => encodedByte.toUpperCase());
  } catch {
    return trimmed
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
  }
};

export const buildAuthorCorrespondenceMatchKey = (
  scraperId: string,
  authorUrl: string,
): string => (
  `${scraperId}::${normalizeAuthorCorrespondenceTarget(authorUrl)}`
);
