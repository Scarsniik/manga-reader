export type MangaCorrespondenceSafetySettings = {
  enabled: boolean;
  emptyPageGuardEnabled: boolean;
  consecutiveUnproductivePageLimit: number;
  unboundedPageLimitEnabled: boolean;
  unboundedPageLimit: number;
  authorExpansionGuardEnabled: boolean;
  abnormalAuthorLimit: number;
  autoInvalidateUnproductiveTitles: boolean;
  autoInvalidateMinCandidateCount: number;
  taskExpansionGuardEnabled: boolean;
  maxDiscoveryTaskCount: number;
  retainedPotentialGuardEnabled: boolean;
  retainedPotentialCount: number;
};

export const DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS: MangaCorrespondenceSafetySettings = {
  enabled: true,
  emptyPageGuardEnabled: true,
  consecutiveUnproductivePageLimit: 3,
  unboundedPageLimitEnabled: true,
  unboundedPageLimit: 50,
  authorExpansionGuardEnabled: true,
  abnormalAuthorLimit: 12,
  autoInvalidateUnproductiveTitles: true,
  autoInvalidateMinCandidateCount: 40,
  taskExpansionGuardEnabled: true,
  maxDiscoveryTaskCount: 40,
  retainedPotentialGuardEnabled: true,
  retainedPotentialCount: 150,
};

export const DEFAULT_BACKGROUND_SEARCH_STALL_WARNING_MINUTES = 3;

export type MangaCorrespondenceSafetyParams = {
  mangaCorrespondenceSafetyEnabled: boolean;
  mangaCorrespondenceEmptyPageGuardEnabled: boolean;
  mangaCorrespondenceConsecutiveUnproductivePageLimit: number;
  mangaCorrespondenceUnboundedPageLimitEnabled: boolean;
  mangaCorrespondenceUnboundedPageLimit: number;
  mangaCorrespondenceAuthorExpansionGuardEnabled: boolean;
  mangaCorrespondenceAbnormalAuthorLimit: number;
  mangaCorrespondenceAutoInvalidateUnproductiveTitles: boolean;
  mangaCorrespondenceAutoInvalidateMinCandidateCount: number;
  mangaCorrespondenceTaskExpansionGuardEnabled: boolean;
  mangaCorrespondenceMaxDiscoveryTaskCount: number;
  mangaCorrespondenceRetainedPotentialGuardEnabled: boolean;
  mangaCorrespondenceRetainedPotentialCount: number;
  backgroundSearchStallWarningEnabled: boolean;
  backgroundSearchStallWarningMinutes: number;
};

export const MANGA_CORRESPONDENCE_SAFETY_PARAM_DEFAULTS: MangaCorrespondenceSafetyParams = {
  mangaCorrespondenceSafetyEnabled: DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.enabled,
  mangaCorrespondenceEmptyPageGuardEnabled:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.emptyPageGuardEnabled,
  mangaCorrespondenceConsecutiveUnproductivePageLimit:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.consecutiveUnproductivePageLimit,
  mangaCorrespondenceUnboundedPageLimitEnabled:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.unboundedPageLimitEnabled,
  mangaCorrespondenceUnboundedPageLimit:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.unboundedPageLimit,
  mangaCorrespondenceAuthorExpansionGuardEnabled:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.authorExpansionGuardEnabled,
  mangaCorrespondenceAbnormalAuthorLimit:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.abnormalAuthorLimit,
  mangaCorrespondenceAutoInvalidateUnproductiveTitles:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.autoInvalidateUnproductiveTitles,
  mangaCorrespondenceAutoInvalidateMinCandidateCount:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.autoInvalidateMinCandidateCount,
  mangaCorrespondenceTaskExpansionGuardEnabled:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.taskExpansionGuardEnabled,
  mangaCorrespondenceMaxDiscoveryTaskCount:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.maxDiscoveryTaskCount,
  mangaCorrespondenceRetainedPotentialGuardEnabled:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.retainedPotentialGuardEnabled,
  mangaCorrespondenceRetainedPotentialCount:
    DEFAULT_MANGA_CORRESPONDENCE_SAFETY_SETTINGS.retainedPotentialCount,
  backgroundSearchStallWarningEnabled: true,
  backgroundSearchStallWarningMinutes: DEFAULT_BACKGROUND_SEARCH_STALL_WARNING_MINUTES,
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => (
  typeof value === "boolean" ? value : fallback
);

const normalizeInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
    : fallback;
};

