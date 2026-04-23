import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";

export type GithubRepository = {
    owner: string;
    repo: string;
};

const GITHUB_OWNER_ENV_NAMES = [
    "APP_UPDATE_GITHUB_OWNER",
    "SCARAMANGA_APP_UPDATE_GITHUB_OWNER",
];
const GITHUB_REPO_ENV_NAMES = [
    "APP_UPDATE_GITHUB_REPO",
    "SCARAMANGA_APP_UPDATE_GITHUB_REPO",
];

const parseGithubRepository = (value: unknown): GithubRepository | null => {
    const input = typeof value === "string"
        ? value
        : (value && typeof value === "object" && "url" in value ? String((value as { url?: unknown }).url || "") : "");

    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const normalized = trimmed
        .replace(/^git\+/, "")
        .replace(/\.git$/i, "");

    const githubMatch = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/i);
    if (!githubMatch?.groups?.owner || !githubMatch.groups.repo) {
        return null;
    }

    return {
        owner: githubMatch.groups.owner,
        repo: githubMatch.groups.repo,
    };
};

const readPackageMetadata = async (): Promise<Record<string, unknown> | null> => {
    try {
        const packageJsonPath = path.join(app.getAppPath(), "package.json");
        const raw = await fs.readFile(packageJsonPath, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
};

export const resolveGithubRepository = async (): Promise<GithubRepository | null> => {
    const owner = GITHUB_OWNER_ENV_NAMES
        .map((name) => process.env[name]?.trim())
        .find((value) => value && value.length > 0);
    const repo = GITHUB_REPO_ENV_NAMES
        .map((name) => process.env[name]?.trim())
        .find((value) => value && value.length > 0);

    if (owner && repo) {
        return { owner, repo };
    }

    const packageMetadata = await readPackageMetadata();
    return parseGithubRepository(packageMetadata?.repository);
};

export const buildReleaseUrl = async (version?: string | null): Promise<string | null> => {
    const repository = await resolveGithubRepository();
    if (!repository) {
        return null;
    }

    const baseUrl = `https://github.com/${repository.owner}/${repository.repo}/releases`;
    if (version && version.trim().length > 0) {
        return `${baseUrl}/tag/v${version.trim()}`;
    }

    return `${baseUrl}/latest`;
};

export const getGithubApiHeaders = (): Record<string, string> => ({
    Accept: "application/vnd.github+json",
    "User-Agent": `${app.getName() || "scaramanga"}/app-update`,
    "X-GitHub-Api-Version": "2022-11-28",
});
