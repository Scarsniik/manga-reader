export type AppUpdateState =
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";

export type AppUpdateNotificationKind = "info" | "success" | "warning" | "error";

export type AppUpdatePatchNote = {
    version: string;
    tagName: string;
    title: string;
    publishedAt: string | null;
    releaseUrl: string | null;
    body: string;
    hasDetails: boolean;
};

export type AppUpdatePatchNotesQuery = {
    limit?: number;
    fromVersion?: string | null;
    toVersion?: string | null;
};

export type AppUpdatePatchNotesResult = {
    patchNotes: AppUpdatePatchNote[];
    fetchedAt: string;
    repository: string | null;
};

export type AppUpdateStatus = {
    state: AppUpdateState;
    currentVersion: string;
    availableVersion: string | null;
    lastCheckedAt: string | null;
    progressPercent: number;
    transferredBytes: number;
    totalBytes: number;
    bytesPerSecond: number;
    releaseDate: string | null;
    releaseName: string | null;
    releaseUrl: string | null;
    errorMessage: string | null;
    message: string | null;
    isSupported: boolean;
    supportReason: string | null;
    isPortable: boolean;
    autoCheckEnabled: boolean;
    devModeEnabled: boolean;
};

export type AppUpdateNotificationPayload = {
    kind: AppUpdateNotificationKind;
    title: string;
    message: string;
    status: AppUpdateStatus;
    sentAt: string;
};
