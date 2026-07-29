import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ScraperRecord } from "@/shared/scraper";

type FavoriteRecord = {
  id: string;
};

type Options<TFavorite extends FavoriteRecord> = {
  scrapers: ScraperRecord[];
  favorites: TFavorite[];
  loading: boolean;
  initialFavoriteId?: string | null;
  routeSyncEnabled?: boolean;
  readFavoriteRouteId: (search: string) => string | null;
  writeFavoriteRouteState: (search: string, favoriteId: string | null) => string;
};

export default function useScraperSourceFavoriteSelection<TFavorite extends FavoriteRecord>({
  scrapers,
  favorites,
  loading,
  initialFavoriteId = null,
  routeSyncEnabled = true,
  readFavoriteRouteId,
  writeFavoriteRouteState,
}: Options<TFavorite>) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeFavoriteId = useMemo(
    () => routeSyncEnabled ? readFavoriteRouteId(location.search) : initialFavoriteId,
    [initialFavoriteId, location.search, readFavoriteRouteId, routeSyncEnabled],
  );
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(routeFavoriteId);
  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const selectedFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === selectedFavoriteId) ?? null,
    [favorites, selectedFavoriteId],
  );

  useEffect(() => {
    if (!routeSyncEnabled || routeFavoriteId === selectedFavoriteId) {
      return;
    }

    if (!routeFavoriteId) {
      setSelectedFavoriteId(null);
      return;
    }

    if (loading || favorites.some((favorite) => favorite.id === routeFavoriteId)) {
      setSelectedFavoriteId(routeFavoriteId);
    }
  }, [favorites, loading, routeFavoriteId, selectedFavoriteId]);

  useEffect(() => {
    if (!selectedFavoriteId || loading || favorites.some((favorite) => favorite.id === selectedFavoriteId)) {
      return;
    }

    if (routeFavoriteId === selectedFavoriteId) {
      navigate(
        {
          pathname: location.pathname,
          search: writeFavoriteRouteState(location.search, null),
        },
        { replace: true },
      );
    }

    setSelectedFavoriteId(null);
  }, [
    favorites,
    loading,
    location.pathname,
    location.search,
    navigate,
    routeFavoriteId,
    routeSyncEnabled,
    selectedFavoriteId,
    writeFavoriteRouteState,
  ]);

  const handleSelectFavorite = useCallback((favoriteId: string | null) => {
    setSelectedFavoriteId(favoriteId);
    if (!routeSyncEnabled) {
      return;
    }
    navigate({
      pathname: location.pathname,
      search: writeFavoriteRouteState(location.search, favoriteId),
    });
  }, [location.pathname, location.search, navigate, routeSyncEnabled, writeFavoriteRouteState]);

  return {
    location,
    navigate,
    selectedFavoriteId,
    selectedFavorite,
    scrapersById,
    handleSelectFavorite,
  };
}
