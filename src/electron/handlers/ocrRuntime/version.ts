import { app } from "electron";

const parseVersion = (version: string) => {
    const parts = version.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => !Number.isFinite(part))) {
        return null;
    }

    return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
    };
};

const compareVersions = (left: string, right: string) => {
    const parsedLeft = parseVersion(left);
    const parsedRight = parseVersion(right);
    if (!parsedLeft || !parsedRight) {
        return null;
    }

    for (const key of ["major", "minor", "patch"] as const) {
        if (parsedLeft[key] > parsedRight[key]) return 1;
        if (parsedLeft[key] < parsedRight[key]) return -1;
    }

    return 0;
};

const satisfiesVersionToken = (appVersion: string, token: string) => {
    const match = /^(>=|<=|>|<|=)?(.+)$/.exec(token.trim());
    if (!match) {
        return false;
    }

    const operator = match[1] || "=";
    const targetVersion = match[2].trim();
    const comparison = compareVersions(appVersion, targetVersion);
    if (comparison == null) {
        return false;
    }

    if (operator === ">=") return comparison >= 0;
    if (operator === "<=") return comparison <= 0;
    if (operator === ">") return comparison > 0;
    if (operator === "<") return comparison < 0;
    return comparison === 0;
};

export const isAppVersionCompatible = (range: string | null) => {
    if (!range) {
        return true;
    }

    const appVersion = app.getVersion();
    const tokens = range.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 0) {
        return true;
    }

    return tokens.every((token) => satisfiesVersionToken(appVersion, token));
};
