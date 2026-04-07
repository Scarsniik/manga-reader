import path from "path";

export const resolveLocalProtocolPath = (localUrl: string): string => {
    let localPath = localUrl.replace(/^local:\/\//, "");
    if (localPath.startsWith("/")) {
        localPath = localPath.slice(1);
    }

    try {
        return path.normalize(decodeURIComponent(localPath));
    } catch {
        return path.normalize(localPath);
    }
};
