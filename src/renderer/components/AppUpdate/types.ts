export type AppUpdateState =
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";

export type AppUpdateStatus = {
    state?: AppUpdateState;
    currentVersion?: string;
    availableVersion?: string | null;
    lastCheckedAt?: string | null;
    progressPercent?: number;
    transferredBytes?: number;
    totalBytes?: number;
    bytesPerSecond?: number;
    releaseDate?: string | null;
    releaseName?: string | null;
    releaseUrl?: string | null;
    errorMessage?: string | null;
    message?: string | null;
    isSupported?: boolean;
    supportReason?: string | null;
    isPortable?: boolean;
    autoCheckEnabled?: boolean;
    devModeEnabled?: boolean;
};

export type AppUpdateActionResult = {
    started?: boolean;
    reason?: string | null;
    status?: AppUpdateStatus;
};

export type AppUpdateNotificationPayload = {
    kind?: "info" | "success" | "warning" | "error";
    title?: string;
    message?: string;
    status?: AppUpdateStatus;
    sentAt?: string;
};

export type AppUpdateApi = {
    appUpdateStatus?: () => Promise<AppUpdateStatus>;
    appUpdateCheck?: () => Promise<AppUpdateActionResult>;
    appUpdateDownload?: () => Promise<AppUpdateActionResult>;
    appUpdateInstall?: () => Promise<AppUpdateActionResult>;
    appUpdateOpenReleasePage?: () => Promise<{ opened?: boolean; releaseUrl?: string; error?: string }>;
};

export const APP_UPDATE_NOTIFICATION_EVENT = "app-update-notification";

export const getAppUpdateApi = (): AppUpdateApi => (
    (window.api ?? {}) as AppUpdateApi
);
