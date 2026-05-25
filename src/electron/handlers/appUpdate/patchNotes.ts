import { appendAppUpdateLog } from "./log";
import { getGithubApiHeaders, resolveGithubRepository } from "./github";
import type {
    AppUpdatePatchNote,
    AppUpdatePatchNotesQuery,
    AppUpdatePatchNotesResult,
} from "./types";

type SemVerTuple = [number, number, number];

type GithubReleaseApiEntry = {
    tag_name?: string;
    name?: string | null;
    body?: string | null;
    html_url?: string | null;
    published_at?: string | null;
    draft?: boolean;
    prerelease?: boolean;
};

type PatchNotesCacheEntry = {
    fetchedAt: number;
    patchNotes: AppUpdatePatchNote[];
    repository: string;
};

const PATCH_NOTES_CACHE_TTL_MS = 5 * 60 * 1000;
const PATCH_NOTES_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_PATCH_NOTES_LIMIT = 20;
const MAX_PATCH_NOTES_LIMIT = 50;

let patchNotesCache: PatchNotesCacheEntry | null = null;
let patchNotesCachePromise: Promise<PatchNotesCacheEntry> | null = null;
let patchNotesCachePromiseRepository: string | null = null;

const parseSemVer = (value?: string | null): SemVerTuple | null => {
    const match = String(value || "").trim().match(/^(?:v)?(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        return null;
    }

    return [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
    ];
};

const compareSemVer = (left: SemVerTuple, right: SemVerTuple): number => {
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] - right[index];
        }
    }

    return 0;
};

const isGeneratedPatchNotesBody = (value: string): boolean => {
    const lines = value
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/^#/.test(line));

    if (lines.length !== 3) {
        return false;
    }

    return /^- Application release for Scaramanga\.$/i.test(lines[0])
        && /^- Version:\s+\d+\.\d+\.\d+$/i.test(lines[1])
        && /^- Generated:\s+/i.test(lines[2]);
};

const normalizePatchNotesBody = (value: string | null | undefined): { body: string; hasDetails: boolean } => {
    const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
    if (!normalized || isGeneratedPatchNotesBody(normalized)) {
        return {
            body: "",
            hasDetails: false,
        };
    }

    return {
        body: normalized,
        hasDetails: true,
    };
};

const WINDOWS_1252_BYTE_BY_CODE_POINT = new Map<number, number>([
    [0x20ac, 0x80],
    [0x201a, 0x82],
    [0x0192, 0x83],
    [0x201e, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02c6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8a],
    [0x2039, 0x8b],
    [0x0152, 0x8c],
    [0x017d, 0x8e],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201c, 0x93],
    [0x201d, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02dc, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9a],
    [0x203a, 0x9b],
    [0x0153, 0x9c],
    [0x017e, 0x9e],
    [0x0178, 0x9f],
]);

const getWindows1252Byte = (value: string): number | null => {
    const charCode = value.charCodeAt(0);
    if (charCode <= 0xff) {
        return charCode;
    }

    return WINDOWS_1252_BYTE_BY_CODE_POINT.get(charCode) ?? null;
};

const countMojibakeSequences = (value: string): number => {
    let count = 0;

    for (let index = 0; index < value.length - 1; index += 1) {
        const firstByte = getWindows1252Byte(value[index]);
        const secondByte = getWindows1252Byte(value[index + 1]);
        if (
            firstByte !== null
            && secondByte !== null
            && firstByte >= 0xc2
            && firstByte <= 0xf4
            && secondByte >= 0x80
            && secondByte <= 0xbf
        ) {
            count += 1;
        }
    }

    return count;
};

const decodeWindows1252BytesAsUtf8 = (value: string): string | null => {
    const bytes = new Uint8Array(value.length);

    for (let index = 0; index < value.length; index += 1) {
        const byte = getWindows1252Byte(value[index]);
        if (byte === null) {
            return null;
        }

        bytes[index] = byte;
    }

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
};

const repairMojibake = (value: string): string => {
    const mojibakeSequenceCount = countMojibakeSequences(value);
    if (mojibakeSequenceCount === 0) {
        return value;
    }

    const repaired = decodeWindows1252BytesAsUtf8(value);
    if (!repaired || countMojibakeSequences(repaired) >= mojibakeSequenceCount) {
        return value;
    }

    return repaired;
};

