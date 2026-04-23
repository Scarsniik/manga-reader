export {
    checkForAppUpdates,
    downloadAppUpdate,
    getAppUpdateStatus,
    initializeAppUpdate,
    installAppUpdate,
    maybeCheckForUpdatesOnStartup,
    openAppUpdateReleasePage,
    scheduleStartupUpdateCheck,
} from "./service";
export type {
    AppUpdateNotificationKind,
    AppUpdateNotificationPayload,
    AppUpdateState,
    AppUpdateStatus,
} from "./types";