export const normalizeMangaCorrespondenceSafetyParams = (
  value: unknown,
): MangaCorrespondenceSafetyParams => {
  const settings = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const defaults = MANGA_CORRESPONDENCE_SAFETY_PARAM_DEFAULTS;
  return {
    mangaCorrespondenceSafetyEnabled: normalizeBoolean(
      settings.mangaCorrespondenceSafetyEnabled,
      defaults.mangaCorrespondenceSafetyEnabled,
    ),
    mangaCorrespondenceEmptyPageGuardEnabled: normalizeBoolean(
      settings.mangaCorrespondenceEmptyPageGuardEnabled,
      defaults.mangaCorrespondenceEmptyPageGuardEnabled,
    ),
    mangaCorrespondenceConsecutiveUnproductivePageLimit: normalizeInteger(
      settings.mangaCorrespondenceConsecutiveUnproductivePageLimit,
      defaults.mangaCorrespondenceConsecutiveUnproductivePageLimit,
      1,
      20,
    ),
    mangaCorrespondenceUnboundedPageLimitEnabled: normalizeBoolean(
      settings.mangaCorrespondenceUnboundedPageLimitEnabled,
      defaults.mangaCorrespondenceUnboundedPageLimitEnabled,
    ),
    mangaCorrespondenceUnboundedPageLimit: normalizeInteger(
      settings.mangaCorrespondenceUnboundedPageLimit,
      defaults.mangaCorrespondenceUnboundedPageLimit,
      1,
      250,
    ),
    mangaCorrespondenceAuthorExpansionGuardEnabled: normalizeBoolean(
      settings.mangaCorrespondenceAuthorExpansionGuardEnabled,
      defaults.mangaCorrespondenceAuthorExpansionGuardEnabled,
    ),
    mangaCorrespondenceAbnormalAuthorLimit: normalizeInteger(
      settings.mangaCorrespondenceAbnormalAuthorLimit,
      defaults.mangaCorrespondenceAbnormalAuthorLimit,
      2,
      100,
    ),
    mangaCorrespondenceAutoInvalidateUnproductiveTitles: normalizeBoolean(
      settings.mangaCorrespondenceAutoInvalidateUnproductiveTitles,
      defaults.mangaCorrespondenceAutoInvalidateUnproductiveTitles,
    ),
    mangaCorrespondenceAutoInvalidateMinCandidateCount: normalizeInteger(
      settings.mangaCorrespondenceAutoInvalidateMinCandidateCount,
      defaults.mangaCorrespondenceAutoInvalidateMinCandidateCount,
      1,
      10_000,
    ),
    mangaCorrespondenceTaskExpansionGuardEnabled: normalizeBoolean(
      settings.mangaCorrespondenceTaskExpansionGuardEnabled,
      defaults.mangaCorrespondenceTaskExpansionGuardEnabled,
    ),
    mangaCorrespondenceMaxDiscoveryTaskCount: normalizeInteger(
      settings.mangaCorrespondenceMaxDiscoveryTaskCount,
      defaults.mangaCorrespondenceMaxDiscoveryTaskCount,
      5,
      500,
    ),
    mangaCorrespondenceRetainedPotentialGuardEnabled: normalizeBoolean(
      settings.mangaCorrespondenceRetainedPotentialGuardEnabled,
      defaults.mangaCorrespondenceRetainedPotentialGuardEnabled,
    ),
    mangaCorrespondenceRetainedPotentialCount: normalizeInteger(
      settings.mangaCorrespondenceRetainedPotentialCount,
      defaults.mangaCorrespondenceRetainedPotentialCount,
      10,
      1_000,
    ),
    backgroundSearchStallWarningEnabled: normalizeBoolean(
      settings.backgroundSearchStallWarningEnabled,
      defaults.backgroundSearchStallWarningEnabled,
    ),
    backgroundSearchStallWarningMinutes: normalizeInteger(
      settings.backgroundSearchStallWarningMinutes,
      defaults.backgroundSearchStallWarningMinutes,
      1,
      60,
    ),
  };
};