const normalizePatchNote = (release: GithubReleaseApiEntry): AppUpdatePatchNote | null => {
    const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    const versionMatch = tagName.match(/^v(?<version>\d+\.\d+\.\d+)$/);
    if (!versionMatch?.groups?.version) {
        return null;
    }

    const { body, hasDetails } = normalizePatchNotesBody(repairMojibake(release.body || ""));
    const title = typeof release.name === "string" && release.name.trim().length > 0
        ? repairMojibake(release.name.trim())
        : tagName;

    return {
        version: versionMatch.groups.version,
        tagName,
        title,
        publishedAt: typeof release.published_at === "string" ? release.published_at : null,
        releaseUrl: typeof release.html_url === "string" && release.html_url.trim().length > 0
            ? release.html_url.trim()
            : null,
        body,
        hasDetails,
    };
};

const getPatchNotesCacheEntry = async (): Promise<PatchNotesCacheEntry> => {
    const repository = await resolveGithubRepository();
    if (!repository) {
        throw new Error("Le depot GitHub des patchnotes n'est pas configure.");
    }

    const repositoryKey = `${repository.owner}/${repository.repo}`;
    const now = Date.now();
    if (
        patchNotesCache
        && patchNotesCache.repository === repositoryKey
        && now - patchNotesCache.fetchedAt <= PATCH_NOTES_CACHE_TTL_MS
    ) {
        return patchNotesCache;
    }

    if (patchNotesCachePromise && patchNotesCachePromiseRepository === repositoryKey) {
        return patchNotesCachePromise;
    }

    patchNotesCachePromiseRepository = repositoryKey;
    patchNotesCachePromise = (async () => {
        const response = await fetch(
            `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases?per_page=100`,
            {
                headers: getGithubApiHeaders(),
                signal: AbortSignal.timeout(PATCH_NOTES_FETCH_TIMEOUT_MS),
            },
        );

        if (!response.ok) {
            throw new Error(`GitHub releases request failed with status ${response.status}.`);
        }

        const releases = await response.json() as GithubReleaseApiEntry[];
        const patchNotes = releases
            .filter((release) => !release.draft && !release.prerelease)
            .map(normalizePatchNote)
            .filter((entry): entry is AppUpdatePatchNote => entry !== null);

        const nextCacheEntry: PatchNotesCacheEntry = {
            fetchedAt: Date.now(),
            patchNotes,
            repository: repositoryKey,
        };

        patchNotesCache = nextCacheEntry;
        return nextCacheEntry;
    })().finally(() => {
        patchNotesCachePromise = null;
        patchNotesCachePromiseRepository = null;
    });

    return patchNotesCachePromise;
};

const isPatchNoteInRange = (
    note: AppUpdatePatchNote,
    fromVersion?: string | null,
    toVersion?: string | null,
): boolean => {
    const noteVersion = parseSemVer(note.version);
    if (!noteVersion) {
        return false;
    }

    const minVersion = parseSemVer(fromVersion);
    if (minVersion && compareSemVer(noteVersion, minVersion) <= 0) {
        return false;
    }

    const maxVersion = parseSemVer(toVersion);
    if (maxVersion && compareSemVer(noteVersion, maxVersion) > 0) {
        return false;
    }

    return true;
};

const resolvePatchNotesLimit = (query?: AppUpdatePatchNotesQuery): number | null => {
    const rawLimit = Number(query?.limit);
    if (Number.isFinite(rawLimit) && rawLimit > 0) {
        return Math.min(MAX_PATCH_NOTES_LIMIT, Math.floor(rawLimit));
    }

    if (!query?.fromVersion && !query?.toVersion) {
        return DEFAULT_PATCH_NOTES_LIMIT;
    }

    return null;
};

export const getAppUpdatePatchNotes = async (
    query?: AppUpdatePatchNotesQuery,
): Promise<AppUpdatePatchNotesResult> => {
    try {
        const cacheEntry = await getPatchNotesCacheEntry();
        const matchingPatchNotes = cacheEntry.patchNotes.filter((note) => (
            isPatchNoteInRange(note, query?.fromVersion, query?.toVersion)
        ));

        const limit = resolvePatchNotesLimit(query);
        const patchNotes = limit ? matchingPatchNotes.slice(0, limit) : matchingPatchNotes;

        return {
            patchNotes,
            fetchedAt: new Date(cacheEntry.fetchedAt).toISOString(),
            repository: cacheEntry.repository,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error || "Unknown patch notes error");
        await appendAppUpdateLog("Unable to load app update patch notes", {
            error: errorMessage,
            fromVersion: query?.fromVersion || null,
            toVersion: query?.toVersion || null,
            limit: query?.limit ?? null,
        });
        throw new Error(errorMessage);
    }
};
