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

const normalizePatchNote = (release: GithubReleaseApiEntry): AppUpdatePatchNote | null => {
    const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    const versionMatch = tagName.match(/^v(?<version>\d+\.\d+\.\d+)$/);
    if (!versionMatch?.groups?.version) {
        return null;
    }

    const { body, hasDetails } = normalizePatchNotesBody(release.body);
    const title = typeof release.name === "string" && release.name.trim().length > 0
        ? release.name.trim()
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