export const buildMangaCorrespondenceSafetySettings = (
  value: unknown,
): MangaCorrespondenceSafetySettings => {
  const settings = normalizeMangaCorrespondenceSafetyParams(value);
  return {
    enabled: settings.mangaCorrespondenceSafetyEnabled,
    emptyPageGuardEnabled: settings.mangaCorrespondenceEmptyPageGuardEnabled,
    consecutiveUnproductivePageLimit: settings.mangaCorrespondenceConsecutiveUnproductivePageLimit,
    unboundedPageLimitEnabled: settings.mangaCorrespondenceUnboundedPageLimitEnabled,
    unboundedPageLimit: settings.mangaCorrespondenceUnboundedPageLimit,
    authorExpansionGuardEnabled: settings.mangaCorrespondenceAuthorExpansionGuardEnabled,
    abnormalAuthorLimit: settings.mangaCorrespondenceAbnormalAuthorLimit,
    autoInvalidateUnproductiveTitles: settings.mangaCorrespondenceAutoInvalidateUnproductiveTitles,
    autoInvalidateMinCandidateCount: settings.mangaCorrespondenceAutoInvalidateMinCandidateCount,
    taskExpansionGuardEnabled: settings.mangaCorrespondenceTaskExpansionGuardEnabled,
    maxDiscoveryTaskCount: settings.mangaCorrespondenceMaxDiscoveryTaskCount,
    retainedPotentialGuardEnabled: settings.mangaCorrespondenceRetainedPotentialGuardEnabled,
    retainedPotentialCount: settings.mangaCorrespondenceRetainedPotentialCount,
  };
};

export const normalizeMangaCorrespondenceSafetySettings = (
  value: Partial<MangaCorrespondenceSafetySettings> | null | undefined,
): MangaCorrespondenceSafetySettings => buildMangaCorrespondenceSafetySettings({
  mangaCorrespondenceSafetyEnabled: value?.enabled,
  mangaCorrespondenceEmptyPageGuardEnabled: value?.emptyPageGuardEnabled,
  mangaCorrespondenceConsecutiveUnproductivePageLimit: value?.consecutiveUnproductivePageLimit,
  mangaCorrespondenceUnboundedPageLimitEnabled: value?.unboundedPageLimitEnabled,
  mangaCorrespondenceUnboundedPageLimit: value?.unboundedPageLimit,
  mangaCorrespondenceAuthorExpansionGuardEnabled: value?.authorExpansionGuardEnabled,
  mangaCorrespondenceAbnormalAuthorLimit: value?.abnormalAuthorLimit,
  mangaCorrespondenceAutoInvalidateUnproductiveTitles: value?.autoInvalidateUnproductiveTitles,
  mangaCorrespondenceAutoInvalidateMinCandidateCount: value?.autoInvalidateMinCandidateCount,
  mangaCorrespondenceTaskExpansionGuardEnabled: value?.taskExpansionGuardEnabled,
  mangaCorrespondenceMaxDiscoveryTaskCount: value?.maxDiscoveryTaskCount,
  mangaCorrespondenceRetainedPotentialGuardEnabled: value?.retainedPotentialGuardEnabled,
  mangaCorrespondenceRetainedPotentialCount: value?.retainedPotentialCount,
});
