import React, { useEffect, useState } from "react";
import {
  buildScraperFaviconImageUrl,
  discoverScraperFaviconUrls,
  getInitialScraperFaviconUrls,
  rememberScraperFaviconUrl,
} from "@/renderer/utils/scraperFavicon";

type Props = {
  baseUrl: string;
  className?: string;
  fallback: React.ReactNode;
  scraperId: string;
};

export default function ScraperFavicon({ baseUrl, className, fallback, scraperId }: Props) {
  const [faviconUrls, setFaviconUrls] = useState<string[]>(() => (
    getInitialScraperFaviconUrls(scraperId, baseUrl)
  ));
  const [faviconIndex, setFaviconIndex] = useState(0);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [hasDiscoveredFavicons, setHasDiscoveredFavicons] = useState(false);

  useEffect(() => {
    setFaviconUrls(getInitialScraperFaviconUrls(scraperId, baseUrl));
    setFaviconIndex(0);
    setFaviconFailed(false);
    setHasDiscoveredFavicons(false);
  }, [baseUrl, scraperId]);

  const currentFaviconUrl = faviconUrls[faviconIndex] ?? null;

  const handleFaviconError = async () => {
    if (faviconIndex + 1 < faviconUrls.length) {
      setFaviconIndex((currentIndex) => currentIndex + 1);
      return;
    }

    if (!hasDiscoveredFavicons) {
      setHasDiscoveredFavicons(true);
      const discoveredUrls = await discoverScraperFaviconUrls(scraperId, baseUrl);
      const nextUrls = discoveredUrls.filter((url) => !faviconUrls.includes(url));
      if (nextUrls.length > 0) {
        setFaviconUrls((currentUrls) => [...currentUrls, ...nextUrls]);
        setFaviconIndex(faviconUrls.length);
        return;
      }
    }

    setFaviconFailed(true);
  };

  if (!currentFaviconUrl || faviconFailed) {
    return fallback;
  }

  return (
    <img
      className={className}
      src={buildScraperFaviconImageUrl(currentFaviconUrl, baseUrl)}
      alt=""
      onError={() => { void handleFaviconError(); }}
      onLoad={() => rememberScraperFaviconUrl(scraperId, baseUrl, currentFaviconUrl)}
    />
  );
}
