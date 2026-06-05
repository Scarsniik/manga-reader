import {
  getMangaTitleRomanizationTargets,
  type MatchableManga,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import { loadAdvancedJapaneseRomanizationVariants } from "@/renderer/utils/advancedJapaneseRomanization";

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const normalizeRomanizationTarget = (value: string): string => (
  value.trim().replace(/\s+/g, " ")
);

const getAdvancedRomanizedVariantsForTargets = (
  targets: string[],
  variantsByText: Map<string, string[]>,
): string[] => (
  uniqueValues(targets.flatMap((target) => variantsByText.get(normalizeRomanizationTarget(target)) ?? []))
);

export const enrichMatchableMangasWithJapaneseRomanization = async <T extends MatchableManga>(
  mangas: T[],
): Promise<T[]> => {
  if (!mangas.length) {
    return mangas;
  }

  const titleTargetsByManga = new Map<T, string[]>();
  const authorTargetsByManga = new Map<T, string[]>();
  const targets = mangas.flatMap((manga) => {
    const titleTargets = getMangaTitleRomanizationTargets(manga.title);
    const authorTargets = manga.authorNames ?? [];

    titleTargetsByManga.set(manga, titleTargets);
    authorTargetsByManga.set(manga, authorTargets);

    return [
      ...titleTargets,
      ...authorTargets,
    ];
  });
  const variantsByText = await loadAdvancedJapaneseRomanizationVariants(targets);
  if (!variantsByText.size) {
    return mangas;
  }

  return mangas.map((manga) => ({
    ...manga,
    advancedRomanizedTitleVariants: uniqueValues([
      ...(manga.advancedRomanizedTitleVariants ?? []),
      ...getAdvancedRomanizedVariantsForTargets(
        titleTargetsByManga.get(manga) ?? [],
        variantsByText,
      ),
    ]),
    advancedRomanizedAuthorNameVariants: uniqueValues([
      ...(manga.advancedRomanizedAuthorNameVariants ?? []),
      ...getAdvancedRomanizedVariantsForTargets(
        authorTargetsByManga.get(manga) ?? [],
        variantsByText,
      ),
    ]),
  }));
};
