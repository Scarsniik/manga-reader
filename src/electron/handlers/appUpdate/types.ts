export type AppUpdateState =
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";

export type AppUpdateNotificationKind = "info" | "success" | "warning" | "error";

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
